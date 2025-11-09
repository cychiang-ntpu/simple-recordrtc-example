# 跨平台實施計劃：從 PHP 到 JavaScript Library

## 📋 執行摘要

### 當前狀態分析

**優勢 ✅**
- 純前端實作：Web Audio API + AudioWorklet + OffscreenCanvas
- 無外部 CDN 依賴（RecordRTC 已本地化）
- 完整的音訊處理功能（錄音、波形顯示、VU Meter）
- 響應式設計（支援手機/平板/桌面）
- 已有詳細的 REFACTORING_PLAN.md

**需要改進 ⚠️**
- PHP 後端依賴（save.php, delete.php, index.php）
- 檔案上傳使用 XMLHttpRequest 到 PHP 端點
- 無模組化結構（5200+ 行單一 app.js）
- 無 npm package 配置
- 無跨平台儲存抽象層

### 核心問題解答

**Q: 是否要把 PHP 改成 Node.js？**

**A: 不完全需要。更好的方案是：**

1. **前端完全自給自足** - 錄音和播放功能完全在瀏覽器端完成
2. **儲存層抽象化** - 提供統一的儲存介面，支援多種後端：
   - Browser: IndexedDB / LocalStorage
   - Electron: Node.js File System
   - Capacitor: Native File System
   - Server (可選): Node.js / PHP / Python 都可以

3. **PHP 可保留** - 作為可選的伺服器端儲存方案之一，不影響跨平台使用

---

## 🎯 實施策略

### 階段一：模組化重構（1-2 週）

#### 1.1 建立新的目錄結構

```
simple-recordrtc-example/
├── src/                          # 新增：源代碼目錄
│   ├── core/                     # 核心模組
│   │   ├── AudioEngine.js        # 音訊引擎（錄音、AudioContext）
│   │   ├── WaveformManager.js    # 波形管理器
│   │   ├── VUMeter.js           # VU 表管理器
│   │   └── PCMProcessor.js       # PCM 數據處理
│   ├── ui/                       # UI 模組
│   │   ├── RecorderUI.js         # 錄音器 UI 控制器
│   │   ├── ControlPanel.js       # 控制面板
│   │   └── LayoutManager.js      # 佈局管理器
│   ├── storage/                  # 儲存抽象層
│   │   ├── StorageAdapter.js     # 儲存適配器基類
│   │   ├── IndexedDBAdapter.js   # IndexedDB 實現
│   │   ├── ElectronAdapter.js    # Electron 實現
│   │   ├── CapacitorAdapter.js   # Capacitor 實現
│   │   └── ServerAdapter.js      # 伺服器實現（支援 PHP/Node.js）
│   ├── utils/                    # 工具函數
│   │   ├── AudioUtils.js         # 音訊工具
│   │   ├── WavEncoder.js         # WAV 編碼器
│   │   └── PlatformDetector.js   # 平台偵測
│   ├── workers/                  # Web Workers
│   │   ├── wf-worker.js          # 波形繪製 worker（從 public 遷移）
│   │   └── pcm-collector.js      # PCM 收集器（從 public 遷移）
│   └── index.js                  # 主入口點
├── dist/                         # 新增：構建輸出
│   ├── voicebank-recorder.js     # UMD build
│   ├── voicebank-recorder.esm.js # ES Module build
│   ├── voicebank-recorder.min.js # Minified build
│   └── voicebank-recorder.css    # 樣式
├── examples/                     # 新增：範例專案
│   ├── browser/                  # 瀏覽器範例
│   │   └── index.html
│   ├── electron/                 # Electron 範例
│   │   ├── main.js
│   │   ├── preload.js
│   │   ├── renderer.html
│   │   └── package.json
│   ├── capacitor/                # Capacitor 範例
│   │   ├── src/
│   │   ├── capacitor.config.ts
│   │   └── package.json
│   └── node-server/              # Node.js 伺服器範例（替代 PHP）
│       ├── server.js
│       └── package.json
├── public/                       # 保留：原有前端（向後兼容）
│   ├── index.html
│   ├── assets/
│   └── uploads/
├── backend/                      # 保留：PHP 後端（可選）
│   ├── save.php
│   ├── delete.php
│   └── index.php
├── test/                         # 新增：測試
│   ├── unit/
│   └── integration/
├── package.json                  # 新增：npm 配置
├── rollup.config.js             # 新增：構建配置
├── tsconfig.json                # 新增：TypeScript 配置（可選）
└── MIGRATION_GUIDE.md           # 新增：遷移指南
```

