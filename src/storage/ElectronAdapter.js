/**
 * ElectronAdapter - Electron 檔案系統儲存適配器
 * 使用 Electron 的 IPC 通訊與主進程進行檔案操作
 */

import { StorageAdapter } from './StorageAdapter.js';

export class ElectronAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} savePath - 預設儲存路徑（相對於用戶文件目錄）
   */
  constructor(savePath = 'recordings') {
    super();
    this.savePath = savePath;
    
    // 檢查 Electron API 是否可用
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Electron API not available. Make sure preload script is properly configured.');
    }
    
    this.electronAPI = window.electronAPI;
  }
  
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案路徑
   */
  async save(blob, filename, metadata = {}) {
    try {
      // 將 Blob 轉換為 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      
      // 轉換為普通陣列（以便通過 IPC 傳遞）
      const buffer = Array.from(new Uint8Array(arrayBuffer));
      
      // 呼叫 Electron API
      const result = await this.electronAPI.saveRecording({
        filename,
        buffer,
        metadata: {
          ...metadata,
          size: blob.size,
          type: blob.type,
          timestamp: Date.now()
        }
      });
      
      if (result.success) {
        return result.id || result.path;
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (error) {
      console.error('Electron save error:', error);
      throw error;
    }
  }
  
  /**
   * 載入音訊檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<Blob>}
   */
  async load(filePath) {
    try {
      // 從 Electron 讀取檔案
      const buffer = await this.electronAPI.loadRecording(filePath);
      
      // 將 Buffer 轉換為 Blob
      const uint8Array = new Uint8Array(buffer);
      return new Blob([uint8Array], { type: 'audio/wav' });
    } catch (error) {
      console.error('Electron load error:', error);
      throw error;
    }
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<boolean>}
   */
  async delete(filePath) {
    try {
      const result = await this.electronAPI.deleteRecording(filePath);
      return result.success;
    } catch (error) {
      console.error('Electron delete error:', error);
      throw error;
    }
  }
  
  /**
   * 列出所有檔案
   * @param {string} directory - 目錄路徑（可選）
   * @returns {Promise<Array>}
   */
  async list(directory = null) {
    try {
      const recordings = await this.electronAPI.listRecordings(directory);
      return recordings || [];
    } catch (error) {
      console.error('Electron list error:', error);
      return [];
    }
  }
  
  /**
   * 開啟檔案選擇對話框
   * @returns {Promise<string|null>} 選擇的檔案路徑
   */
  async openFile() {
    try {
      if (this.electronAPI.openFile) {
        return await this.electronAPI.openFile();
      }
      throw new Error('openFile API not available');
    } catch (error) {
      console.error('Electron openFile error:', error);
      return null;
    }
  }
  
  /**
   * 開啟另存為對話框
   * @param {Blob} blob - 要儲存的 Blob
   * @param {string} defaultFilename - 預設檔案名稱
   * @returns {Promise<string|null>} 儲存的檔案路徑
   */
  async saveAs(blob, defaultFilename = 'recording.wav') {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Array.from(new Uint8Array(arrayBuffer));
      
      if (this.electronAPI.saveAs) {
        const result = await this.electronAPI.saveAs({
          filename: defaultFilename,
          buffer
        });
        
        return result.success ? result.path : null;
      }
      
      // 如果沒有 saveAs API，使用預設的 save
      return await this.save(blob, defaultFilename);
    } catch (error) {
      console.error('Electron saveAs error:', error);
      return null;
    }
  }
  
  /**
   * 在檔案管理器中顯示檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<boolean>}
   */
  async showInFolder(filePath) {
    try {
      if (this.electronAPI.showInFolder) {
        await this.electronAPI.showInFolder(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Electron showInFolder error:', error);
      return false;
    }
  }
}

export default ElectronAdapter;
