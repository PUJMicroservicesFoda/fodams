import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import {
    isAlternativeRelation,
    isMandatoryRelation,
    isOrRelation,
    type FodaMsAstType,
    type FeatureNode,
    type Model,
    type TradeOffRelation,
    type TradeOffStrength
} from './generated/ast.js';
import type { FodaMsServices } from './foda-ms-module.js';

type FindingSeverity = 'error' | 'warning' | 'info';

export interface AnalysisFinding {
    severity: FindingSeverity;
    message: string;
    node: AstNode;
    property?: string;
}

export interface AnalysisResult {
    score: number;
    rawScore: number;
    activeTradeOffs: number;
    findings: AnalysisFinding[];
}

interface GroupConstraint {
    parent: string;
    children: string[];
    node: AstNode;
}

interface TreeAnalysisContext {
    nodesByFeature: Map<string, FeatureNode[]>;
    parentByChild: Map<string, Set<string>>;
    mandatoryEdges: Array<{ parent: string; child: string; node: AstNode }>;
    orGroups: GroupConstraint[];
    alternativeGroups: GroupConstraint[];
}

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: FodaMsServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.FodaMsValidator;
    const checks: ValidationChecks<FodaMsAstType> = {
        Model: validator.checkModel
    };
    registry.register(checks, validator);
}

export function analyzeModel(model: Model): AnalysisResult {
    const findings: AnalysisFinding[] = [];

    const declarations = model.declarations;
    const declaredNames = new Set<string>();
    const duplicateDeclarations = new Set<string>();

    for (const declaration of declarations) {
        if (declaredNames.has(declaration.name)) {
            duplicateDeclarations.add(declaration.name);
            findings.push({
                severity: 'error',
                message: `Quality attribute '${declaration.name}' is declared more than once.`,
                node: declaration,
                property: 'name'
            });
        }
        declaredNames.add(declaration.name);
    }

    const treeContext = collectTreeAnalysis(model.tree.root);
    for (const [featureName, nodes] of treeContext.nodesByFeature.entries()) {
        if (nodes.length > 1) {
            for (const repeatedNode of nodes.slice(1)) {
                findings.push({
                    severity: 'error',
                    message: `Feature '${featureName}' appears multiple times in the feature tree.`,
                    node: repeatedNode,
                    property: 'feature'
                });
            }
        }
    }

    const selectedNames: string[] = [];
    const selectedSet = new Set<string>();
    for (const selected of model.configuration.selected) {
        if (selected.ref) {
            const featureName = selected.ref.name;
            selectedNames.push(featureName);
            if (selectedSet.has(featureName)) {
                findings.push({
                    severity: 'warning',
                    message: `Feature '${featureName}' is selected multiple times.`,
                    node: model.configuration,
                    property: 'selected'
                });
            }
            selectedSet.add(featureName);
        }
    }

    for (const selectedName of selectedSet) {
        if (!treeContext.nodesByFeature.has(selectedName)) {
            findings.push({
                severity: 'error',
                message: `Selected feature '${selectedName}' is not present in the feature tree.`,
                node: model.configuration,
                property: 'selected'
            });
        }
    }

    for (const [child, parents] of treeContext.parentByChild.entries()) {
        if (selectedSet.has(child)) {
            const hasSelectedParent = [...parents].some(parent => selectedSet.has(parent));
            if (!hasSelectedParent) {
                findings.push({
                    severity: 'error',
                    message: `Feature '${child}' is selected but none of its parents are selected.`,
                    node: treeContext.nodesByFeature.get(child)?.[0] ?? model.tree,
                    property: 'feature'
                });
            }
        }
    }

    for (const edge of treeContext.mandatoryEdges) {
        if (selectedSet.has(edge.parent) && !selectedSet.has(edge.child)) {
            findings.push({
                severity: 'error',
                message: `Feature '${edge.child}' is mandatory when '${edge.parent}' is selected.`,
                node: edge.node,
                property: 'child'
            });
        }
    }

    for (const group of treeContext.orGroups) {
        if (selectedSet.has(group.parent)) {
            const selectedChildren = group.children.filter(child => selectedSet.has(child)).length;
            if (selectedChildren < 1) {
                findings.push({
                    severity: 'error',
                    message: `Or-group under '${group.parent}' requires at least one selected child.`,
                    node: group.node
                });
            }
        }
    }

    for (const group of treeContext.alternativeGroups) {
        if (selectedSet.has(group.parent)) {
            const selectedChildren = group.children.filter(child => selectedSet.has(child)).length;
            if (selectedChildren !== 1) {
                findings.push({
                    severity: 'error',
                    message: `Alternative group under '${group.parent}' requires exactly one selected child.`,
                    node: group.node
                });
            }
        }
    }

    for (const constraint of model.hardConstraints.constraints) {
        const left = constraint.left.ref?.name;
        const right = constraint.right.ref?.name;
        if (!left || !right) {
            continue;
        }
        if (constraint.relation === 'requires' && selectedSet.has(left) && !selectedSet.has(right)) {
            findings.push({
                severity: 'error',
                message: `Hard constraint violated: '${left}' requires '${right}'.`,
                node: constraint,
                property: 'right'
            });
        }
        if (constraint.relation === 'excludes' && selectedSet.has(left) && selectedSet.has(right)) {
            findings.push({
                severity: 'error',
                message: `Hard constraint violated: '${left}' excludes '${right}'.`,
                node: constraint,
                property: 'right'
            });
        }
    }

    let minScore = 0;
    let maxScore = 0;
    let rawScore = 0;
    let activeTradeOffs = 0;

    for (const relation of model.tradeOffs.relations) {
        const evaluated = evaluateTradeOffRelation(relation, selectedSet);
        if (!evaluated) {
            continue;
        }

        activeTradeOffs += 1;
        minScore -= evaluated.weight;
        maxScore += evaluated.weight;
        rawScore += evaluated.value;

        if (evaluated.warningMessage) {
            findings.push({
                severity: 'warning',
                message: evaluated.warningMessage,
                node: relation
            });
        }
    }

    const score = normalizeScore(rawScore, minScore, maxScore);

    // Keep declaration consistency strict even if references already trigger linker errors.
    if (duplicateDeclarations.size > 0) {
        findings.push({
            severity: 'info',
            message: 'Duplicate quality-attribute declarations can distort trade-off analysis.',
            node: model
        });
    }

    return {
        score,
        rawScore,
        activeTradeOffs,
        findings
    };
}

