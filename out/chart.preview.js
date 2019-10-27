'use strict';
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
const path = require("path");
const json5 = require("json5");
const config = require("./config");
const logger_1 = require("./logger");
const preview_manager_1 = require("./preview.manager");
/**
 * Chart preview web panel serializer for restoring previews on vscode reload.
 */
class ChartPreviewSerializer {
    /**
     * Creates new webview serializer.
     * @param viewType Web view type.
     * @param extensionPath Extension path for loading scripts, examples and data.
     * @param template Webview preview html template.
     */
    constructor(viewType, extensionPath, template) {
        this.viewType = viewType;
        this.extensionPath = extensionPath;
        this.template = template;
        this._logger = new logger_1.Logger(`${this.viewType}.serializer:`, config.logLevel);
    }
    /**
     * Restores webview panel on vscode reload for chart and data previews.
     * @param webviewPanel Webview panel to restore.
     * @param state Saved web view panel state.
     */
    deserializeWebviewPanel(webviewPanel, state) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.logMessage(logger_1.LogLevel.Debug, 'deserializeWeviewPanel(): url:', state.uri.toString());
            const viewColumn = (webviewPanel.viewColumn) ? webviewPanel.viewColumn : vscode_1.ViewColumn.One;
            preview_manager_1.previewManager.add(new ChartPreview(this.viewType, this.extensionPath, vscode_1.Uri.parse(state.uri), viewColumn, this.template, webviewPanel));
        });
    }
}
exports.ChartPreviewSerializer = ChartPreviewSerializer;
/**
 * Main chart preview webview implementation for this vscode extension.
 */
