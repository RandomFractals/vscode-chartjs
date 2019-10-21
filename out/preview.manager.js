'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class PreviewManager {
    constructor() {
        // tracked previews for config/restore updates
        this._previews = [];
    }
    /**
     * Creates preview manager singleton instance.
     */
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    /**
     * Adds new preview instance for config/restore tracking.
     * @param preview preview instance to add.
     */
    add(preview) {
        this._previews.push(preview);
    }
    /**
     * Removes preview instance from previews tracking collection.
     * @param preview preview instance to remove.
     */
    remove(preview) {
        let found = this._previews.indexOf(preview);
        if (found >= 0) {
            this._previews.splice(found, 1);
        }
    }
    /**
     * Returns matching preview for the specified uri.
     * @param uri preview uri.
     */
    find(uri) {
        return this._previews.find(p => p.previewUri.toString() === uri.toString());
    }
    /**
     * Returns active preview instance.
     */
    active() {
        return this._previews.find(p => p.visible);
    }
    /**
     * Reloads open previews on extension config changes.
     */
    configure() {
        this._previews.forEach(p => p.configure());
    }
}
exports.PreviewManager = PreviewManager;
// export preview manager singleton
exports.previewManager = PreviewManager.Instance;
//# sourceMappingURL=preview.manager.js.map