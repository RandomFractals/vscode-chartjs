'use strict';
import {Uri} from 'vscode';
import {ChartPreview} from './chart.preview';

export class PreviewManager {
    
  // singleton instance
  private static _instance: PreviewManager;
  // tracked previews for config/restore updates
  private _previews: ChartPreview[] = [];

  private constructor() {
  }

  /**
   * Creates preview manager singleton instance.
   */
  public static get Instance() {
    return this._instance || (this._instance = new this());
  }

  /**
   * Adds new preview instance for config/restore tracking.
   * @param preview preview instance to add.
   */
  public add(preview: ChartPreview): void {
    this._previews.push(preview!);
  }

  /**
   * Removes preview instance from previews tracking collection.
   * @param preview preview instance to remove.
   */
  public remove(preview: ChartPreview): void {
    let found = this._previews.indexOf(preview!);
    if (found >= 0) {
      this._previews.splice(found, 1);
    }
  }

  /**
   * Returns matching preview for the specified uri.
   * @param uri preview uri.
   */
  public find(uri: Uri): ChartPreview | undefined{        
    return this._previews.find(p => p.previewUri.toString() === uri.toString());
  }

  /**
   * Returns active preview instance.
   */
  public active(): ChartPreview | undefined {
    return this._previews.find(p => p.visible);
  }
    
  /**
   * Reloads open previews on extension config changes.
   */
  public configure(): void {
    this._previews.forEach(p => p.configure());
  }
}

// export preview manager singleton
export const previewManager = PreviewManager.Instance;
