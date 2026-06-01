import type { Model } from 'foda-ms-language';
import { analyzeModel, createFodaMsServices, formatAnalysisFinding, FodaMsLanguageMetaData } from 'foda-ms-language';
import chalk from 'chalk';
import { Command } from 'commander';
import { extractAstNode, extractDocument } from './util.js';
import { generateAnalysisReport } from './generator.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const analyzeAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createFodaMsServices(NodeFileSystem).FodaMs;
    const document = await extractDocument(fileName, services, { failOnError: false });
    const model = await extractAstNode<Model>(fileName, services, { failOnError: false });
    const generatedFilePath = generateAnalysisReport(model, fileName, opts.destination);
    const analysis = analyzeModel(model);

    console.log(chalk.green(`Analysis report generated successfully: ${generatedFilePath}`));
    console.log(chalk.cyan(`Normalized score: ${analysis.score}/100`));
    console.log(chalk.cyan(`Max valid configurations: ${analysis.maxValidConfigurations}`));

    if (analysis.findings.length > 0) {
        console.log(chalk.cyan(`Findings: ${analysis.findings.length}`));
        for (const finding of analysis.findings) {
            const text = formatAnalysisFinding(finding);
            if (finding.severity === 'error') {
                console.log(chalk.red(`- ${text}`));
            } else if (finding.severity === 'warning') {
                console.log(chalk.yellow(`- ${text}`));
            } else {
                console.log(chalk.blue(`- ${text}`));
            }
        }
    }

    if ((document.diagnostics ?? []).length > 0) {
        console.log(chalk.yellow(`Diagnostics: ${(document.diagnostics ?? []).length}`));
    }
};

export type GenerateOptions = {
    destination?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = FodaMsLanguageMetaData.fileExtensions.join(', ');
    program
        .command('analyze')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory for the analysis report')
        .description('analyzes a feature-oriented quality model and generates a textual report with score and findings')
        .action(analyzeAction);

    program.parse(process.argv);
}
