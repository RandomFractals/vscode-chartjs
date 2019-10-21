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
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger_1 = require("./logger");
const preview_manager_1 = require("./preview.manager");
/**
 * Vega preview web panel serializer for restoring previews on vscode reload.
 */
class VegaPreviewSerializer {
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
     * Restores webview panel on vscode reload for vega and data previews.
     * @param webviewPanel Webview panel to restore.
     * @param state Saved web view panel state.
     */
    deserializeWebviewPanel(webviewPanel, state) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.logMessage(logger_1.LogLevel.Debug, 'deserializeWeviewPanel(): url:', state.uri.toString());
            preview_manager_1.previewManager.add(new VegaPreview(this.viewType, this.extensionPath, vscode_1.Uri.parse(state.uri), webviewPanel.viewColumn, this.template, webviewPanel));
        });
    }
}
exports.VegaPreviewSerializer = VegaPreviewSerializer;
/**
 * Main vega preview webview implementation for this vscode extension.
 */
class VegaPreview {
    /**
     * Creates new Vega preview.
     * @param viewType Preview webview type, i.e. vega.preview or vega.data.preview.
     * @param extensionPath Extension path for loading webview scripts, etc.
     * @param uri Vega spec json doc uri to preview.
     * @param viewColumn vscode IDE view column to display vega preview in.
     * @param template Webview html template reference.
     * @param panel Optional webview panel reference for restore on vscode IDE reload.
     */
    constructor(viewType, extensionPath, uri, viewColumn, template, panel) {
        this._disposables = [];
        // save ext path, document uri, and create prview uri
        this._extensionPath = extensionPath;
        this._uri = uri;
        this._fileName = path.basename(uri.fsPath);
        this._previewUri = this._uri.with({ scheme: 'vega' });
        this._logger = new logger_1.Logger(`${viewType}:`, config.logLevel);
        // create preview panel title
        switch (viewType) {
            case 'vega.preview':
                this._title = this._fileName;
                break;
            case 'vega.visual.vocabulary':
                this._title = 'Visual Vocabulary';
                break;
            default: // vega.help
                this._title = 'Vega Help';
                break;
        }
        // create html template for the webview with scripts path replaced
        const scriptsPath = vscode_1.Uri.file(path.join(this._extensionPath, 'scripts'))
            .with({ scheme: 'vscode-resource' }).toString(true);
        this._html = template.content.replace(/\{scripts\}/g, scriptsPath);
        // initialize webview panel
        this._panel = panel;
        this.initWebview(viewType, viewColumn);
        this.configure();
    } // end of constructor()
    /**
     * Initializes vega preview webview panel.
     * @param viewType Preview webview type, i.e. vega.preview or vega.data.preview.
     * @param viewColumn vscode IDE view column to display preview in.
     */
    initWebview(viewType, viewColumn) {
        if (!this._panel) {
            // create new webview panel
            this._panel = vscode_1.window.createWebviewPanel(viewType, this._title, viewColumn, this.getWebviewOptions());
            let panelIconPath;
            switch (viewType) {
                case 'vega.preview':
                    panelIconPath = './images/vega-viewer.svg';
                    break;
                case 'vega.visual.vocabulary':
                    panelIconPath = './images/visual-vocabulary.svg';
                    break;
                default: // vega.help, etc.
                    panelIconPath = './images/vega-viewer.svg';
                    break;
            }
            this._panel.iconPath = vscode_1.Uri.file(path.join(this._extensionPath, panelIconPath));
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
                case 'exportSvg':
                    this.exportSvg(message.svg);
                    break;
                case 'exportPng':
                    this.exportPng(message.imageData);
                    break;
                case 'openFile':
                    vscode_1.workspace.openTextDocument(this._uri).then(document => {
                        vscode_1.window.showTextDocument(document, vscode_1.ViewColumn.One);
                    });
                    break;
                case 'showData':
                    this.showData(message.dataUri);
                    break;
                case 'showHelp':
                    const helpUri = vscode_1.Uri.parse('https://github.com/RandomFractals/vscode-vega-viewer#usage');
                    vscode_1.commands.executeCommand('vscode.open', helpUri);
                    break;
            }
        }, null, this._disposables);
    } // end of initWebview()
    /**
     * Creates webview options with local resource roots, etc
     * for vega preview webview display.
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
     * Creates local resource roots for loading scripts in vega preview webview.
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
        // add vega preview js scripts
        localResourceRoots.push(vscode_1.Uri.file(path.join(this._extensionPath, 'scripts')));
        this._logger.logMessage(logger_1.LogLevel.Debug, 'getLocalResourceRoots():', localResourceRoots);
        return localResourceRoots;
    }
    /**
     * Configures webview html for preview.
     */
    configure() {
        this.webview.html = this.html;
        // NOTE: let webview fire refresh message
        // when vega preview DOM content is initialized
        // see: this.refresh();
    }
    /**
     * Launches referenced vega spec csv or json data preview.
     * @param dataUrl The url of the data file to load.
     */
    showData(dataUrl) {
        let dataUri;
        if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
            dataUri = vscode_1.Uri.parse(dataUrl);
        }
        else {
            // join with vega spec file path for reletive data file loading
            dataUri = vscode_1.Uri.file(path.join(path.dirname(this._uri.fsPath), dataUrl));
        }
        this._logger.logMessage(logger_1.LogLevel.Info, `showData(): ${this.dataPreviewCommand}`, dataUri.toString(true));
        vscode_1.commands.executeCommand(this.dataPreviewCommand, dataUri);
    }
    /**
     * Reload vega preview on vega spec json doc save changes or vscode IDE reload.
     */
    refresh() {
        // reveal corresponding Vega preview panel
        this._panel.reveal(this._panel.viewColumn, true); // preserve focus
        // open Vega json spec text document
        vscode_1.workspace.openTextDocument(this.uri).then(document => {
            this._logger.logMessage(logger_1.LogLevel.Debug, 'refresh(): file:', this._fileName);
            const vegaSpec = document.getText();
            try {
                const spec = JSON.parse(vegaSpec);
                const data = this.getData(spec);
                this.webview.postMessage({
                    command: 'refresh',
                    fileName: this._fileName,
                    uri: this._uri.toString(),
                    spec: vegaSpec,
                    data: data
                });
            }
            catch (error) {
                this._logger.logMessage(logger_1.LogLevel.Error, 'refresh():', error.message);
                this.webview.postMessage({ error: error });
            }
        });
    }
    /**
     * Extracts data urls and loads local data files to pass to vega preview webview.
     * @param spec Vega json doc spec root or nested data references to extract.
     */
    getData(spec) {
        const dataFiles = {};
        // get top level data urls
        let dataUrls = this.getDataUrls(spec);
        // add nested spec data urls for view compositions (facets, repeats, etc.)
        dataUrls = dataUrls.concat(this.getDataUrls(spec['spec']));
        this._logger.logMessage(logger_1.LogLevel.Debug, 'getData(): dataUrls:', dataUrls);
        // get all local files data
        dataUrls.forEach(dataUrl => {
            if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
                // add remote data source reference
                dataFiles[dataUrl] = dataUrl;
            }
            else {
                // get local file data
                const fileData = this.getFileData(dataUrl);
                if (fileData) {
                    dataFiles[dataUrl] = fileData;
                }
                this._logger.logMessage(logger_1.LogLevel.Debug, 'getData(): localDataUrl:', dataUrl);
            }
        });
        return dataFiles;
    }
    /**
     * Recursively extracts data urls from the specified vega json doc spec
     * or knowwn nested data elements for loading local data content.
     * @param spec Vega json doc spec root or nested data references to extract.
     */
    getDataUrls(spec) {
        let dataUrls = [];
        if (spec === undefined) {
            return dataUrls; // base case
        }
        const data = spec['data'];
        const transforms = spec['transform'];
        let layers = [];
        layers = layers.concat(spec['layer']);
        layers = layers.concat(spec['concat']);
        layers = layers.concat(spec['hconcat']);
        layers = layers.concat(spec['vconcat']);
        if (data !== undefined) {
            // get top level data references
            if (Array.isArray(data)) {
                data.filter(d => d['url'] !== undefined).forEach(d => {
                    dataUrls.push(d['url']);
                });
            }
            else if (data['url'] !== undefined) {
                dataUrls.push(data['url']);
            }
        }
        if (layers !== undefined && Array.isArray(layers)) {
            // get layers data references
            layers.forEach(layer => {
                dataUrls = dataUrls.concat(this.getDataUrls(layer));
            });
        }
        if (transforms !== undefined) {
            // get transform data references
            transforms.forEach(transformData => {
                dataUrls = dataUrls.concat(this.getDataUrls(transformData['from']));
            });
        }
        return dataUrls;
    }
    /**
     * Loads actual local data file content.
     * @param filePath Local data file path.
     * TODO: change this to async later
     */
    getFileData(filePath) {
        let data = null;
        const dataFilePath = path.join(path.dirname(this._uri.fsPath), filePath);
        if (fs.existsSync(dataFilePath)) {
            data = fs.readFileSync(dataFilePath, 'utf8');
        }
        else {
            this._logger.logMessage(logger_1.LogLevel.Error, 'getFileData():', `${filePath} doesn't exist`);
        }
        return data;
    }
    /**
     * Displays Save SVG dialog and saves it for export SVG feature from preview panel.
     * @param svg Svg document export to save.
     */
    exportSvg(svg) {
        return __awaiter(this, void 0, void 0, function* () {
            const svgFilePath = this._uri.fsPath.replace('.json', '');
            const svgFileUri = yield vscode_1.window.showSaveDialog({
                defaultUri: vscode_1.Uri.parse(svgFilePath).with({ scheme: 'file' }),
                filters: { 'SVG': ['svg'] }
            });
            if (svgFileUri) {
                fs.writeFile(svgFileUri.fsPath, svg, (error) => {
                    if (error) {
                        const errorMessage = `Failed to save file: ${svgFileUri.fsPath}`;
                        this._logger.logMessage(logger_1.LogLevel.Error, 'exportSvg():', errorMessage);
                        vscode_1.window.showErrorMessage(errorMessage);
                    }
                });
            }
            this.webview.postMessage({ command: 'showMessage', message: '' });
        });
    }
    /**
     * Displays Save PNG dialog and saves it for export PNG feature from preview panel.
     * @param imageData Image data to save in png format.
     */
    exportPng(imageData) {
        return __awaiter(this, void 0, void 0, function* () {
            const base64 = imageData.replace('data:image/png;base64,', '');
            const pngFilePath = this._uri.fsPath.replace('.json', '');
            const pngFileUri = yield vscode_1.window.showSaveDialog({
                defaultUri: vscode_1.Uri.parse(pngFilePath).with({ scheme: 'file' }),
                filters: { 'PNG': ['png'] }
            });
            if (pngFileUri) {
                fs.writeFile(pngFileUri.fsPath, base64, 'base64', (error) => {
                    if (error) {
                        const errorMessage = `Failed to save file: ${pngFileUri.fsPath}`;
                        this._logger.logMessage(logger_1.LogLevel.Error, 'exportPng():', errorMessage);
                        vscode_1.window.showErrorMessage(errorMessage);
                    }
                });
            }
            this.webview.postMessage({ command: 'showMessage', message: '' });
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
     * Gets the source vega spec json doc uri for this preview.
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
    /**
     * Gets vega data preview command setting.
     */
    get dataPreviewCommand() {
        return vscode_1.workspace.getConfiguration('vega.viewer').get('dataPreviewCommand');
    }
}
exports.VegaPreview = VegaPreview;
//# sourceMappingURL=vega.preview.js.map