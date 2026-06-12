import { analyzeModel, formatAnalysisFinding, type Model, type Configuration } from 'foda-ms-language';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

function generateConfigAnalysis(config: Configuration, model: Model): string {
    const result = analyzeModel(model, config);

    const selectedFeatures = config.priorityGroups
        .flatMap(group => group.selected)
        .map(selected => selected.ref?.name)
        .filter((name): name is string => Boolean(name));

    const domainName = config.domainSelection?.ref?.name ?? '(none)';
    const declaredDomains = model.domain.domains.map(d => d.name).join(', ');

    return toString(expandToNode`
        Configuration: ${config.name}
        ${''.padEnd(80, '=')}

        Domain: ${domainName}
        Declared Domains: ${declaredDomains}

        Normalized Score: ${result.score}/100
        Active Trade Offs: ${result.activeTradeOffs}
        Raw TradeOff Score: ${result.rawScore}
        Approx. Max Valid Configurations: ${result.maxValidConfigurations}
        Total Combinations: ${result.totalCombinations}

        Selected Features:
        ${joinToNode(selectedFeatures, feature => `- ${feature}`, { appendNewLineIfNotEmpty: true })}

        Findings:
        ${result.findings.length === 0
            ? 'No findings.'
            : joinToNode(result.findings, finding => `- ${formatAnalysisFinding(finding)}`, { appendNewLineIfNotEmpty: true })}
    `.appendNewLineIfNotEmpty());
}

export function generateAnalysisReport(model: Model, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.analysis.txt`;

    const sections = model.configurations.map(config => generateConfigAnalysis(config, model));
    const combined = sections.join('\n');

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, combined);
    return generatedFilePath;
}
