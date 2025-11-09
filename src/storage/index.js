/**
 * Storage Module - 儲存模組統一入口
 * 匯出所有儲存適配器
 */

export { StorageAdapter } from './StorageAdapter.js';
export { IndexedDBAdapter } from './IndexedDBAdapter.js';
export { ServerAdapter } from './ServerAdapter.js';
export { ElectronAdapter } from './ElectronAdapter.js';
export { CapacitorAdapter } from './CapacitorAdapter.js';

/**
 * StorageFactory - 儲存適配器工廠
 * 根據配置自動創建適當的儲存適配器
 */
export class StorageFactory {
  /**
   * 創建儲存適配器
   * @param {Object} config - 配置選項
   * @param {string} config.type - 儲存類型 ('browser'|'electron'|'capacitor'|'server'|'auto')
   * @param {Object} config.options - 適配器特定選項
   * @returns {StorageAdapter}
   */
  static create(config = {}) {
    const type = config.type || 'auto';
    const options = config.options || {};
    
    // 自動偵測
    if (type === 'auto') {
      return this.createAuto(options);
    }
    
    // 根據類型創建
    switch (type.toLowerCase()) {
      case 'browser':
      case 'indexeddb':
        const { IndexedDBAdapter } = require('./IndexedDBAdapter.js');
        return new IndexedDBAdapter(
          options.dbName,
          options.storeName,
          options.version
        );
      
      case 'electron':
        const { ElectronAdapter } = require('./ElectronAdapter.js');
        return new ElectronAdapter(options.savePath);
      
      case 'capacitor':
        const { CapacitorAdapter } = require('./CapacitorAdapter.js');
        return new CapacitorAdapter(options.directory);
      
      case 'server':
      case 'php':
      case 'nodejs':
        const { ServerAdapter } = require('./ServerAdapter.js');
        return new ServerAdapter(options);
      
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }
  
  /**
   * 自動創建適配器（根據環境）
   * @param {Object} options - 選項
   * @returns {StorageAdapter}
   */
  static createAuto(options = {}) {
    // 檢查 Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      const { ElectronAdapter } = require('./ElectronAdapter.js');
      return new ElectronAdapter(options.savePath);
    }
    
    // 檢查 Capacitor
    if (typeof window !== 'undefined' && window.Capacitor) {
      const { CapacitorAdapter } = require('./CapacitorAdapter.js');
      return new CapacitorAdapter(options.directory);
    }
    
    // 預設使用 IndexedDB（瀏覽器）
    const { IndexedDBAdapter } = require('./IndexedDBAdapter.js');
    return new IndexedDBAdapter(
      options.dbName,
      options.storeName,
      options.version
    );
  }
}

export default StorageFactory;
