/**
 * CapacitorAdapter - Capacitor 檔案系統儲存適配器
 * 使用 Capacitor Filesystem Plugin 在移動裝置上儲存檔案
 */

import { StorageAdapter } from './StorageAdapter.js';

export class CapacitorAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} directory - 儲存目錄名稱
   */
  constructor(directory = 'recordings') {
    super();
    this.directory = directory;
    
    // 檢查 Capacitor 是否可用
    if (typeof window === 'undefined' || !window.Capacitor) {
      throw new Error('Capacitor not available. Make sure Capacitor is properly initialized.');
    }
    
    this.Capacitor = window.Capacitor;
    this.initialized = false;
  }
  
  /**
   * 初始化（確保目錄存在）
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      // 嘗試讀取目錄，如果不存在則創建
      try {
        await Filesystem.readdir({
          path: this.directory,
          directory: Directory.Documents
        });
      } catch (e) {
        // 目錄不存在，創建它
        await Filesystem.mkdir({
          path: this.directory,
          directory: Directory.Documents,
          recursive: true
        });
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Capacitor initialization error:', error);
      throw error;
    }
  }
  
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案名稱
   */
  async save(blob, filename, metadata = {}) {
    await this.initialize();
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      // 轉換 Blob 為 base64
      const base64Data = await this.blobToBase64(blob);
      
      // 儲存音訊檔案
      await Filesystem.writeFile({
        path: `${this.directory}/${filename}`,
        data: base64Data,
        directory: Directory.Documents
      });
      
      // 儲存元數據
      if (metadata && Object.keys(metadata).length > 0) {
        const metadataWithDefaults = {
          ...metadata,
          size: blob.size,
          type: blob.type,
          timestamp: Date.now()
        };
        
        await Filesystem.writeFile({
          path: `${this.directory}/${filename}.meta.json`,
          data: JSON.stringify(metadataWithDefaults),
          directory: Directory.Documents,
          encoding: 'utf8'
        });
      }
      
      return filename;
    } catch (error) {
      console.error('Capacitor save error:', error);
      throw error;
    }
  }
  
  /**
   * 載入音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<Blob>}
   */
  async load(filename) {
    await this.initialize();
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      const result = await Filesystem.readFile({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });
      
      // 將 base64 轉換為 Blob
      return this.base64ToBlob(result.data, 'audio/wav');
    } catch (error) {
      console.error('Capacitor load error:', error);
      throw error;
    }
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<boolean>}
   */
  async delete(filename) {
    await this.initialize();
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      // 刪除音訊檔案
      await Filesystem.deleteFile({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });
      
      // 嘗試刪除元數據（如果存在）
      try {
        await Filesystem.deleteFile({
          path: `${this.directory}/${filename}.meta.json`,
          directory: Directory.Documents
        });
      } catch (e) {
        // 元數據可能不存在，忽略錯誤
      }
      
      return true;
    } catch (error) {
      console.error('Capacitor delete error:', error);
      throw error;
    }
  }
  
  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    await this.initialize();
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      const result = await Filesystem.readdir({
        path: this.directory,
        directory: Directory.Documents
      });
      
      // 過濾掉元數據檔案，只保留音訊檔案
      const audioFiles = result.files.filter(f => !f.endsWith('.meta.json'));
      
      // 為每個檔案載入元數據
      const recordings = await Promise.all(
        audioFiles.map(async (filename) => {
          let metadata = {};
          
          try {
            const metaResult = await Filesystem.readFile({
              path: `${this.directory}/${filename}.meta.json`,
              directory: Directory.Documents,
              encoding: 'utf8'
            });
            metadata = JSON.parse(metaResult.data);
          } catch (e) {
            // 沒有元數據
          }
          
          return {
            id: filename,
            filename: filename,
            metadata: metadata,
            timestamp: metadata.timestamp || 0,
            date: metadata.timestamp ? new Date(metadata.timestamp) : null,
            size: metadata.size || 0,
            type: metadata.type || 'audio/wav'
          };
        })
      );
      
      // 按時間排序（最新的在前）
      recordings.sort((a, b) => b.timestamp - a.timestamp);
      
      return recordings;
    } catch (error) {
      console.error('Capacitor list error:', error);
      return [];
    }
  }
  
  /**
   * 取得檔案的 URI（用於播放）
   * @param {string} filename - 檔案名稱
   * @returns {Promise<string>} 檔案 URI
   */
  async getUri(filename) {
    await this.initialize();
    
    try {
      const { Filesystem, Directory } = this.Capacitor.Plugins;
      
      const result = await Filesystem.getUri({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });
      
      return result.uri;
    } catch (error) {
      console.error('Capacitor getUri error:', error);
      throw error;
    }
  }
  
  /**
   * Blob 轉 base64
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // 移除 data:audio/wav;base64, 前綴
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  /**
   * base64 轉 Blob
   * @param {string} base64
   * @param {string} mimeType
   * @returns {Blob}
   */
  base64ToBlob(base64, mimeType = 'audio/wav') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
  
  /**
   * 取得儲存空間資訊
   * @returns {Promise<Object>}
   */
  async getStorageInfo() {
    const recordings = await this.list();
    const totalSize = recordings.reduce((sum, r) => sum + (r.size || 0), 0);
    
    return {
      count: recordings.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      recordings: recordings
    };
  }
}

export default CapacitorAdapter;
