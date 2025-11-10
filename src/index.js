/**
 * VoiceBank Recorder - 主入口點
 * 跨平台音訊錄音庫
 * 
 * @version 1.0.0
 * @author VoiceBank Team
 * @license MIT
 */

// 匯出核心模組
export { AudioEngine } from './core/AudioEngine.js';
export { WaveformRenderer } from './core/WaveformRenderer.js';
export { DeviceManager } from './core/DeviceManager.js';

// 匯出 UI 模組
export { VoiceBankRecorderUI } from './ui/VoiceBankRecorderUI.js';

// 匯出儲存模組
export {
  StorageAdapter,
  IndexedDBAdapter,
  ServerAdapter,
  ElectronAdapter,
  CapacitorAdapter,
  StorageFactory
} from './storage/index.js';

// 匯出工具模組
export { PlatformDetector } from './utils/PlatformDetector.js';

/**
 * VoiceBankRecorder - 主類別
 * 提供統一的 API 介面
 */
export class VoiceBankRecorder {
  /**
   * 建構函數
   * @param {Object} options - 配置選項
   * @param {string|HTMLElement} options.container - 容器選擇器或元素
   * @param {string} options.layout - 佈局模式 ('horizontal'|'vertical'|'auto')
   * @param {string} options.theme - 主題 ('light'|'dark')
   * @param {Object} options.audio - 音訊配置
   * @param {Object} options.waveform - 波形配置
   * @param {Object} options.storage - 儲存配置
   * @param {Object} options.callbacks - 事件回調
   */
  constructor(options = {}) {
    this.options = this.mergeOptions(options);
    this.initialized = false;
    
    // 初始化儲存適配器
    this.storage = this.createStorageAdapter(this.options.storage);
    
    // 狀態
    this.isRecording = false;
    this.isPaused = false;
    this.currentBlob = null;
    
    // 如果提供了容器，初始化 UI
    if (this.options.container) {
      this.initializeUI();
    }
  }
  
  /**
   * 合併配置選項
   * @param {Object} options - 用戶選項
   * @returns {Object} 合併後的選項
   */
  mergeOptions(options) {
    const defaults = {
      container: null,
      layout: 'auto',
      theme: 'light',
      
      audio: {
        sampleRate: 48000,
        channels: 1,
        agc: false,
        gain: 1.0
      },
      
      waveform: {
        showOverview: true,
        showAccumulated: true,
        showLive: true,
        decimation: 10,
        colors: {
          waveform: '#1E88E5',
          selection: '#4CAF50',
          playback: '#FF0000'
        }
      },
      
      storage: {
        type: 'auto'
      },
      
      callbacks: {
        onRecordStart: () => {},
        onRecordStop: () => {},
        onRecordPause: () => {},
        onRecordResume: () => {},
        onPlayStart: () => {},
        onPlayStop: () => {},
        onError: (error) => console.error('VoiceBankRecorder error:', error)
      }
    };
    
    // 深度合併
    return this.deepMerge(defaults, options);
  }
  
  /**
   * 深度合併物件
   * @param {Object} target - 目標物件
   * @param {Object} source - 來源物件
   * @returns {Object}
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  /**
   * 創建儲存適配器
   * @param {Object} storageConfig - 儲存配置
   * @returns {StorageAdapter}
   */
  createStorageAdapter(storageConfig) {
    const { StorageFactory } = require('./storage/index.js');
    return StorageFactory.create({
      type: storageConfig.type || 'auto',
      options: storageConfig
    });
  }
  
  /**
   * 初始化 UI
   */
  initializeUI() {
    // TODO: 實作 UI 初始化
    // 這將在後續階段實作
    console.log('UI initialization - to be implemented');
  }
  
