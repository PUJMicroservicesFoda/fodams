import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
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

describe('Parsing tests', () => {

    test('parse simple Model', async () => {
        document = await parse(`
            domain {
                all;
                web;
            }

            qualityAttributes {
                quality QualityAttributes;
                quality FunctionalSuitability;
                quality Granularity;
                quality CoarseGranularity;
                quality FineGranularity;
                quality Performance;
                quality Latency;
                quality Throughput;
            }

            featureTree QualityAttributes {
                mandatory FunctionalSuitability {
                    mandatory Granularity {
                        alternative { CoarseGranularity, FineGranularity };
                    };
                };
                optional Performance {
                    or { Latency, Throughput };
                };
            };

            constraints {
                Performance requires Latency;
                FineGranularity excludes Performance;
            }

            tradeOffs {
                Performance increases Throughput {
                    strength = low;
                }
                FineGranularity reduces Performance {
                    strength = high;
                }
                Throughput reduces Latency {
                    strength = medium;
                }
                Performance moreImportantThan Latency {
                    strength = medium;
                }
            }

            configuration {
                priority High { QualityAttributes; FunctionalSuitability; Granularity; CoarseGranularity; }
                priority Low { Performance; Latency; }
            }
        `);

        // check for absence of parser errors the classic way:
        //  deactivated, find a much more human readable way below!
        // expect(document.parseResult.parserErrors).toHaveLength(0);

                const parserIssues = checkDocumentValid(document);
                expect(parserIssues).toBeUndefined();

                const model = document.parseResult.value;
                expect(model.tree.root).toBe('QualityAttributes');
                expect(model.qualityAttributes.declarations.map(d => d.name)).toEqual([
                        'QualityAttributes',
                        'FunctionalSuitability',
                        'Granularity',
                        'CoarseGranularity',
                        'FineGranularity',
                        'Performance',
                        'Latency',
                        'Throughput'
                ]);
                expect(model.configuration.priorityGroups.flatMap(group => group.selected.map(selected => selected.$refText))).toEqual([
                        'QualityAttributes',
                        'FunctionalSuitability',
                        'Granularity',
                        'CoarseGranularity',
                        'Performance',
                        'Latency'
                ]);
                expect(model.hardConstraints.constraints.map(c => `${c.left.$refText} ${c.relation} ${c.right.$refText}`)).toEqual([
                        'Performance requires Latency',
                        'FineGranularity excludes Performance'
                ]);
                expect(model.tradeOffs.relations.map(r => `${r.left.$refText} ${r.relation} ${r.right.$refText} (${r.strength ?? 'medium'})`)).toEqual([
                    'Performance increases Throughput (low)',
                    'FineGranularity reduces Performance (high)',
                    'Throughput reduces Latency (medium)',
                    'Performance moreImportantThan Latency (medium)'
                ]);
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
