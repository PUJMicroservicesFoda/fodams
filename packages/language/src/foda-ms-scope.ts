import { DefaultScopeProvider, type AstNode, type ReferenceInfo } from 'langium';
import { isModel, type Model } from './generated/ast.js';

export class FodaMsScopeProvider extends DefaultScopeProvider {

    override getScope(context: ReferenceInfo) {
        let scope = super.getScope(context);

        if (context.property === 'feature' || context.property === 'left' || context.property === 'right' || context.property === 'selected') {
            const model = getModelContainer(context.container);
            if (model) {
                scope = this.createScopeForNodes(model.qualityAttributes.declarations, scope);
            }
        }

        if (context.property === 'domainSelection') {
            const model = getModelContainer(context.container);
            if (model) {
                scope = this.createScopeForNodes(model.domain.domains, scope);
            }
        }

        return scope;
    }
}

function getModelContainer(node: AstNode): Model | undefined {
    let current: AstNode | undefined = node;
    while (current) {
        if (isModel(current)) {
            return current;
        }
        current = current.$container;
    }
    return undefined;
}
