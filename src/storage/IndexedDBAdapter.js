/**
 * IndexedDBAdapter - IndexedDB 儲存實現
 * 用於瀏覽器端本地儲存，無需伺服器
 */

import { StorageAdapter } from './StorageAdapter.js';

export class IndexedDBAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} dbName - 資料庫名稱
   * @param {string} storeName - 儲存區名稱
   * @param {number} version - 資料庫版本
   */
  constructor(dbName = 'VoiceBankDB', storeName = 'recordings', version = 1) {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
  }
  
  /**
   * 初始化資料庫
   * @returns {Promise<IDBDatabase>}
   */
  async initialize() {
    if (this.db) {
      return this.db;
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 創建物件儲存區（如果不存在）
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // 創建索引
          store.createIndex('filename', 'filename', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('duration', 'duration', { unique: false });
        }
      };
    });
  }
  
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案 ID
   */
  async save(blob, filename, metadata = {}) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const record = {
        filename: filename,
        blob: blob,
        size: blob.size,
        type: blob.type,
        timestamp: Date.now(),
        metadata: metadata
      };
      
      const request = store.add(record);
      
      request.onsuccess = () => {
        resolve(String(request.result));
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to save recording: ${request.error}`));
      };
      
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error}`));
      };
    });
  }
  
  /**
   * 載入音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<Blob>}
   */
  async load(id) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(Number(id));
      
      request.onsuccess = () => {
        const record = request.result;
        if (record && record.blob) {
          resolve(record.blob);
        } else {
          reject(new Error(`Recording not found: ${id}`));
        }
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to load recording: ${request.error}`));
      };
    });
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(Number(id));
      
      request.onsuccess = () => {
        resolve(true);
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to delete recording: ${request.error}`));
      };
    });
  }
  
  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const records = request.result.map(record => ({
          id: String(record.id),
          filename: record.filename,
          size: record.size,
          type: record.type,
          timestamp: record.timestamp,
          date: new Date(record.timestamp),
          metadata: record.metadata || {}
        }));
        resolve(records);
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to list recordings: ${request.error}`));
      };
    });
  }
  
  /**
   * 根據檔名搜尋
   * @param {string} filename - 檔案名稱（支援部分匹配）
   * @returns {Promise<Array>}
   */
  async searchByFilename(filename) {
    const allRecords = await this.list();
    return allRecords.filter(record => 
      record.filename.toLowerCase().includes(filename.toLowerCase())
    );
  }
  
  /**
   * 取得儲存空間使用情況
   * @returns {Promise<Object>}
   */
  async getStorageInfo() {
    const records = await this.list();
    const totalSize = records.reduce((sum, record) => sum + record.size, 0);
    
    return {
      count: records.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      records: records
    };
  }
  
  /**
   * 清空所有錄音
   * @returns {Promise<number>} 刪除的數量
   */
  async clear() {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // 先取得數量
      const countRequest = store.count();
      
      countRequest.onsuccess = () => {
        const count = countRequest.result;
        
        // 清空儲存區
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          resolve(count);
        };
        
        clearRequest.onerror = () => {
          reject(new Error(`Failed to clear recordings: ${clearRequest.error}`));
        };
      };
      
      countRequest.onerror = () => {
        reject(new Error(`Failed to count recordings: ${countRequest.error}`));
      };
    });
  }
  
  /**
   * 取得瀏覽器儲存空間配額資訊（如果可用）
   * @returns {Promise<Object|null>}
   */
  async getStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage,
          quota: estimate.quota,
          usageMB: (estimate.usage / (1024 * 1024)).toFixed(2),
          quotaMB: (estimate.quota / (1024 * 1024)).toFixed(2),
          usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(2)
        };
      } catch (error) {
        console.warn('Failed to get storage estimate:', error);
        return null;
      }
    }
    return null;
  }
  
  /**
   * 關閉資料庫連接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default IndexedDBAdapter;