  /**
   * 開始錄音
   * @returns {Promise<void>}
   */
  async startRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Already recording');
      }
      
      // TODO: 實作錄音邏輯
      this.isRecording = true;
      this.options.callbacks.onRecordStart();
      
      console.log('Recording started');
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 停止錄音
   * @returns {Promise<Blob>}
   */
  async stopRecording() {
    try {
      if (!this.isRecording) {
        throw new Error('Not recording');
      }
      
      // TODO: 實作停止錄音邏輯
      this.isRecording = false;
      
      // 模擬返回 Blob（實際會從 AudioEngine 獲取）
      this.currentBlob = null; // TODO: 實際的 Blob
      
      this.options.callbacks.onRecordStop(this.currentBlob);
      
      console.log('Recording stopped');
      return this.currentBlob;
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 暫停錄音
   * @returns {Promise<void>}
   */
  async pauseRecording() {
    try {
      if (!this.isRecording || this.isPaused) {
        throw new Error('Cannot pause');
      }
      
      this.isPaused = true;
      this.options.callbacks.onRecordPause();
      
      console.log('Recording paused');
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 恢復錄音
   * @returns {Promise<void>}
   */
  async resumeRecording() {
    try {
      if (!this.isRecording || !this.isPaused) {
        throw new Error('Cannot resume');
      }
      
      this.isPaused = false;
      this.options.callbacks.onRecordResume();
      
      console.log('Recording resumed');
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 播放錄音
   * @returns {Promise<void>}
   */
  async play() {
    try {
      // TODO: 實作播放邏輯
      this.options.callbacks.onPlayStart();
      
      console.log('Playback started');
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 停止播放
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      // TODO: 實作停止播放邏輯
      this.options.callbacks.onPlayStop();
      
      console.log('Playback stopped');
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 儲存錄音
   * @param {Blob} blob - 音訊 Blob（可選，使用當前錄音）
   * @param {string} filename - 檔案名稱（可選，自動生成）
   * @param {Object} metadata - 元數據（可選）
   * @returns {Promise<string>} 檔案 ID
   */
  async saveRecording(blob = null, filename = null, metadata = {}) {
    try {
      const blobToSave = blob || this.currentBlob;
      
      if (!blobToSave) {
        throw new Error('No recording to save');
      }
      
      const filenameToUse = filename || `recording-${Date.now()}.wav`;
      
      const id = await this.storage.save(blobToSave, filenameToUse, metadata);
      
      console.log('Recording saved:', id);
      return id;
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 載入錄音
   * @param {string} id - 檔案 ID
   * @returns {Promise<Blob>}
   */
  async loadRecording(id) {
    try {
      const blob = await this.storage.load(id);
      this.currentBlob = blob;
      
      console.log('Recording loaded:', id);
      return blob;
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 刪除錄音
   * @param {string} id - 檔案 ID
   * @returns {Promise<boolean>}
   */
  async deleteRecording(id) {
    try {
      const result = await this.storage.delete(id);
      
      console.log('Recording deleted:', id);
      return result;
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 列出所有錄音
   * @returns {Promise<Array>}
   */
  async listRecordings() {
    try {
      const recordings = await this.storage.list();
      
      console.log('Recordings listed:', recordings.length);
      return recordings;
    } catch (error) {
      this.options.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 取得當前錄音 Blob
   * @returns {Blob|null}
   */
  getCurrentBlob() {
    return this.currentBlob;
  }
  
  /**
   * 銷毀實例
   */
  destroy() {
    // TODO: 清理資源
    this.isRecording = false;
    this.isPaused = false;
    this.currentBlob = null;
    
    if (this.storage && typeof this.storage.close === 'function') {
      this.storage.close();
    }
    
    console.log('VoiceBankRecorder destroyed');
  }
}

// 預設導出
export default VoiceBankRecorder;

/**
 * 版本資訊
 */
export const VERSION = '1.0.0';

/**
 * 建置資訊
 */
export const BUILD_INFO = {
  version: VERSION,
  date: new Date().toISOString(),
  name: 'VoiceBank Recorder'
};