function collectTreeAnalysis(root: FeatureNode): TreeAnalysisContext {
    const context: TreeAnalysisContext = {
        nodesByFeature: new Map<string, FeatureNode[]>(),
        parentByChild: new Map<string, Set<string>>(),
        mandatoryEdges: [],
        orGroups: [],
        alternativeGroups: []
    };

    const visitNode = (node: FeatureNode): void => {
        const nodeFeature = node.feature.ref?.name;
        if (!nodeFeature) {
            return;
        }

        const seenNodes = context.nodesByFeature.get(nodeFeature) ?? [];
        seenNodes.push(node);
        context.nodesByFeature.set(nodeFeature, seenNodes);

        for (const relation of node.relations) {
            if (isMandatoryRelation(relation) || isOrRelation(relation) || isAlternativeRelation(relation)) {
                const children = isMandatoryRelation(relation)
                    ? [relation.child]
                    : relation.children;
                const childFeatures = children
                    .map(child => child.feature.ref?.name)
                    .filter((name): name is string => Boolean(name));

                for (const child of children) {
                    const childFeature = child.feature.ref?.name;
                    if (!childFeature) {
                        continue;
                    }
                    const parents = context.parentByChild.get(childFeature) ?? new Set<string>();
                    parents.add(nodeFeature);
                    context.parentByChild.set(childFeature, parents);
                    visitNode(child);
                }

                if (isMandatoryRelation(relation)) {
                    for (const childFeature of childFeatures) {
                        context.mandatoryEdges.push({
                            parent: nodeFeature,
                            child: childFeature,
                            node: relation
                        });
                    }
                } else if (isOrRelation(relation)) {
                    context.orGroups.push({
                        parent: nodeFeature,
                        children: childFeatures,
                        node: relation
                    });
                } else if (isAlternativeRelation(relation)) {
                    context.alternativeGroups.push({
                        parent: nodeFeature,
                        children: childFeatures,
                        node: relation
                    });
                }
            } else {
                const childFeature = relation.child.feature.ref?.name;
                if (!childFeature) {
                    continue;
                }
                const parents = context.parentByChild.get(childFeature) ?? new Set<string>();
                parents.add(nodeFeature);
                context.parentByChild.set(childFeature, parents);
                visitNode(relation.child);
            }
        }
    };

    visitNode(root);
    return context;
}

function tradeOffWeight(strength: TradeOffStrength | undefined): number {
    switch (strength) {
        case 'weak':
            return 1;
        case 'strong':
            return 3;
        case 'medium':
        default:
            return 2;
    }
}

function evaluateTradeOffRelation(relation: TradeOffRelation, selectedSet: Set<string>): {
    weight: number;
    value: number;
    warningMessage?: string;
} | undefined {
    const left = relation.left.ref?.name;
    const right = relation.right.ref?.name;
    if (!left || !right) {
        return undefined;
    }

    const leftSelected = selectedSet.has(left);
    const rightSelected = selectedSet.has(right);
    const weight = tradeOffWeight(relation.strength);

    if (relation.relation === 'conflictsWith') {
        const active = leftSelected || rightSelected;
        if (!active) {
            return undefined;
        }
        if (leftSelected && rightSelected) {
            return {
                weight,
                value: -weight,
                warningMessage: `Trade-off warning: '${left}' conflicts with '${right}', but both are selected.`
            };
        }
        return {
            weight,
            value: weight
        };
    }

    if (!leftSelected) {
        return undefined;
    }

    if (relation.relation === 'supports') {
        if (rightSelected) {
            return {
                weight,
                value: weight
            };
        }
        return {
            weight,
            value: -weight,
            warningMessage: `Trade-off warning: '${left}' supports '${right}', but '${right}' is not selected.`
        };
    }

    if (rightSelected) {
        return {
            weight,
            value: -weight,
            warningMessage: `Trade-off warning: '${left}' prefers to be selected over '${right}', but both are selected.`
        };
    }
    return {
        weight,
        value: weight
    };
}

function normalizeScore(rawScore: number, minScore: number, maxScore: number): number {
    if (maxScore <= minScore) {
        return 100;
    }
    const normalized = ((rawScore - minScore) / (maxScore - minScore)) * 100;
    return Math.max(0, Math.min(100, Math.round(normalized)));
}

/**
 * Implementation of custom validations.
 */
export class FodaMsValidator {

    checkModel(model: Model, accept: ValidationAcceptor): void {
        const result = analyzeModel(model);
        for (const finding of result.findings) {
            accept(finding.severity, finding.message, {
                node: finding.node,
                property: finding.property
            });
        }
    }

}
