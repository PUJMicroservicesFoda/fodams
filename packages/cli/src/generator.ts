import { analyzeModel, formatAnalysisFinding, type Model } from 'foda-ms-language';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

export function generateAnalysisReport(model: Model, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.analysis.txt`;
    const result = analyzeModel(model);

    const selectedFeatures = model.configuration.priorityGroups
        .flatMap(group => group.selected)
        .map(selected => selected.ref?.name)
        .filter((name): name is string => Boolean(name));

    const fileNode = expandToNode`
        FODA-MS Feature-Oriented Model Analysis
        =======================================

        Normalized Score: ${result.score}/100
        Active Trade Offs: ${result.activeTradeOffs}
        Raw TradeOff Score: ${result.rawScore}
        Approx. Max Valid Configurations: ${result.maxValidConfigurations}
        Total Combinations: ${result.totalCombinations}

        SelectedFeatures:
        ${joinToNode(selectedFeatures, feature => `- ${feature}`, { appendNewLineIfNotEmpty: true })}

        Findings:
        ${result.findings.length === 0
            ? 'No findings.'
            : joinToNode(result.findings, finding => `- ${formatAnalysisFinding(finding)}`, { appendNewLineIfNotEmpty: true })}
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}
