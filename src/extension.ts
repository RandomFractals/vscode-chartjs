"use strict";
import {
  workspace, 
  window, 
  commands, 
  ExtensionContext,
  Disposable,
  QuickPickItem, 
  Uri, 
  ViewColumn, 
  TextDocument,
  TextDocumentChangeEvent, 
	WebviewOptions,
	WebviewPanel
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as config from './config';
import {Logger, LogLevel} from './logger';
import {ChartPreview, ChartPreviewSerializer} from './chart.preview';
import {previewManager} from './preview.manager';
import {Template, ITemplateManager, TemplateManager} from './template.manager';

// supported chart config json file extensions
const CHART_FILE_EXTENSIONS: string[] = [
  '.chart.json5'
];

const logger: Logger = new Logger('chart.preview:', config.logLevel);

/**
 * Activates this extension per rules set in package.json.
 * @param context vscode extension context.
 * @see https://code.visualstudio.com/api/references/activation-events for more info.
 */
export function activate(context: ExtensionContext) {
  const extensionPath: string = context.extensionPath;
	// logger.logMessage(LogLevel.Info, 'activate(): activating from extPath:', context.extensionPath);
	
	// initialize charts preview webview panel templates
	const templateManager: ITemplateManager = new TemplateManager(context.asAbsolutePath('templates'));
	const chartPreviewTemplate: Template | undefined = templateManager.getTemplate('chart.preview.html');
	const chartSamplesTemplate: Template | undefined = templateManager.getTemplate('chart.samples.html');

	// register chart preview serializer for restore on vscode restart
  window.registerWebviewPanelSerializer('chart.preview', 
    new ChartPreviewSerializer('chart.preview', extensionPath, chartPreviewTemplate));

  // register chart samples serializer for restore on vscode restart
  window.registerWebviewPanelSerializer('chart.samples',
    new ChartPreviewSerializer('chart.samples', extensionPath, chartSamplesTemplate));

	// add Chart: Samples command
	const chartListCommand: Disposable = commands.registerCommand('chart.samples', () => 
		showChartList(context.asAbsolutePath('samples'), 'chart.json5')
	);
	context.subscriptions.push(chartListCommand);

	// add Chart: Preview command
  const chartWebview: Disposable = 
    createChartPreviewCommand('chart.preview', extensionPath, chartPreviewTemplate);
	context.subscriptions.push(chartWebview);

	// refresh associated preview on chart config file save
	workspace.onDidSaveTextDocument((document: TextDocument) => {
		if (isChartConfigFile(document)) {
			const uri: Uri = document.uri.with({scheme: 'vega'});
			const preview: ChartPreview | undefined = previewManager.find(uri);
			if (preview) {
				preview.refresh();
			}
		}
	});

	// reset associated preview on chart config file change
	workspace.onDidChangeTextDocument((changeEvent: TextDocumentChangeEvent) => {
		if (isChartConfigFile(changeEvent.document)) {
			const uri: Uri = changeEvent.document.uri.with({scheme: 'chart'});
			const preview: ChartPreview | undefined = previewManager.find(uri);
			if (preview && changeEvent.contentChanges.length > 0) {
				// TODO: add refresh interval before enabling this
				// preview.refresh();
			}
		}
	});

	// reset all previews on config change
	workspace.onDidChangeConfiguration(() => {
		previewManager.configure();
	});

	logger.logMessage(LogLevel.Info, 'activate(): activated! extPath:', context.extensionPath);
} // end of activate()

/**
 * Deactivates this vscode extension to free up resources.
 */
export function deactivate() {
  // TODO: add extension cleanup code, if needed
}

/**
 * Creates chart preview command.
 * @param viewType Preview command type.
 * @param extensionPath Extension path for loading scripts, examples and data.
 * @param viewTemplate Preview html template.
 */
function createChartPreviewCommand(viewType: string, 
	extensionPath: string, viewTemplate: Template | undefined): Disposable {
  const chartWebview: Disposable = commands.registerCommand(viewType, (uri) => {
    let resource: any = uri;
    let viewColumn: ViewColumn = getViewColumn();
    if (!(resource instanceof Uri)) {
      if (window.activeTextEditor) {
        resource = window.activeTextEditor.document.uri;
      } else {
        window.showInformationMessage('Open a chart config json5 file to Preview.');
        return;
      }
		}
		let webviewPanel: WebviewPanel | undefined;
    const preview: ChartPreview = new ChartPreview(viewType,
      extensionPath, resource, viewColumn, viewTemplate);
		
    previewManager.add(preview);
    return preview.webview;
  });
  return chartWebview;
}

/**
 * Gets 2nd panel view column if chart json config document is open.
 */
function getViewColumn(): ViewColumn {
	let viewColumn: ViewColumn = ViewColumn.One;
	const activeEditor = window.activeTextEditor;
	if (activeEditor && activeEditor.viewColumn) {
		viewColumn = activeEditor.viewColumn + 1;
	}
	return viewColumn;
}

/**
 * Checks if the vscode text document is a chart config json file.
 * @param document The vscode text document to check.
 */
function isChartConfigFile(document: TextDocument): boolean {
  const fileName: string = path.basename(document.uri.fsPath).replace('.json5', ''); // strip out .json5 ext
  const fileExt: string = fileName.substr(fileName.lastIndexOf('.'));
  logger.logMessage(LogLevel.Debug, 'isChartConfigFile(): document:', document);
  logger.logMessage(LogLevel.Debug, 'isChartConfigFile(): file:', fileName);
  return CHART_FILE_EXTENSIONS.findIndex(chartFileExt => chartFileExt === fileExt) >= 0;
}

/**
 * Displays chart samples list to preview.
 * @param examplesPath Samples file path.
 * @param examplesExtension Samples extension: chart.json5 for now.
 */
async function showChartList(examplesPath: string, examplesExtension: string): Promise<void> {
  const fileNames: string[] = fs.readdirSync(examplesPath).filter(f => f.endsWith(examplesExtension));
  const fileItems: Array<QuickPickItem> = [];
  fileNames.forEach(fileName => fileItems.push(
    {label: `📊 ${fileName}`}
  ));
  const selectedExample: QuickPickItem | undefined = await window.showQuickPick(fileItems, {canPickMany: false});
  if (selectedExample) {
    const exampleFileName: string = selectedExample.label.replace('📈 ', '');
    const exampleFileUri: Uri = Uri.file(path.join(examplesPath, exampleFileName));
    workspace.openTextDocument(exampleFileUri).then(document => {
      window.showTextDocument(document, ViewColumn.One);
    });
  }
}

