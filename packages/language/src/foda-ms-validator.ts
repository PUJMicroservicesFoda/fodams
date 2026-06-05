import type { AstNode, ValidationAcceptor, ValidationChecks } from "langium";
import {
  isAlternativeRelation,
  isMandatoryRelation,
  isOrRelation,
  type FodaMsAstType,
  type FeatureNode,
  type FeatureTree,
  type Model,
  type TradeOffRelation,
  type TradeOffStrength,
} from "./generated/ast.js";
import type { FodaMsServices } from "./foda-ms-module.js";

export type FindingSeverity = "error" | "warning" | "info";

const findingSeverityLabels: Record<FindingSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Information",
};

export interface AnalysisFinding {
  severity: FindingSeverity;
  message: string;
  node: AstNode;
  property?: string;
}

export function findingSeverityLabel(severity: FindingSeverity): string {
  return findingSeverityLabels[severity];
}

export function formatAnalysisFinding(
  finding: Pick<AnalysisFinding, "severity" | "message">,
): string {
  return `[${findingSeverityLabel(finding.severity)}] ${finding.message}`;
}

export interface AnalysisResult {
  score: number;
  rawScore: number;
  activeTradeOffs: number;
  maxValidConfigurations: number;
  totalCombinations: number;
  findings: AnalysisFinding[];
}

interface MonteCarloEstimate {
  estimate: number;
  totalSpace: number;
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

interface ConfigurationAnalysisResult {
  findings: AnalysisFinding[];
  rawScore: number;
  minScore: number;
  maxScore: number;
  activeTradeOffs: number;
}

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: FodaMsServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.FodaMsValidator;
  const checks: ValidationChecks<FodaMsAstType> = {
    Model: validator.checkModel,
  };
  registry.register(checks, validator);
}

export function analyzeModel(model: Model): AnalysisResult {
  const findings: AnalysisFinding[] = [];

  const treeContext = collectTreeAnalysis(model.tree);
  findings.push(...collectStaticFindings(model, treeContext));

  const selectedSet = new Set<string>();
  const priorityGroupByFeature = new Map<string, number>();
  for (const [
    groupIndex,
    group,
  ] of model.configuration.priorityGroups.entries()) {
    for (const selected of group.selected) {
      const featureName = selected.ref?.name;
      if (!featureName) {
        continue;
      }
      if (priorityGroupByFeature.has(featureName)) {
        findings.push({
          severity: "error",
          message: `Feature '${featureName}' appears in multiple priority groups.`,
          node: group,
          property: "selected",
        });
        continue;
      }
      priorityGroupByFeature.set(featureName, groupIndex);
      selectedSet.add(featureName);
    }
  }

  const configurationResult = evaluateConfiguration(
    model,
    treeContext,
    selectedSet,
    priorityGroupByFeature,
  );
  findings.push(...configurationResult.findings);

  const score = normalizeScore(
    configurationResult.rawScore,
    configurationResult.minScore,
    configurationResult.maxScore,
  );
  const estimation = estimateValidConfigurations(model, treeContext);
  const maxValidConfigurations = Math.round(estimation.estimate);

  return {
    score,
    rawScore: configurationResult.rawScore,
    activeTradeOffs: configurationResult.activeTradeOffs,
    maxValidConfigurations,
    totalCombinations: estimation.totalSpace,
    findings,
  };
}