#### 1.2 核心模組設計

**AudioEngine.js - 音訊引擎**
```javascript
/**
 * 音訊引擎核心
 * 負責 AudioContext, 錄音, AudioWorklet 管理
 */
export class AudioEngine {
  constructor(options = {}) {
    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      agc: options.agc || false,
      gain: options.gain || 1.0,
      ...options
    };
    
    this.audioContext = null;
    this.recorder = null;
    this.isRecording = false;
    this.mediaStream = null;
  }
  
  async initialize() {
    // 初始化 AudioContext
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  async startRecording() {
    await this.initialize();
    
    // 請求麥克風權限
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.options.sampleRate,
        channelCount: this.options.channels,
        autoGainControl: this.options.agc,
        echoCancellation: false,
        noiseSuppression: false
      }
    });
    
    // 使用 RecordRTC 或自定義錄音器
    // ... 實作細節
    
    this.isRecording = true;
    return this.mediaStream;
  }
  
  async stopRecording() {
    // ... 停止錄音邏輯
    this.isRecording = false;
    return this.getRecordedBlob();
  }
  
  getRecordedBlob() {
    // 返回錄音的 Blob
  }
  
  destroy() {
    // 清理資源
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
```

**StorageAdapter.js - 儲存抽象層**
```javascript
/**
 * 儲存適配器基類
 * 定義統一的儲存介面
 */
export class StorageAdapter {
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案 ID 或 URL
   */
  async save(blob, filename, metadata = {}) {
    throw new Error('save() must be implemented');
  }
  
  /**
   * 載入音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<Blob>}
   */
  async load(id) {
    throw new Error('load() must be implemented');
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    throw new Error('delete() must be implemented');
  }
  
  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    throw new Error('list() must be implemented');
  }
}

/**
 * IndexedDB 實現（瀏覽器端）
 */
export class IndexedDBAdapter extends StorageAdapter {
  constructor(dbName = 'VoiceBankDB', storeName = 'recordings') {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }
  
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('filename', 'filename', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  async save(blob, filename, metadata = {}) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const record = {
        filename,
        blob,
        metadata,
        timestamp: Date.now()
      };
      
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async load(id) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async delete(id) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  async list() {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Electron 檔案系統實現
 */
export class ElectronAdapter extends StorageAdapter {
  constructor(savePath = 'recordings') {
    super();
    this.savePath = savePath;
  }
  
  async save(blob, filename, metadata = {}) {
    // 通過 Electron IPC 保存檔案
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const result = await window.electronAPI.saveRecording({
      filename,
      buffer,
      metadata
    });
    
    return result.id;
  }
  
  async load(id) {
    const buffer = await window.electronAPI.loadRecording(id);
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  async delete(id) {
    return await window.electronAPI.deleteRecording(id);
  }
  
  async list() {
    return await window.electronAPI.listRecordings();
  }
}

/**
 * Capacitor 檔案系統實現
 */
export class CapacitorAdapter extends StorageAdapter {
  constructor() {
    super();
    this.directory = 'recordings';
  }
  
  async save(blob, filename, metadata = {}) {
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    
    // 轉換 Blob 為 base64
    const base64Data = await this.blobToBase64(blob);
    
    await Filesystem.writeFile({
      path: `${this.directory}/${filename}`,
      data: base64Data,
      directory: Directory.Documents
    });
    
    // 保存元數據
    await Filesystem.writeFile({
      path: `${this.directory}/${filename}.meta.json`,
      data: JSON.stringify(metadata),
      directory: Directory.Documents
    });
    
    return filename;
  }
  
  async load(filename) {
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    
    const result = await Filesystem.readFile({
      path: `${this.directory}/${filename}`,
      directory: Directory.Documents
    });
    
    return this.base64ToBlob(result.data, 'audio/wav');
  }
  
  async delete(filename) {
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    
    await Filesystem.deleteFile({
      path: `${this.directory}/${filename}`,
      directory: Directory.Documents
    });
    
    // 刪除元數據
    try {
      await Filesystem.deleteFile({
        path: `${this.directory}/${filename}.meta.json`,
        directory: Directory.Documents
      });
    } catch (e) {
      // 元數據可能不存在
    }
    
    return true;
  }
  
  async list() {
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    
    const result = await Filesystem.readdir({
      path: this.directory,
      directory: Directory.Documents
    });
    
    return result.files.filter(f => !f.endsWith('.meta.json'));
  }
  
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

/**
 * 伺服器適配器（支援 PHP/Node.js）
 */
export class ServerAdapter extends StorageAdapter {
  constructor(config = {}) {
    super();
    this.baseURL = config.baseURL || '';
    this.saveEndpoint = config.saveEndpoint || '/backend/save.php';
    this.loadEndpoint = config.loadEndpoint || '/public/uploads/';
    this.deleteEndpoint = config.deleteEndpoint || '/backend/delete.php';
  }
  
  async save(blob, filename, metadata = {}) {
    const formData = new FormData();
    formData.append('audio-blob', blob);
    formData.append('audio-filename', filename);
    
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    
    const response = await fetch(this.baseURL + this.saveEndpoint, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed: ' + response.statusText);
    }
    
    return filename;
  }
  
  async load(filename) {
    const response = await fetch(this.baseURL + this.loadEndpoint + filename);
    
    if (!response.ok) {
      throw new Error('Load failed: ' + response.statusText);
    }
    
    return await response.blob();
  }
  
  async delete(filename) {
    const response = await fetch(this.baseURL + this.deleteEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename })
    });
    
    return response.ok;
  }
  
  async list() {
    // 需要額外的 API 端點
    throw new Error('Server list() not implemented');
  }
}
```

