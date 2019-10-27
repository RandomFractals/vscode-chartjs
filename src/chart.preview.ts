'use strict';
import { 
  workspace, 
  window, 
  Disposable, 
  Uri, 
  ViewColumn, 
  WorkspaceFolder, 
  Webview,
  WebviewPanel, 
  WebviewPanelOnDidChangeViewStateEvent, 
  WebviewPanelSerializer,
  commands
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as json5 from 'json5';
import * as config from './config';
import {Logger, LogLevel} from './logger';
import {previewManager} from './preview.manager';
import {Template} from './template.manager';

/**
 * Chart preview web panel serializer for restoring previews on vscode reload.
 */
export class ChartPreviewSerializer implements WebviewPanelSerializer {

  private _logger: Logger;
  
  /**
   * Creates new webview serializer.
   * @param viewType Web view type.
   * @param extensionPath Extension path for loading scripts, examples and data.
   * @param template Webview preview html template.
   */
  constructor(private viewType: string, 
    private extensionPath: string, 
    private template: Template | undefined) {
    this._logger = new Logger(`${this.viewType}.serializer:`, config.logLevel);
  }

  /**
   * Restores webview panel on vscode reload for chart and data previews.
   * @param webviewPanel Webview panel to restore.
   * @param state Saved web view panel state.
   */
  async deserializeWebviewPanel(webviewPanel: WebviewPanel, state: any) {
    this._logger.logMessage(LogLevel.Debug, 'deserializeWeviewPanel(): url:', state.uri.toString());
    const viewColumn: ViewColumn = (webviewPanel.viewColumn) ? webviewPanel.viewColumn : ViewColumn.One;
    previewManager.add(
      new ChartPreview(
        this.viewType,
        this.extensionPath, 
        Uri.parse(state.uri),
        viewColumn, 
        this.template, 
        webviewPanel
    ));
  }
}

/**
 * Main chart preview webview implementation for this vscode extension.
 */
export class ChartPreview {
    
  protected _disposables: Disposable[] = [];
  private _extensionPath: string;
  private _uri: Uri;
  private _previewUri: Uri;
  private _fileName: string;
  private _title: string;
  private _html: string = '';
  private _panel: WebviewPanel;
  private _logger: Logger;

  /**
   * Creates new Chart preview.
   * @param viewType Preview webview type, i.e. chart.preview or chart.samples.
   * @param extensionPath Extension path for loading webview scripts, etc.
   * @param uri Chart spec json doc uri to preview.
   * @param viewColumn vscode IDE view column to display chart preview in.
   * @param template Webview html template reference.
   * @param panel Optional webview panel reference for restore on vscode IDE reload.
   */
  constructor(
    viewType: string,
    extensionPath: string, 
    uri: Uri, 
    viewColumn: ViewColumn, 
    template: Template | undefined, 
    panel?: WebviewPanel) {

    // save ext path, document uri, and create prview uri
    this._extensionPath = extensionPath;
    this._uri = uri;
    this._fileName = path.basename(uri.fsPath);
    this._previewUri = this._uri.with({scheme: 'chart'});
    this._logger = new Logger(`${viewType}:`, config.logLevel);

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
    const scriptsPath: string = Uri.file(path.join(this._extensionPath, './node_modules/chart.js/dist'))
      .with({scheme: 'vscode-resource'}).toString(true);
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
  private initWebview(viewType: string, viewColumn: ViewColumn): void {
    if (!this._panel) {
      // create new webview panel
      this._panel = window.createWebviewPanel(viewType, this._title, viewColumn, this.getWebviewOptions());
      this._panel.iconPath = Uri.file(path.join(this._extensionPath, './images/chart.svg'));
    }

    // dispose preview panel 
    this._panel.onDidDispose(() => {
      this.dispose();
    }, null, this._disposables);

    // TODO: handle view state changes later
    this._panel.onDidChangeViewState(
      (viewStateEvent: WebviewPanelOnDidChangeViewStateEvent) => {
      let active = viewStateEvent.webviewPanel.visible;
    }, null, this._disposables);

    // process web view messages
    this.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'refresh':
          this.refresh();
          break;
        case 'openFile':
          workspace.openTextDocument(this._uri).then(document => {
            window.showTextDocument(document, ViewColumn.One);
          });
          break;
        case 'showHelp':
          const helpUri: Uri = Uri.parse('https://github.com/RandomFractals/vscode-chartjs#usage');
          commands.executeCommand('vscode.open', helpUri);
          break;  
      }
    }, null, this._disposables);
  } // end of initWebview()

  /**
   * Creates webview options with local resource roots, etc
   * for chart preview webview display.
   */
  private getWebviewOptions(): any {
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
  private getLocalResourceRoots(): Uri[] {
    const localResourceRoots: Uri[] = [];
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(this.uri);
    if (workspaceFolder) {
      localResourceRoots.push(workspaceFolder.uri);
    }
    else if (!this.uri.scheme || this.uri.scheme === 'file') {
      localResourceRoots.push(Uri.file(path.dirname(this.uri.fsPath)));
    }
    // add chart preview js scripts
    localResourceRoots.push(Uri.file(path.join(this._extensionPath, './node_modules/chart.js/dist')));
    this._logger.logMessage(LogLevel.Debug, 'getLocalResourceRoots():', localResourceRoots);
    return localResourceRoots;
  }

  /**
   * Configures webview html for preview.
   */
  public configure(): void {
    this.webview.html = this.html;
    // NOTE: let webview fire refresh message
    // when chart preview DOM content is initialized
    // see: this.refresh();
  }

  /**
   * Reload chart preview on chart json doc save changes or vscode IDE reload.
   */
  public refresh(): void {
    // reveal corresponding chart preview panel
    this._panel.reveal(this._panel.viewColumn, true); // preserve focus
    // open chart json config text document
    workspace.openTextDocument(this.uri).then(document => {
      this._logger.logMessage(LogLevel.Debug, 'refresh(): file:', this._fileName);
      const chartSpec: string = document.getText();
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
        this._logger.logMessage(LogLevel.Error, 'refresh():', error.message);
        this.webview.postMessage({error: error});
      }
    });
  }

  /**
   * Disposes this preview resources.
   */
  public dispose() {
    previewManager.remove(this);
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
  get visible(): boolean {
    return this._panel.visible;
  }

  /**
   * Gets the underlying webview instance for this preview.
   */
  get webview(): Webview {
    return this._panel.webview;
  }
    
  /**
   * Gets the source chart spec json doc uri for this preview.
   */
  get uri(): Uri {
    return this._uri;
  }

  /**
   * Gets the preview uri to load on commands triggers or vscode IDE reload. 
   */
  get previewUri(): Uri {
    return this._previewUri;
  }
  
  /**
   * Gets the html content to load for this preview.
   */
  get html(): string {
    return this._html;
  }
}