function collectTreeAnalysis(tree: FeatureTree): TreeAnalysisContext {
  const context: TreeAnalysisContext = {
    nodesByFeature: new Map<string, FeatureNode[]>(),
    parentByChild: new Map<string, Set<string>>(),
    mandatoryEdges: [],
    orGroups: [],
    alternativeGroups: [],
  };

  // Root is an implicit tree label and may not be declared as a quality attribute.
  context.nodesByFeature.set(tree.root, []);

  const visitNode = (node: FeatureNode): void => {
    const nodeFeature = node.feature.ref?.name;
    if (!nodeFeature) {
      return;
    }

    const seenNodes = context.nodesByFeature.get(nodeFeature) ?? [];
    seenNodes.push(node);
    context.nodesByFeature.set(nodeFeature, seenNodes);

    for (const relation of node.relations) {
      if (
        isMandatoryRelation(relation) ||
        isOrRelation(relation) ||
        isAlternativeRelation(relation)
      ) {
        const children = isMandatoryRelation(relation)
          ? [relation.child]
          : relation.children;
        const childFeatures = children
          .map((child) => child.feature.ref?.name)
          .filter((name): name is string => Boolean(name));

        for (const child of children) {
          const childFeature = child.feature.ref?.name;
          if (!childFeature) {
            continue;
          }
          const parents =
            context.parentByChild.get(childFeature) ?? new Set<string>();
          parents.add(nodeFeature);
          context.parentByChild.set(childFeature, parents);
          visitNode(child);
        }

        if (isMandatoryRelation(relation)) {
          for (const childFeature of childFeatures) {
            context.mandatoryEdges.push({
              parent: nodeFeature,
              child: childFeature,
              node: relation,
            });
          }
        } else if (isOrRelation(relation)) {
          context.orGroups.push({
            parent: nodeFeature,
            children: childFeatures,
            node: relation,
          });
        } else if (isAlternativeRelation(relation)) {
          context.alternativeGroups.push({
            parent: nodeFeature,
            children: childFeatures,
            node: relation,
          });
        }
      } else {
        const childFeature = relation.child.feature.ref?.name;
        if (!childFeature) {
          continue;
        }
        const parents =
          context.parentByChild.get(childFeature) ?? new Set<string>();
        parents.add(nodeFeature);
        context.parentByChild.set(childFeature, parents);
        visitNode(relation.child);
      }
    }
  };

  for (const relation of tree.relations) {
    if (
      isMandatoryRelation(relation) ||
      isOrRelation(relation) ||
      isAlternativeRelation(relation)
    ) {
      const children = isMandatoryRelation(relation)
        ? [relation.child]
        : relation.children;
      const childFeatures = children
        .map((child) => child.feature.ref?.name)
        .filter((name): name is string => Boolean(name));

      for (const child of children) {
        const childFeature = child.feature.ref?.name;
        if (!childFeature) {
          continue;
        }
        const parents =
          context.parentByChild.get(childFeature) ?? new Set<string>();
        parents.add(tree.root);
        context.parentByChild.set(childFeature, parents);
        visitNode(child);
      }

      if (isMandatoryRelation(relation)) {
        for (const childFeature of childFeatures) {
          context.mandatoryEdges.push({
            parent: tree.root,
            child: childFeature,
            node: relation,
          });
        }
      } else if (isOrRelation(relation)) {
        context.orGroups.push({
          parent: tree.root,
          children: childFeatures,
          node: relation,
        });
      } else if (isAlternativeRelation(relation)) {
        context.alternativeGroups.push({
          parent: tree.root,
          children: childFeatures,
          node: relation,
        });
      }
    } else {
      const childFeature = relation.child.feature.ref?.name;
      if (!childFeature) {
        continue;
      }
      const parents =
        context.parentByChild.get(childFeature) ?? new Set<string>();
      parents.add(tree.root);
      context.parentByChild.set(childFeature, parents);
      visitNode(relation.child);
    }
  }

  return context;
}

function tradeOffWeight(strength: TradeOffStrength | undefined): number {
  switch (strength) {
    case "low":
      return 1;
    case "high":
      return 3;
    case "medium":
    default:
      return 2;
  }
}