**主入口 index.js**
```javascript
/**
 * VoiceBank Recorder - 主入口
 * 跨平台音訊錄音庫
 */
import { AudioEngine } from './core/AudioEngine.js';
import { WaveformManager } from './core/WaveformManager.js';
import { RecorderUI } from './ui/RecorderUI.js';
import { 
  IndexedDBAdapter, 
  ElectronAdapter, 
  CapacitorAdapter, 
  ServerAdapter 
} from './storage/StorageAdapter.js';
import { PlatformDetector } from './utils/PlatformDetector.js';

export class VoiceBankRecorder {
  constructor(options = {}) {
    this.options = this.mergeOptions(options);
    
    // 自動偵測平台並選擇適當的儲存適配器
    this.storage = this.createStorageAdapter(options.storage);
    
    // 初始化核心模組
    this.audioEngine = new AudioEngine(this.options.audio);
    this.waveformManager = new WaveformManager(this.options.waveform);
    
    // 初始化 UI（如果提供了容器）
    if (this.options.container) {
      this.ui = new RecorderUI(this.options.container, this);
    }
    
    // 事件處理
    this.setupEventHandlers();
  }
  
  mergeOptions(options) {
    return {
      container: options.container || null,
      layout: options.layout || 'auto',
      theme: options.theme || 'light',
      
      audio: {
        sampleRate: 48000,
        channels: 1,
        agc: false,
        gain: 1.0,
        ...(options.audio || {})
      },
      
      waveform: {
        showOverview: true,
        decimation: 10,
        colors: {
          waveform: '#1E88E5',
          selection: '#4CAF50',
          playback: '#FF0000'
        },
        ...(options.waveform || {})
      },
      
      storage: options.storage || {},
      
      callbacks: {
        onRecordStart: options.onRecordStart || (() => {}),
        onRecordStop: options.onRecordStop || (() => {}),
        onError: options.onError || console.error
      }
    };
  }
  
  createStorageAdapter(storageConfig) {
    const platform = PlatformDetector.detect();
    const type = storageConfig.type || platform;
    
    switch (type) {
      case 'electron':
        return new ElectronAdapter(storageConfig.path);
      
      case 'capacitor':
        return new CapacitorAdapter();
      
      case 'server':
        return new ServerAdapter(storageConfig);
      
      case 'browser':
      default:
        return new IndexedDBAdapter(
          storageConfig.dbName,
          storageConfig.storeName
        );
    }
  }
  
  setupEventHandlers() {
    // 設定事件處理邏輯
  }
  
  // 公開 API
  async startRecording() {
    try {
      await this.audioEngine.startRecording();
      this.options.callbacks.onRecordStart();
    } catch (error) {
      this.options.callbacks.onError(error);
    }
  }
  
  async stopRecording() {
    try {
      const blob = await this.audioEngine.stopRecording();
      this.options.callbacks.onRecordStop(blob);
      return blob;
    } catch (error) {
      this.options.callbacks.onError(error);
    }
  }
  
  async saveRecording(blob, filename) {
    return await this.storage.save(blob, filename);
  }
  
  async loadRecording(id) {
    return await this.storage.load(id);
  }
  
  play() {
    // 播放邏輯
  }
  
  pause() {
    // 暫停邏輯
  }
  
  stop() {
    // 停止邏輯
  }
  
  destroy() {
    this.audioEngine.destroy();
    if (this.ui) {
      this.ui.destroy();
    }
  }
}

// 預設導出
export default VoiceBankRecorder;

// 也導出各個模組供進階使用
export {
  AudioEngine,
  WaveformManager,
  IndexedDBAdapter,
  ElectronAdapter,
  CapacitorAdapter,
  ServerAdapter,
  PlatformDetector
};
```

