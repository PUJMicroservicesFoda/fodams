import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import type { Model } from "foda-ms-language";
import { analyzeModel, createFodaMsServices, findingSeverityLabel, formatAnalysisFinding, isModel } from "foda-ms-language";

let services: ReturnType<typeof createFodaMsServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createFodaMsServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.FodaMs);
    parse = (input: string) => doParse(input, { validation: true });

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating', () => {

    test('check no errors', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Security;
                quality Availability;
                quality Performance;
                quality Latency;
            }

            featureTree QualityAttributes {
                optional Security;
                optional Availability;
                optional Performance {
                    optional Latency;
                };
            };

            constraints {
                Security requires Availability;
            }

            tradeOffs {
                Security increases Availability strength strong;
                Performance increases Latency strength medium;
            }

            configuration {
                priorityGroup { QualityAttributes, Security, Performance };
                priorityGroup { Availability };
                priorityGroup { Latency };
            }
        `);

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the diagnostics by converting them into human readable strings;
            // note that 'toHaveLength()' works for arrays and strings alike ;-)
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    test('check hard constraint violation', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Security;
                quality Availability;
            }

            featureTree QualityAttributes {
                optional Security;
                optional Availability;
            };

            constraints {
                Security requires Availability;
            }

            tradeOffs {
            }

            configuration {
                priorityGroup { QualityAttributes, Security };
            }
        `);

        const output = checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n');
        expect(output).toEqual(expect.stringContaining("Hard constraint violated: 'Security' requires 'Availability'."));
    });

    test('check direct and transitive trade-off contradictions', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Performance;
                quality Scalability;
                quality Reliability;
                quality Maintainability;
            }

            featureTree QualityAttributes {
                optional Performance;
                optional Scalability;
                optional Reliability;
                optional Maintainability;
            };

            constraints {
            }

            tradeOffs {
                Performance increases Reliability;
                Performance reduces Reliability;
                Reliability increases Scalability;
                Performance reduces Maintainability;
                Maintainability increases Scalability;
                Performance reduces Scalability;
            }

            configuration {
                priorityGroup { QualityAttributes, Performance, Reliability };
                priorityGroup { Scalability };
            }
        `);

        const output = checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n');
        expect(output).toEqual(expect.stringContaining("Trade-off contradiction: 'Performance' increases 'Reliability' and 'Performance' reduces 'Reliability'."));
        expect(output).toEqual(expect.stringContaining("Trade-off contradiction: 'Performance' increases 'Scalability' and 'Performance' reduces 'Scalability'."));

        const analysis = analyzeModel(document!.parseResult.value);
        expect(analysis.activeTradeOffs).toBe(5);
        expect(analysis.maxValidConfigurations).toBe(0);
    });

    test('check moreImportantThan priority ordering', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Performance;
            }

            featureTree QualityAttributes {
                optional Performance;
            };

            constraints {
            }

            tradeOffs {
                Performance moreImportantThan QualityAttributes strength strong;
            }

            configuration {
                priorityGroup { QualityAttributes };
                priorityGroup { Performance };
            }
        `);

        const output = checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n');
        expect(output).toEqual(expect.stringContaining("Trade-off warning: 'Performance' must be in a higher-priority group than 'QualityAttributes'."));

        const analysis = analyzeModel(document!.parseResult.value);
        expect(analysis.maxValidConfigurations).toBe(4);
    });

    test('format findings with VS Code severity labels', () => {
        expect(findingSeverityLabel('error')).toBe('Error');
        expect(findingSeverityLabel('warning')).toBe('Warning');
        expect(findingSeverityLabel('info')).toBe('Information');

        expect(formatAnalysisFinding({
            severity: 'warning',
            message: "Trade-off warning: 'Performance' reduces 'Scalability'."
        })).toBe("[Warning] Trade-off warning: 'Performance' reduces 'Scalability'.");
    });

    test('count valid configurations with empty groups disallowed', async () => {
        document = await parse(`
            qualityAttributes {
                quality QualityAttributes;
                quality Performance;
            }

            featureTree QualityAttributes {
                optional Performance;
            };

            constraints {
            }

            tradeOffs {
            }

            configuration {
                priorityGroup { QualityAttributes };
                priorityGroup { Performance };
            }
        `);

        const analysis = analyzeModel(document!.parseResult.value);
        expect(analysis.maxValidConfigurations).toBe(6);
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

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
