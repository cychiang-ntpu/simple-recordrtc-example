/**
 * ServerAdapter - 伺服器儲存適配器
 * 支援 PHP/Node.js 等後端儲存方案
 */

import { StorageAdapter } from './StorageAdapter.js';

export class ServerAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {Object} config - 配置選項
   * @param {string} config.baseURL - 基礎 URL
   * @param {string} config.saveEndpoint - 上傳端點
   * @param {string} config.loadEndpoint - 下載端點
   * @param {string} config.deleteEndpoint - 刪除端點
   * @param {string} config.listEndpoint - 列表端點（可選）
   */
  constructor(config = {}) {
    super();
    this.baseURL = config.baseURL || '';
    this.saveEndpoint = config.saveEndpoint || '/backend/save.php';
    this.loadEndpoint = config.loadEndpoint || '/public/uploads/';
    this.deleteEndpoint = config.deleteEndpoint || '/backend/delete.php';
    this.listEndpoint = config.listEndpoint || '/api/recordings';
    this.headers = config.headers || {};
  }
  
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案名稱
   */
  async save(blob, filename, metadata = {}) {
    const formData = new FormData();
    formData.append('audio-blob', blob);
    formData.append('audio-filename', filename);
    
    if (metadata && Object.keys(metadata).length > 0) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    
    try {
      const response = await fetch(this.baseURL + this.saveEndpoint, {
        method: 'POST',
        body: formData,
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.text();
      
      // 檢查 PHP 端點的回應（通常是 'success'）
      if (result.toLowerCase().includes('success')) {
        return filename;
      } else {
        throw new Error(`Server error: ${result}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  }
  
  /**
   * 載入音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<Blob>}
   */
  async load(filename) {
    try {
      const url = this.baseURL + this.loadEndpoint + filename;
      const response = await fetch(url, {
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Load error:', error);
      throw error;
    }
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<boolean>}
   */
  async delete(filename) {
    try {
      const response = await fetch(this.baseURL + this.deleteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify({ filename })
      });
      
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.text();
      return result.toLowerCase().includes('success');
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  }
  
  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    try {
      const response = await fetch(this.baseURL + this.listEndpoint, {
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`List failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('List error:', error);
      // 如果後端不支援 list 操作，返回空陣列
      return [];
    }
  }
  
  /**
   * 使用 XMLHttpRequest 上傳（帶進度回調）
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @param {Function} onProgress - 進度回調 (percent)
   * @returns {Promise<string>}
   */
  async saveWithProgress(blob, filename, metadata = {}, onProgress = null) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('audio-blob', blob);
      formData.append('audio-filename', filename);
      
      if (metadata && Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }
      
      const xhr = new XMLHttpRequest();
      
      // 進度事件
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            onProgress(percent);
          }
        });
      }
      
      // 完成事件
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = xhr.responseText;
          if (result.toLowerCase().includes('success')) {
            resolve(filename);
          } else {
            reject(new Error(`Server error: ${result}`));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });
      
      // 錯誤事件
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      // 取消事件
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });
      
      // 發送請求
      xhr.open('POST', this.baseURL + this.saveEndpoint);
      
      // 設定自定義 headers
      Object.keys(this.headers).forEach(key => {
        xhr.setRequestHeader(key, this.headers[key]);
      });
      
      xhr.send(formData);
    });
  }
}

export default ServerAdapter;