---

### 階段二：構建系統設置（3-5 天）

#### 2.1 package.json 配置

```json
{
  "name": "voicebank-recorder",
  "version": "1.0.0",
  "description": "跨平台音訊錄音庫，支援 Browser/Electron/Capacitor",
  "main": "dist/voicebank-recorder.js",
  "module": "dist/voicebank-recorder.esm.js",
  "unpkg": "dist/voicebank-recorder.min.js",
  "types": "dist/index.d.ts",
  
  "files": [
    "dist",
    "src",
    "README.md",
    "LICENSE"
  ],
  
  "scripts": {
    "dev": "rollup -c -w",
    "build": "rollup -c",
    "build:prod": "NODE_ENV=production rollup -c",
    "lint": "eslint src/**/*.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "docs": "jsdoc -c jsdoc.json",
    "prepare": "npm run build"
  },
  
  "keywords": [
    "audio",
    "recorder",
    "waveform",
    "visualization",
    "cross-platform",
    "electron",
    "capacitor",
    "web-audio-api"
  ],
  
  "author": "Your Name",
  "license": "MIT",
  
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/voicebank-recorder.git"
  },
  
  "bugs": {
    "url": "https://github.com/yourusername/voicebank-recorder/issues"
  },
  
  "homepage": "https://github.com/yourusername/voicebank-recorder#readme",
  
  "devDependencies": {
    "@rollup/plugin-commonjs": "^25.0.0",
    "@rollup/plugin-node-resolve": "^15.0.0",
    "@rollup/plugin-terser": "^0.4.0",
    "rollup": "^4.0.0",
    "rollup-plugin-copy": "^3.5.0",
    "eslint": "^8.50.0",
    "jest": "^29.7.0"
  },
  
  "peerDependencies": {},
  
  "engines": {
    "node": ">=14.0.0"
  }
}
```

#### 2.2 Rollup 配置