class ChartPreview {
    /**
     * Creates new Chart preview.
     * @param viewType Preview webview type, i.e. chart.preview or chart.samples.
     * @param extensionPath Extension path for loading webview scripts, etc.
     * @param uri Chart spec json doc uri to preview.
     * @param viewColumn vscode IDE view column to display chart preview in.
     * @param template Webview html template reference.
     * @param panel Optional webview panel reference for restore on vscode IDE reload.
     */
    constructor(viewType, extensionPath, uri, viewColumn, template, panel) {
        this._disposables = [];
        this._html = '';
        // save ext path, document uri, and create prview uri
        this._extensionPath = extensionPath;
        this._uri = uri;
        this._fileName = path.basename(uri.fsPath);
        this._previewUri = this._uri.with({ scheme: 'chart' });
        this._logger = new logger_1.Logger(`${viewType}:`, config.logLevel);
        // create preview panel title
        switch (viewType) {
            case 'chart.preview':
                this._title = this._fileName;
                break;
            case 'chart.samples':
                this._title = 'Chart Samples';
                break;
            default: // chart.help
                this._title = 'Charts Help';
                break;
        }
        // create html template for the webview with scripts path replaced
        const scriptsPath = vscode_1.Uri.file(path.join(this._extensionPath, './node_modules/chart.js/dist'))
            .with({ scheme: 'vscode-resource' }).toString(true);
        if (template) {
            this._html = template.content.replace(/\{scripts\}/g, scriptsPath);
        }
        // initialize webview panel
        if (panel) {
            this._panel = panel;
        }
        this.initWebview(viewType, viewColumn);
        this.configure();
    } // end of constructor()
    /**
     * Initializes chart preview webview panel.
     * @param viewType Preview webview type, i.e. chart.preview or chart.samples view.
     * @param viewColumn vscode IDE view column to display preview in.
     */
    initWebview(viewType, viewColumn) {
        if (!this._panel) {
            // create new webview panel
            this._panel = vscode_1.window.createWebviewPanel(viewType, this._title, viewColumn, this.getWebviewOptions());
            this._panel.iconPath = vscode_1.Uri.file(path.join(this._extensionPath, './images/chart.svg'));
        }
        // dispose preview panel 
        this._panel.onDidDispose(() => {
            this.dispose();
        }, null, this._disposables);
        // TODO: handle view state changes later
        this._panel.onDidChangeViewState((viewStateEvent) => {
            let active = viewStateEvent.webviewPanel.visible;
        }, null, this._disposables);
        // process web view messages
        this.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    this.refresh();
                    break;
                case 'openFile':
                    vscode_1.workspace.openTextDocument(this._uri).then(document => {
                        vscode_1.window.showTextDocument(document, vscode_1.ViewColumn.One);
                    });
                    break;
                case 'showHelp':
                    const helpUri = vscode_1.Uri.parse('https://github.com/RandomFractals/vscode-chartjs#usage');
                    vscode_1.commands.executeCommand('vscode.open', helpUri);
                    break;
            }
        }, null, this._disposables);
    } // end of initWebview()
    /**
     * Creates webview options with local resource roots, etc
     * for chart preview webview display.
     */
    getWebviewOptions() {
        return {
            enableScripts: true,
            enableCommandUris: true,
            retainContextWhenHidden: true,
            localResourceRoots: this.getLocalResourceRoots()
        };
    }
    /**
     * Creates local resource roots for loading scripts in chart preview webview.
     */
    getLocalResourceRoots() {
        const localResourceRoots = [];
        const workspaceFolder = vscode_1.workspace.getWorkspaceFolder(this.uri);
        if (workspaceFolder) {
            localResourceRoots.push(workspaceFolder.uri);
        }
        else if (!this.uri.scheme || this.uri.scheme === 'file') {
            localResourceRoots.push(vscode_1.Uri.file(path.dirname(this.uri.fsPath)));
        }
        // add chart preview js scripts
        localResourceRoots.push(vscode_1.Uri.file(path.join(this._extensionPath, './node_modules/chart.js/dist')));
        this._logger.logMessage(logger_1.LogLevel.Debug, 'getLocalResourceRoots():', localResourceRoots);
        return localResourceRoots;
    }
    /**
     * Configures webview html for preview.
     */
    configure() {
        this.webview.html = this.html;
        // NOTE: let webview fire refresh message
        // when chart preview DOM content is initialized
        // see: this.refresh();
    }
    /**
     * Reload chart preview on chart json doc save changes or vscode IDE reload.
     */
    refresh() {
        // reveal corresponding chart preview panel
        this._panel.reveal(this._panel.viewColumn, true); // preserve focus
        // open chart json config text document
        vscode_1.workspace.openTextDocument(this.uri).then(document => {
            this._logger.logMessage(logger_1.LogLevel.Debug, 'refresh(): file:', this._fileName);
            const chartSpec = document.getText();
            try {
                const chartConfig = json5.parse(chartSpec);
                this.webview.postMessage({
                    command: 'refresh',
                    fileName: this._fileName,
                    uri: this._uri.toString(),
                    config: chartConfig,
                });
            }
            catch (error) {
                this._logger.logMessage(logger_1.LogLevel.Error, 'refresh():', error.message);
                this.webview.postMessage({ error: error });
            }
        });
    }
    /**
     * Disposes this preview resources.
     */
    dispose() {
        preview_manager_1.previewManager.remove(this);
        this._panel.dispose();
        while (this._disposables.length) {
            const item = this._disposables.pop();
            if (item) {
                item.dispose();
            }
        }
    }
    /**
     * Gets preview panel visibility status.
     */
    get visible() {
        return this._panel.visible;
    }
    /**
     * Gets the underlying webview instance for this preview.
     */
    get webview() {
        return this._panel.webview;
    }
    /**
     * Gets the source chart spec json doc uri for this preview.
     */
    get uri() {
        return this._uri;
    }
    /**
     * Gets the preview uri to load on commands triggers or vscode IDE reload.
     */
    get previewUri() {
        return this._previewUri;
    }
    /**
     * Gets the html content to load for this preview.
     */
    get html() {
        return this._html;
    }
}
exports.ChartPreview = ChartPreview;
//# sourceMappingURL=chart.preview.js.map