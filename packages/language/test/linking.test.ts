import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import type { Model } from "foda-ms-language";
import { createFodaMsServices, isModel } from "foda-ms-language";

let services: ReturnType<typeof createFodaMsServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createFodaMsServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.FodaMs);

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [ document ]);
});

describe('Linking tests', () => {

    test('linking of quality attributes', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Security;
                quality Performance;
                quality Availability;
                quality Latency;
            }

            featureTree QualityAttributes {
                optional Security;
                optional Performance {
                    optional Latency;
                };
                optional Availability;
            };

            constraints {
                Security requires Availability;
                Security excludes Performance;
            }

            tradeOffs {
                Security supports Availability strength strong;
            }

            configuration {
                selected { QualityAttributes, Security, Availability };
            }
        `);

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the cross references we're interested in by checking
            //  the referenced AST element as well as for a potential error message;
            checkDocumentValid(document)
                || [
                    document.parseResult.value.tree.root.feature.ref?.name || document.parseResult.value.tree.root.feature.error?.message,
                    ...document.parseResult.value.configuration.selected.map(s => s.ref?.name || s.error?.message),
                    ...document.parseResult.value.hardConstraints.constraints.map(c =>
                        `${c.left.ref?.name || c.left.error?.message}:${c.right.ref?.name || c.right.error?.message}`
                    )
                ].join('\n')
        ).toBe(s`
            QualityAttributes
            QualityAttributes
            Security
            Availability
            Security:Availability
            Security:Performance
        `);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isModel(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a 'Model'.`
        || undefined;
}