```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';

const production = process.env.NODE_ENV === 'production';

export default [
  // UMD build - 瀏覽器直接使用
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: true,
      banner: `/*! VoiceBank Recorder v1.0.0 | MIT License */`
    },
    plugins: [
      resolve({
        browser: true
      }),
      commonjs(),
      copy({
        targets: [
          { src: 'public/assets/css/style.css', dest: 'dist', rename: 'voicebank-recorder.css' },
          { src: 'src/workers/*', dest: 'dist/workers' }
        ]
      })
    ]
  },
  
  // ES Module build - 現代打包工具
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve({
        browser: true
      }),
      commonjs()
    ]
  },
  
  // Minified build - 生產環境
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.min.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: true,
      banner: `/*! VoiceBank Recorder v1.0.0 | MIT License */`
    },
    plugins: [
      resolve({
        browser: true
      }),
      commonjs(),
      terser({
        compress: {
          drop_console: production
        }
      })
    ]
  }
];
```

---

### 階段三：平台特定實現（1-2 週）

#### 3.1 Electron 範例專案

**examples/electron/package.json**
```json
{
  "name": "voicebank-recorder-electron",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "voicebank-recorder": "^1.0.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  },
  "build": {
    "appId": "com.voicebank.recorder",
    "mac": {
      "category": "public.app-category.utilities"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

**examples/electron/main.js**
```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  mainWindow.loadFile('renderer.html');
  
  // 開發模式下開啟 DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// 處理錄音保存
ipcMain.handle('save-recording', async (event, { filename, buffer, metadata }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'Audio Files', extensions: ['wav'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    // 保存音訊檔案
    await fs.writeFile(result.filePath, buffer);
    
    // 保存元數據
    if (metadata) {
      const metaPath = result.filePath + '.meta.json';
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    }
    
    return { 
      success: true, 
      id: result.filePath,
      path: result.filePath 
    };
  } catch (error) {
    console.error('Save recording error:', error);
    return { success: false, error: error.message };
  }
});

// 處理錄音載入
ipcMain.handle('load-recording', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer;
  } catch (error) {
    console.error('Load recording error:', error);
    throw error;
  }
});

// 處理錄音刪除
ipcMain.handle('delete-recording', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    
    // 嘗試刪除元數據
    try {
      await fs.unlink(filePath + '.meta.json');
    } catch (e) {
      // 元數據可能不存在
    }
    
    return { success: true };
  } catch (error) {
    console.error('Delete recording error:', error);
    return { success: false, error: error.message };
  }
});

// 列出錄音
ipcMain.handle('list-recordings', async (event, directory) => {
  try {
    const files = await fs.readdir(directory || app.getPath('documents'));
    const wavFiles = files.filter(f => f.endsWith('.wav'));
    
    const recordings = await Promise.all(
      wavFiles.map(async (filename) => {
        const filePath = path.join(directory || app.getPath('documents'), filename);
        const stats = await fs.stat(filePath);
        
        let metadata = {};
        try {
          const metaData = await fs.readFile(filePath + '.meta.json', 'utf-8');
          metadata = JSON.parse(metaData);
        } catch (e) {
          // 沒有元數據
        }
        
        return {
          id: filePath,
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          metadata
        };
      })
    );
    
    return recordings;
  } catch (error) {
    console.error('List recordings error:', error);
    return [];
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

**examples/electron/preload.js**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  loadRecording: (filePath) => ipcRenderer.invoke('load-recording', filePath),
  deleteRecording: (filePath) => ipcRenderer.invoke('delete-recording', filePath),
  listRecordings: (directory) => ipcRenderer.invoke('list-recordings', directory)
});

// 標記為 Electron 環境
contextBridge.exposeInMainWorld('isElectron', true);
```

**examples/electron/renderer.html**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VoiceBank Recorder - Electron</title>
  <link rel="stylesheet" href="../../dist/voicebank-recorder.css">
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    #app {
      max-width: 1200px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div id="app">
    <h1>VoiceBank Recorder - Electron Edition</h1>
    <div id="recorder-container"></div>
  </div>
  
  <script src="../../dist/voicebank-recorder.js"></script>
  <script>
    // 初始化錄音器
    const recorder = new VoiceBankRecorder({
      container: '#recorder-container',
      layout: 'horizontal',
      
      storage: {
        type: 'electron'
      },
      
      onRecordStart: () => {
        console.log('Recording started');
      },
      
      onRecordStop: async (blob) => {
        console.log('Recording stopped', blob);
        
        // 自動保存
        const filename = `recording-${Date.now()}.wav`;
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const result = await window.electronAPI.saveRecording({
          filename,
          buffer: Array.from(buffer),
          metadata: {
            duration: recorder.getDuration(),
            sampleRate: recorder.getSampleRate()
          }
        });
        
        if (result.success) {
          alert(`Saved to: ${result.path}`);
        }
      },
      
      onError: (error) => {
        console.error('Error:', error);
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>
```

#### 3.2 Capacitor 範例專案

**examples/capacitor/capacitor.config.ts**
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicebank.recorder',
  appName: 'VoiceBank Recorder',
  webDir: 'www',
  bundledWebRuntime: false,
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff'
    },
    Filesystem: {
      // 檔案系統配置
    }
  },
  
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff'
  },
  
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined
    }
  }
};