function evaluateTradeOffRelation(
  relation: TradeOffRelation,
  selectedSet: Set<string>,
  priorityGroupByFeature: Map<string, number>,
):
  | {
      weight: number;
      value: number;
      warningMessage?: string;
    }
  | undefined {
  const left = relation.left.ref?.name;
  const right = relation.right.ref?.name;
  if (!left || !right) {
    return undefined;
  }

  const leftSelected = selectedSet.has(left);
  const rightSelected = selectedSet.has(right);
  const weight = tradeOffWeight(relation.strength);
  const leftGroup = priorityGroupByFeature.get(left);
  const rightGroup = priorityGroupByFeature.get(right);
  const samePriorityGroup =
    leftSelected &&
    rightSelected &&
    leftGroup !== undefined &&
    rightGroup !== undefined &&
    leftGroup === rightGroup;

  if (!leftSelected) {
    return undefined;
  }

  if (relation.relation === "increases") {
    const warningMessage = samePriorityGroup
      ? `Trade-off warning: '${left}' increases '${right}', but both are in the same priority group. Consider putting them in different priority groups.`
      : undefined;
    return {
      weight,
      value: rightSelected ? weight : -weight,
      warningMessage,
    };
  }

  if (relation.relation === "reduces") {
    const warningMessage = samePriorityGroup
      ? `Trade-off warning: '${left}' reduces '${right}', but both are in the same priority group. Consider putting them in different priority groups.`
      : undefined;
    return {
      weight,
      value: rightSelected ? -weight : weight,
      warningMessage,
    };
  }

  if (!rightSelected) {
    return undefined;
  }

  if (
    leftGroup !== undefined &&
    rightGroup !== undefined &&
    leftGroup < rightGroup
  ) {
    return {
      weight,
      value: weight,
    };
  }
  return {
    weight,
    value: -weight,
    warningMessage: `Trade-off warning: '${left}' must be in a higher-priority group than '${right}'.`,
  };
}

function collectStaticFindings(
  model: Model,
  treeContext: TreeAnalysisContext,
): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const declarations = model.qualityAttributes.declarations;
  const declaredNames = new Set<string>();
  let duplicateDeclarations = false;

  for (const declaration of declarations) {
    if (declaredNames.has(declaration.name)) {
      duplicateDeclarations = true;
      findings.push({
        severity: "error",
        message: `Quality attribute '${declaration.name}' is declared more than once.`,
        node: declaration,
        property: "name",
      });
    }
    declaredNames.add(declaration.name);
  }

  for (const [featureName, nodes] of treeContext.nodesByFeature.entries()) {
    if (nodes.length > 1) {
      for (const repeatedNode of nodes.slice(1)) {
        findings.push({
          severity: "error",
          message: `Feature '${featureName}' appears multiple times in the feature tree.`,
          node: repeatedNode,
          property: "feature",
        });
      }
    }
  }

  findings.push(...collectTradeOffContradictions(model, declaredNames));

  if (duplicateDeclarations) {
    findings.push({
      severity: "info",
      message:
        "Duplicate quality-attribute declarations can distort trade-off analysis.",
      node: model,
    });
  }

  return findings;
}

function collectTradeOffContradictions(
  model: Model,
  declaredNames: Set<string>,
): AnalysisFinding[] {
  const increasesGraph = buildTradeOffGraph(model, "increases");
  const reducesGraph = buildTradeOffGraph(model, "reduces");
  const increasesClosure = computeTransitiveClosure(
    declaredNames,
    increasesGraph,
  );
  const reducesClosure = computeTransitiveClosure(declaredNames, reducesGraph);
  const findings: AnalysisFinding[] = [];

  for (const source of declaredNames) {
    const increaseTargets = increasesClosure.get(source) ?? new Set<string>();
    const reduceTargets = reducesClosure.get(source) ?? new Set<string>();

    for (const target of increaseTargets) {
      if (target === source || !reduceTargets.has(target)) {
        continue;
      }

      findings.push({
        severity: "error",
        message: `Trade-off contradiction: '${source}' increases '${target}' and '${source}' reduces '${target}'.`,
        node: model,
        property: "tradeOffs",
      });
    }
  }

  return findings;
}

function buildTradeOffGraph(
  model: Model,
  relationKind: "increases" | "reduces",
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const relation of model.tradeOffs.relations) {
    if (relation.relation !== relationKind) {
      continue;
    }

    const left = relation.left.ref?.name;
    const right = relation.right.ref?.name;
    if (!left || !right) {
      continue;
    }

    const targets = graph.get(left) ?? new Set<string>();
    targets.add(right);
    graph.set(left, targets);
  }

  return graph;
}

function computeTransitiveClosure(
  sources: Set<string>,
  graph: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const closure = new Map<string, Set<string>>();

  for (const source of sources) {
    const visited = new Set<string>([source]);
    const stack = [source];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const targets = graph.get(current);
      if (!targets) {
        continue;
      }

      for (const target of targets) {
        if (visited.has(target)) {
          continue;
        }

        visited.add(target);
        stack.push(target);
      }
    }

    closure.set(source, visited);
  }

  return closure;
}

