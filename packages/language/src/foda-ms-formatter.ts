import type { AstNode } from 'langium';
import { AbstractFormatter, Formatting } from 'langium/lsp';
import {
    isAlternativeRelation,
    isConfiguration,
    isDomainSection,
    isFeatureNode,
    isFeatureTree,
    isHardConstraint,
    isHardConstraintSection,
    isMandatoryRelation,
    isModel,
    isOptionalRelation,
    isOrRelation,
    isPriorityGroup,
    isQualityAttributeDeclaration,
    isQualityAttributesSection,
    isTradeOffRelation,
    isTradeOffSection
} from './generated/ast.js';

export class FodaMsFormatter extends AbstractFormatter {

    protected override format(node: AstNode): void {
        if (isModel(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.properties('qualityAttributes', 'tree', 'hardConstraints', 'tradeOffs', 'configuration')
                .prepend(Formatting.noIndent())
                .prepend(Formatting.newLine());
            return;
        }

        if (isDomainSection(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('domain').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine()).append(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.properties('domains').prepend(Formatting.newLine());
            return;
        }

        if (isQualityAttributesSection(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('qualityAttributes').append(Formatting.oneSpace());

            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine()).append(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());

            formatter.properties('declarations').prepend(Formatting.newLine());
            return;
        }

        if (isQualityAttributeDeclaration(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('quality').append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isFeatureTree(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('featureTree').append(Formatting.oneSpace());
            formatter.property('root').prepend(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.prepend(Formatting.oneSpace()).append(Formatting.newLine());
            close.prepend(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.properties('relations').prepend(Formatting.newLine());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isFeatureNode(node)) {
            const formatter = this.getNodeFormatter(node);
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.prepend(Formatting.oneSpace()).append(Formatting.newLine());
            close.prepend(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.properties('relations').prepend(Formatting.newLine());
            return;
        }

        if (isMandatoryRelation(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('mandatory').append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isOptionalRelation(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('optional').append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isOrRelation(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('or').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.keyword(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isAlternativeRelation(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('alternative').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.keyword(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isHardConstraintSection(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('constraints').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine()).append(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.properties('constraints').prepend(Formatting.newLine());
            return;
        }

        if (isHardConstraint(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.property('relation').surround(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            return;
        }

        if (isTradeOffSection(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('tradeOffs').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');
            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine()).append(Formatting.newLine());
            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.properties('relations').prepend(Formatting.newLine());
            return;
        }

        if (isTradeOffRelation(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.property('relation').surround(Formatting.oneSpace());

            const hasBody =
                node.domainValue.length > 0 ||
                node.strength !== undefined ||
                node.evidence.length > 0;

            if (hasBody) {
                const open = formatter.keyword('{');
                const close = formatter.keyword('}');
                open.prepend(Formatting.oneSpace()).append(Formatting.newLine());
                close.prepend(Formatting.newLine()).append(Formatting.newLine());
                formatter.interior(open, close).prepend(Formatting.indent());
                formatter.keyword('domain').prepend(Formatting.newLine()).append(Formatting.oneSpace());
                formatter.keyword('=').surround(Formatting.oneSpace());
                formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
                formatter.keyword('strength').prepend(Formatting.newLine()).append(Formatting.oneSpace());
                formatter.keyword('evidence').prepend(Formatting.newLine()).append(Formatting.oneSpace());
                formatter.keyword('[').prepend(Formatting.oneSpace());
                formatter.keyword(']').prepend(Formatting.noSpace()).append(Formatting.noSpace());
                formatter.keyword(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
            } else {
                formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            }
            return;
        }

        if (isConfiguration(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('configuration').append(Formatting.oneSpace());
            const open = formatter.keyword('{');
            const close = formatter.keyword('}');

            open.append(Formatting.newLine());
            close.prepend(Formatting.newLine()).append(Formatting.newLine());

            formatter.interior(open, close).prepend(Formatting.indent());
            formatter.property('domainSelection').prepend(Formatting.newLine());
            formatter.keyword('domain').append(Formatting.oneSpace());
            formatter.keyword('=').surround(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
            formatter.properties('priorityGroups').prepend(Formatting.newLine());
            return;
        }

        if (isPriorityGroup(node)) {
            const formatter = this.getNodeFormatter(node);
            formatter.keyword('priority').append(Formatting.oneSpace());
            formatter.property('label').append(Formatting.oneSpace());
            formatter.keyword('{').append(Formatting.oneSpace());
            formatter.keyword('}').prepend(Formatting.oneSpace());
            formatter.keyword(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
            formatter.keyword(';').prepend(Formatting.noSpace()).append(Formatting.newLine());
        }
    }

}