export default config;
```

**examples/capacitor/src/index.html**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>VoiceBank Recorder</title>
  <link rel="stylesheet" href="../../dist/voicebank-recorder.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      -webkit-user-select: none;
      user-select: none;
    }
    #app {
      width: 100%;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="recorder-container"></div>
  </div>
  
  <script src="../../dist/voicebank-recorder.js"></script>
  <script type="module">
    import { Capacitor } from '@capacitor/core';
    import { Filesystem, Directory } from '@capacitor/filesystem';
    import { Permissions } from '@capacitor/permissions';
    
    // 請求權限
    async function requestPermissions() {
      const result = await Permissions.requestPermissions({
        permissions: ['microphone']
      });
      
      return result.microphone === 'granted';
    }
    
    // 初始化
    async function init() {
      const hasPermission = await requestPermissions();
      
      if (!hasPermission) {
        alert('需要麥克風權限才能錄音');
        return;
      }
      
      const recorder = new VoiceBankRecorder({
        container: '#recorder-container',
        layout: 'vertical', // 手機使用垂直佈局
        
        storage: {
          type: 'capacitor'
        },
        
        onRecordStop: async (blob) => {
          // 自動保存到裝置
          const filename = `recording-${Date.now()}.wav`;
          await recorder.saveRecording(blob, filename);
          
          // 顯示通知
          if (Capacitor.isPluginAvailable('Toast')) {
            const { Toast } = await import('@capacitor/toast');
            await Toast.show({
              text: '錄音已保存！'
            });
          }
        }
      });
    }
    
    // 等待 Capacitor 就緒
    if (Capacitor.isNativePlatform()) {
      document.addEventListener('deviceready', init);
    } else {
      init();
    }
  </script>
</body>
</html>
```

#### 3.3 Node.js 伺服器範例（替代 PHP）