function evaluateConfiguration(
  model: Model,
  treeContext: TreeAnalysisContext,
  selectedSet: Set<string>,
  priorityGroupByFeature: Map<string, number>,
): ConfigurationAnalysisResult {
  const findings: AnalysisFinding[] = [];

  for (const selectedName of selectedSet) {
    if (!treeContext.nodesByFeature.has(selectedName)) {
      findings.push({
        severity: "error",
        message: `Selected feature '${selectedName}' is not present in the feature tree.`,
        node: model.configuration,
        property: "priorityGroups",
      });
    }
  }

  const selectedForTreeRules = new Set(selectedSet);
  selectedForTreeRules.add(model.tree.root);

  for (const [child, parents] of treeContext.parentByChild.entries()) {
    if (selectedSet.has(child)) {
      const hasSelectedParent = [...parents].some((parent) =>
        selectedForTreeRules.has(parent),
      );
      if (!hasSelectedParent) {
        findings.push({
          severity: "error",
          message: `Feature '${child}' is selected but none of its parents are selected.`,
          node: treeContext.nodesByFeature.get(child)?.[0] ?? model.tree,
          property: "feature",
        });
      }
    }
  }

  for (const edge of treeContext.mandatoryEdges) {
    if (
      selectedForTreeRules.has(edge.parent) &&
      !selectedForTreeRules.has(edge.child)
    ) {
      findings.push({
        severity: "error",
        message: `Feature '${edge.child}' is mandatory when '${edge.parent}' is selected.`,
        node: edge.node,
        property: "child",
      });
    }
  }

  for (const group of treeContext.orGroups) {
    if (selectedForTreeRules.has(group.parent)) {
      const selectedChildren = group.children.filter((child) =>
        selectedForTreeRules.has(child),
      ).length;
      if (selectedChildren < 1) {
        findings.push({
          severity: "error",
          message: `Or-group under '${group.parent}' requires at least one selected child.`,
          node: group.node,
        });
      }
    }
  }

  for (const group of treeContext.alternativeGroups) {
    if (selectedForTreeRules.has(group.parent)) {
      const selectedChildren = group.children.filter((child) =>
        selectedForTreeRules.has(child),
      ).length;
      if (selectedChildren !== 1) {
        findings.push({
          severity: "error",
          message: `Alternative group under '${group.parent}' requires exactly one selected child.`,
          node: group.node,
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
    if (
      constraint.relation === "requires" &&
      selectedSet.has(left) &&
      !selectedSet.has(right)
    ) {
      findings.push({
        severity: "error",
        message: `Hard constraint violated: '${left}' requires '${right}'.`,
        node: constraint,
        property: "right",
      });
    }
    if (
      constraint.relation === "excludes" &&
      selectedSet.has(left) &&
      selectedSet.has(right)
    ) {
      findings.push({
        severity: "error",
        message: `Hard constraint violated: '${left}' excludes '${right}'.`,
        node: constraint,
        property: "right",
      });
    }
  }

  let minScore = 0;
  let maxScore = 0;
  let rawScore = 0;
  let activeTradeOffs = 0;

  for (const relation of model.tradeOffs.relations) {
    const evaluated = evaluateTradeOffRelation(
      relation,
      selectedSet,
      priorityGroupByFeature,
    );
    if (!evaluated) {
      continue;
    }

    activeTradeOffs += 1;
    minScore -= evaluated.weight;
    maxScore += evaluated.weight;
    rawScore += evaluated.value;

    if (evaluated.warningMessage) {
      findings.push({
        severity: "warning",
        message: evaluated.warningMessage,
        node: relation,
      });
    }
  }

  return {
    findings,
    rawScore,
    minScore,
    maxScore,
    activeTradeOffs,
  };
}

function estimateValidConfigurations(
  model: Model,
  treeContext: TreeAnalysisContext,
): MonteCarloEstimate {
  const declarations = model.qualityAttributes.declarations;
  const nElements = declarations.length;
  const mBuckets = model.configuration.priorityGroups.length + 1;
  const totalSpace = Math.pow(mBuckets, nElements);

  if (
    collectStaticFindings(model, treeContext).some(
      (finding) => finding.severity !== "info",
    )
  ) {
    return {
      estimate: 0,
      totalSpace,
    };
  }

  const featureIndexByName = new Map<string, number>();
  declarations.forEach((declaration, index) => {
    featureIndexByName.set(declaration.name, index);
  });

  const forbiddenPairSet = new Set<string>();
  for (const relation of model.tradeOffs.relations) {
    if (relation.relation !== "increases" && relation.relation !== "reduces") {
      continue;
    }

    const leftName = relation.left.ref?.name;
    const rightName = relation.right.ref?.name;
    if (!leftName || !rightName) {
      continue;
    }

    const leftIndex = featureIndexByName.get(leftName);
    const rightIndex = featureIndexByName.get(rightName);
    if (
      leftIndex === undefined ||
      rightIndex === undefined ||
      leftIndex === rightIndex
    ) {
      continue;
    }

    const a = Math.min(leftIndex, rightIndex);
    const b = Math.max(leftIndex, rightIndex);
    forbiddenPairSet.add(`${a},${b}`);
  }

  const rng = mulberry32(42);
  const freeBucket = mBuckets - 1;
  const assignment = new Array<number>(nElements);

  const minSamples = 1_000;
  const maxSamples = 1_000_000;
  const targetRelativeError = 0.05;

  let valid = 0;
  let samples = 0;

  while (samples < maxSamples) {
    for (let index = 0; index < nElements; index += 1) {
      assignment[index] = Math.floor(rng() * mBuckets);
    }

    if (isAssignmentValid(assignment, forbiddenPairSet, mBuckets, freeBucket)) {
      valid += 1;
    }

    samples += 1;
    if (samples >= minSamples) {
      const fraction = valid / samples;
      const estimate = fraction * totalSpace;
      if (estimate > 0) {
        const varianceFraction =
          samples > 1
            ? (fraction * (1 - fraction)) / (samples - 1)
            : fraction * (1 - fraction);
        const stderr = Math.sqrt(varianceFraction) * totalSpace;
        const relativeError = stderr / estimate;
        if (relativeError <= targetRelativeError) {
          break;
        }
      }
    }
  }

  return {
    estimate: (valid / samples) * totalSpace,
    totalSpace,
  };
}

export function bucketSizes(
  assignment: Array<number>,
  mBuckets: number,
): Array<number> {
  let bs = new Array<number>(mBuckets).fill(0);
  for (let i = 0; i < assignment.length; i++) {
    let bucket = assignment[i];
    bs[bucket]++;
  }
  return bs;
}

export function findNumberOfGaps(
  bucketSizes: Array<number>,
  freeBucket: number,
): number {
  // Find last non-empty bucket
  let lastNonEmptyBucket;
  for (
    lastNonEmptyBucket = bucketSizes.length - 1;
    lastNonEmptyBucket >= 0;
    lastNonEmptyBucket--
  ) {
    if (bucketSizes[lastNonEmptyBucket] != 0 && lastNonEmptyBucket != freeBucket) {
      break;
    }
  }

  let numGaps = 0;
  for (let i = 0; i < lastNonEmptyBucket; i++) {
    if (bucketSizes[i] == 0 && i != freeBucket) {
      numGaps++;
    }
  }
  return numGaps;
}

function isAssignmentValid(
  assignment: number[],
  forbiddenPairSet: Set<string>,
  mBuckets: number,
  freeBucket: number,
): boolean {
  // Check if forbidden pairs are in same priority group
  for (const pair of forbiddenPairSet) {
    const [a, b] = pair.split(",").map(Number);
    if (assignment[a] === assignment[b] && assignment[a] !== freeBucket) {
      return false;
    }
  }

  // Check that there are no empty priority groups between non-empty ones
  let bs = bucketSizes(assignment, mBuckets);
  let numGaps = findNumberOfGaps(bs, freeBucket);
  if (numGaps > 0) {
    return false;
  }

  return true;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}

function normalizeScore(
  rawScore: number,
  minScore: number,
  maxScore: number,
): number {
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
        property: finding.property,
      });
    }
  }
}
