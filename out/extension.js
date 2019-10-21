"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger_1 = require("./logger");
const chart_preview_1 = require("./chart.preview");
const preview_manager_1 = require("./preview.manager");
const template_manager_1 = require("./template.manager");
// supported chart config json file extensions
const CHART_FILE_EXTENSIONS = [
    '.chart.json5'
];
const logger = new logger_1.Logger('chart.preview:', config.logLevel);
/**
 * Activates this extension per rules set in package.json.
 * @param context vscode extension context.
 * @see https://code.visualstudio.com/api/references/activation-events for more info.
 */
function activate(context) {
    const extensionPath = context.extensionPath;
    // logger.logMessage(LogLevel.Info, 'activate(): activating from extPath:', context.extensionPath);
    // initialize charts preview webview panel templates
    const templateManager = new template_manager_1.TemplateManager(context.asAbsolutePath('templates'));
    const chartPreviewTemplate = templateManager.getTemplate('chart.preview.html');
    const chartSamplesTemplate = templateManager.getTemplate('chart.samples.html');
    // register chart preview serializer for restore on vscode restart
    vscode_1.window.registerWebviewPanelSerializer('chart.preview', new chart_preview_1.ChartPreviewSerializer('chart.preview', extensionPath, chartPreviewTemplate));
    // register chart samples serializer for restore on vscode restart
    vscode_1.window.registerWebviewPanelSerializer('chart.samples', new chart_preview_1.ChartPreviewSerializer('chart.samples', extensionPath, chartSamplesTemplate));
    // add Chart: Samples command
    const chartListCommand = vscode_1.commands.registerCommand('chart.samples', () => showChartList(context.asAbsolutePath('samples'), 'chart.json5'));
    context.subscriptions.push(chartListCommand);
    // add Chart: Preview command
    const chartWebview = createChartPreviewCommand('chart.preview', extensionPath, chartPreviewTemplate);
    context.subscriptions.push(chartWebview);
    // refresh associated preview on chart config file save
    vscode_1.workspace.onDidSaveTextDocument((document) => {
        if (isChartConfigFile(document)) {
            const uri = document.uri.with({ scheme: 'vega' });
            const preview = preview_manager_1.previewManager.find(uri);
            if (preview) {
                preview.refresh();
            }
        }
    });
    // reset associated preview on chart config file change
    vscode_1.workspace.onDidChangeTextDocument((changeEvent) => {
        if (isChartConfigFile(changeEvent.document)) {
            const uri = changeEvent.document.uri.with({ scheme: 'chart' });
            const preview = preview_manager_1.previewManager.find(uri);
            if (preview && changeEvent.contentChanges.length > 0) {
                // TODO: add refresh interval before enabling this
                // preview.refresh();
            }
        }
    });
    // reset all previews on config change
    vscode_1.workspace.onDidChangeConfiguration(() => {
        preview_manager_1.previewManager.configure();
    });
    logger.logMessage(logger_1.LogLevel.Info, 'activate(): activated! extPath:', context.extensionPath);
} // end of activate()
exports.activate = activate;
/**
 * Deactivates this vscode extension to free up resources.
 */
function deactivate() {
    // TODO: add extension cleanup code, if needed
}
exports.deactivate = deactivate;
/**
 * Creates chart preview command.
 * @param viewType Preview command type.
 * @param extensionPath Extension path for loading scripts, examples and data.
 * @param viewTemplate Preview html template.
 */
function createChartPreviewCommand(viewType, extensionPath, viewTemplate) {
    const chartWebview = vscode_1.commands.registerCommand(viewType, (uri) => {
        let resource = uri;
        let viewColumn = getViewColumn();
        if (!(resource instanceof vscode_1.Uri)) {
            if (vscode_1.window.activeTextEditor) {
                resource = vscode_1.window.activeTextEditor.document.uri;
            }
            else {
                vscode_1.window.showInformationMessage('Open a chart config json5 file to Preview.');
                return;
            }
        }
        let webviewPanel;
        const preview = new chart_preview_1.ChartPreview(viewType, extensionPath, resource, viewColumn, viewTemplate);
        preview_manager_1.previewManager.add(preview);
        return preview.webview;
    });
    return chartWebview;
}
/**
 * Gets 2nd panel view column if chart json config document is open.
 */
function getViewColumn() {
    let viewColumn = vscode_1.ViewColumn.One;
    const activeEditor = vscode_1.window.activeTextEditor;
    if (activeEditor && activeEditor.viewColumn) {
        viewColumn = activeEditor.viewColumn + 1;
    }
    return viewColumn;
}
/**
 * Checks if the vscode text document is a chart config json file.
 * @param document The vscode text document to check.
 */
function isChartConfigFile(document) {
    const fileName = path.basename(document.uri.fsPath).replace('.json5', ''); // strip out .json5 ext
    const fileExt = fileName.substr(fileName.lastIndexOf('.'));
    logger.logMessage(logger_1.LogLevel.Debug, 'isChartConfigFile(): document:', document);
    logger.logMessage(logger_1.LogLevel.Debug, 'isChartConfigFile(): file:', fileName);
    return CHART_FILE_EXTENSIONS.findIndex(chartFileExt => chartFileExt === fileExt) >= 0;
}
/**
 * Displays chart samples list to preview.
 * @param examplesPath Samples file path.
 * @param examplesExtension Samples extension: chart.json5 for now.
 */
function showChartList(examplesPath, examplesExtension) {
    return __awaiter(this, void 0, void 0, function* () {
        const fileNames = fs.readdirSync(examplesPath).filter(f => f.endsWith(examplesExtension));
        const fileItems = [];
        fileNames.forEach(fileName => fileItems.push({ label: `📊 ${fileName}` }));
        const selectedExample = yield vscode_1.window.showQuickPick(fileItems, { canPickMany: false });
        if (selectedExample) {
            const exampleFileName = selectedExample.label.replace('📈 ', '');
            const exampleFileUri = vscode_1.Uri.file(path.join(examplesPath, exampleFileName));
            vscode_1.workspace.openTextDocument(exampleFileUri).then(document => {
                vscode_1.window.showTextDocument(document, vscode_1.ViewColumn.One);
            });
        }
    });
}
//# sourceMappingURL=extension.js.map