**examples/node-server/server.js**
```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 設定檔案上傳
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    
    // 確保目錄存在
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 使用原始檔名或自動生成
    const filename = req.body['audio-filename'] || 
                    `recording-${Date.now()}.wav`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(wav|webm|ogg)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only WAV, WebM, and OGG allowed.'));
    }
  }
});

// 上傳端點（兼容原 PHP API）
app.post('/api/save', upload.single('audio-blob'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
    
    // 保存元數據（如果提供）
    if (req.body.metadata) {
      const metaPath = req.file.path + '.meta.json';
      await fs.writeFile(metaPath, req.body.metadata);
    }
    
    res.send('success'); // 兼容原 PHP 回應
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send('Upload failed: ' + error.message);
  }
});

// 列出所有錄音
app.get('/api/recordings', async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, 'uploads');
    const files = await fs.readdir(uploadDir);
    
    const recordings = await Promise.all(
      files
        .filter(f => f.endsWith('.wav'))
        .map(async (filename) => {
          const filePath = path.join(uploadDir, filename);
          const stats = await fs.stat(filePath);
          
          let metadata = {};
          try {
            const metaData = await fs.readFile(filePath + '.meta.json', 'utf-8');
            metadata = JSON.parse(metaData);
          } catch (e) {
            // 沒有元數據
          }
          
          return {
            filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            url: `/uploads/${filename}`,
            metadata
          };
        })
    );
    
    res.json(recordings);
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 刪除錄音（兼容原 PHP API）
app.post('/api/delete', express.json(), async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'No filename provided' });
    }
    
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // 刪除音訊檔案
    await fs.unlink(filePath);
    
    // 刪除元數據
    try {
      await fs.unlink(filePath + '.meta.json');
    } catch (e) {
      // 元數據可能不存在
    }
    
    res.send('success'); // 兼容原 PHP 回應
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).send('Delete failed: ' + error.message);
  }
});

// 提供上傳的檔案
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Upload endpoint: http://localhost:${PORT}/api/save`);
});
```

**examples/node-server/package.json**
```json
{
  "name": "voicebank-recorder-server",
  "version": "1.0.0",
  "description": "Node.js server for VoiceBank Recorder",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

### 階段四：遷移與向後兼容（3-5 天）

#### 4.1 遷移策略

**保留原有 public/ 目錄**
- 原有的 `public/index.html` 繼續使用 `app.js`
- 提供遷移指南，逐步引導用戶轉換到新 API

**提供適配器層**
```javascript
// compatibility-adapter.js
// 使舊代碼能夠使用新 library

(function() {
  if (typeof VoiceBankRecorder === 'undefined') {
    console.warn('VoiceBankRecorder not loaded');
    return;
  }
  
  // 創建全域實例（模擬舊行為）
  window.recorderInstance = new VoiceBankRecorder({
    container: '#waveform-wrapper',
    storage: {
      type: 'server',
      saveEndpoint: '../backend/save.php',
      deleteEndpoint: '../backend/delete.php'
    }
  });
  
  // 導出舊 API
  window.startRecording = () => recorderInstance.startRecording();
  window.stopRecording = () => recorderInstance.stopRecording();
  // ... 其他舊函數映射
})();
```

#### 4.2 PHP 後端保留方案

**保留 backend/ 目錄**
- `save.php`, `delete.php`, `index.php` 維持不變
- 作為可選的伺服器端儲存方案
- 在文檔中說明如何配置

**在 library 中支援 PHP 後端**
```javascript
// 使用 ServerAdapter 連接到 PHP 後端
const recorder = new VoiceBankRecorder({
  storage: {
    type: 'server',
    baseURL: '',
    saveEndpoint: '/backend/save.php',
    loadEndpoint: '/public/uploads/',
    deleteEndpoint: '/backend/delete.php'
  }
});
```

---

## 📚 使用範例

### 瀏覽器（純前端，無後端）

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="voicebank-recorder.css">
</head>
<body>
  <div id="recorder"></div>
  
  <script src="voicebank-recorder.min.js"></script>
  <script>
    const recorder = new VoiceBankRecorder({
      container: '#recorder',
      layout: 'auto',
      
      // 使用 IndexedDB 儲存（瀏覽器本地）
      storage: {
        type: 'browser'
      }
    });
  </script>
</body>
</html>
```

### 瀏覽器 + PHP 後端

```html
<script src="voicebank-recorder.min.js"></script>
<script>
  const recorder = new VoiceBankRecorder({
    container: '#recorder',
    
    // 使用 PHP 後端
    storage: {
      type: 'server',
      saveEndpoint: '/backend/save.php',
      deleteEndpoint: '/backend/delete.php'
    }
  });
</script>
```

### 瀏覽器 + Node.js 後端

```html
<script src="voicebank-recorder.min.js"></script>
<script>
  const recorder = new VoiceBankRecorder({
    container: '#recorder',
    
    // 使用 Node.js API
    storage: {
      type: 'server',
      baseURL: 'http://localhost:3000',
      saveEndpoint: '/api/save',
      deleteEndpoint: '/api/delete'
    }
  });
</script>
```

### Electron

```javascript
// renderer.js
import VoiceBankRecorder from 'voicebank-recorder';

const recorder = new VoiceBankRecorder({
  container: '#recorder',
  
  storage: {
    type: 'electron'
    // electronAPI 會自動從 preload.js 注入
  }
});
```

### React 集成

```jsx
import React, { useEffect, useRef } from 'react';
import VoiceBankRecorder from 'voicebank-recorder';
import 'voicebank-recorder/dist/voicebank-recorder.css';

function RecorderComponent() {
  const containerRef = useRef(null);
  const recorderRef = useRef(null);
  
  useEffect(() => {
    recorderRef.current = new VoiceBankRecorder({
      container: containerRef.current,
      layout: 'horizontal',
      
      onRecordStart: () => {
        console.log('Recording started');
      },
      
      onRecordStop: (blob) => {
        console.log('Recording stopped', blob);
      }
    });
    
    return () => {
      if (recorderRef.current) {
        recorderRef.current.destroy();
      }
    };
  }, []);
  
  return <div ref={containerRef} />;
}

export default RecorderComponent;
```

### Vue 集成

```vue
<template>
  <div ref="recorderContainer"></div>
</template>

<script>
import VoiceBankRecorder from 'voicebank-recorder';
import 'voicebank-recorder/dist/voicebank-recorder.css';

export default {
  name: 'RecorderComponent',
  
  mounted() {
    this.recorder = new VoiceBankRecorder({
      container: this.$refs.recorderContainer,
      layout: 'horizontal'
    });
  },
  
  beforeUnmount() {
    if (this.recorder) {
      this.recorder.destroy();
    }
  }
};
</script>
```

---

## 🔄 遷移時間表

### 第 1-2 週：模組化重構
- [ ] 建立 src/ 目錄結構
- [ ] 提取 AudioEngine 類別
- [ ] 提取 WaveformManager 類別
- [ ] 提取 StorageAdapter 及各平台實現
- [ ] 建立主入口 index.js

### 第 3 週：構建系統
- [ ] 配置 Rollup
- [ ] 配置 package.json
- [ ] 測試 UMD/ESM builds
- [ ] 建立範例頁面

### 第 4-5 週：平台適配
- [ ] Electron 範例專案
- [ ] Capacitor 範例專案
- [ ] Node.js 伺服器範例
- [ ] 平台特定測試

### 第 6 週：文檔與測試
- [ ] API 文檔
- [ ] 使用指南
- [ ] 遷移指南
- [ ] 單元測試
- [ ] 整合測試

### 第 7 週：發布準備
- [ ] NPM 發布配置
- [ ] 版本標籤
- [ ] GitHub Release
- [ ] 宣傳與推廣

---

## ✅ 總結建議

### 關於 PHP vs Node.js

**不需要完全替換 PHP**，而是：

1. **提供多種選擇**
   - IndexedDB（純前端）
   - PHP 後端（保留）
   - Node.js 後端（新增）
   - Electron 本地檔案
   - Capacitor 原生檔案

2. **PHP 的保留價值**
   - 現有用戶不受影響
   - 簡單部署（共享主機支援）
   - 成熟穩定

3. **Node.js 的優勢**
   - 統一的 JavaScript 生態
   - 更好的 WebSocket 支援（即時功能）
   - 更容易與現代前端框架整合
   - npm 套件生態

### 推薦方案

**建議同時提供兩者**：
- PHP 作為傳統方案（向後兼容）
- Node.js 作為推薦方案（新專案）
- 讓用戶根據需求選擇

### 優先級

1. **高優先級**（立即執行）
   - 模組化重構
   - 儲存抽象層
   - 基礎構建系統

2. **中優先級**（1-2 月內）
   - Electron 支援
   - Node.js 伺服器範例
   - 完整文檔

3. **低優先級**（有需求時）
   - Capacitor 支援
   - TypeScript 定義
   - 進階功能

---

**製作日期：** 2025-11-09  
**版本：** 2.0  
**狀態：** Implementation Ready
