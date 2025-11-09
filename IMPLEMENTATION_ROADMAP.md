# VoiceBank Recorder - 跨平台實施路線圖

> **目標：** 將 simple-recordrtc-example 轉換為可在 Browser/Electron/Capacitor 跨平台使用的 JavaScript Library

**最後更新：** 2025-11-09  
**當前版本：** 1.0.0-beta  
**目標版本：** 1.0.0

---

## 📊 當前狀態總覽

### ✅ 已完成 (70%)

| 模組 | 狀態 | 行數 | 說明 |
|------|------|------|------|
| **AudioEngine** | ✅ 完成 | 800 | 錄音引擎，支援 AudioWorklet/RecordRTC |
| **WaveformRenderer** | ✅ 完成 | 1,198 | 4種波形可視化，已優化渲染性能 |
| **Workers** | ✅ 完成 | 576 | wf-worker.js + pcm-collector.js |
| **Storage/IndexedDB** | ✅ 完成 | 150+ | 瀏覽器本地儲存 |
| **Storage/Server** | ✅ 完成 | 100+ | PHP/Node.js 後端儲存 |
| **Storage/Electron** | ✅ 完成 | 80+ | 檔案系統儲存 |
| **Storage/Capacitor** | ✅ 完成 | 120+ | 原生檔案系統 |
| **Storage/Factory** | ✅ 完成 | 50+ | 自動平台偵測 |
| **Utils/PlatformDetector** | ✅ 完成 | 80+ | 平台偵測工具 |

### ⚠️ 進行中 (20%)

| 模組 | 狀態 | 預估行數 | 優先級 |
|------|------|----------|--------|
| **UI Controllers** | 🟡 未開始 | ~1,500 | 🔴 高 |
| **VoiceBankRecorder** | 🟡 部分 | 300 | 🔴 高 |
| **Rollup Build** | 🟡 未開始 | 配置 | 🔴 高 |

### ❌ 待完成 (10%)

| 任務 | 預估時間 | 優先級 |
|------|----------|--------|
| **範例專案** | 2-3天 | 🟠 中 |
| **文檔撰寫** | 1-2天 | 🟠 中 |
| **單元測試** | 3-5天 | 🟡 低 |

---

## 🎯 Phase 1: 核心功能完善（本週內完成）

### Task 1.1: 修復 test-storage.html ✅ 

**狀態：** 已完成  
**變更：**
- ✅ 新增 `IndexedDBAdapter.clear()` 方法
- ✅ 新增 `IndexedDBAdapter.getStorageEstimate()` 方法
- ✅ test-storage.html 現在可以正常運作

### Task 1.2: 提取 UI 模組到 src/ui/ 🔴

**優先級：** 最高  
**預估時間：** 1-2 天  
**來源：** `public/assets/js/app.js` (5,208 行)

#### 需要提取的模組：

1. **RecorderUI.js** (主控制器，~300行)
   - 管理所有 UI 組件
   - 協調 AudioEngine 和 WaveformRenderer
   - 事件處理和狀態管理

2. **ControlPanel.js** (~200行)
   - 錄音/播放/暫停/停止按鈕
   - 時間顯示
   - 狀態指示器

3. **PlaybackController.js** (~250行)
   - 播放控制邏輯
   - 進度條
   - 音量控制
   - Seek 功能

4. **LayoutManager.js** (~150行)
   - 水平/垂直佈局切換
   - 響應式設計邏輯
   - Canvas 尺寸調整

5. **SettingsPanel.js** (~200行)
   - 高級設定
   - 音訊參數配置
   - 波形顯示選項

6. **TimeDisplay.js** (~100行)
   - 時間格式化
   - 樣本數轉時間
   - 時間計算

#### 實施步驟：

```javascript
// 1. 創建基礎結構
src/ui/
├── RecorderUI.js       # ← 從 app.js 提取主控制器
├── ControlPanel.js     # ← 提取按鈕控制邏輯
├── PlaybackController.js  # ← 提取播放相關邏輯
├── LayoutManager.js    # ← 提取佈局管理
├── SettingsPanel.js    # ← 提取設定面板
├── TimeDisplay.js      # ← 提取時間顯示工具
└── index.js            # ← 統一導出

// 2. 從 app.js 識別代碼區塊
// 搜尋關鍵字：
- "btnToggleRecording" → ControlPanel
- "btnPlay", "btnPause", "btnStop" → PlaybackController  
- "updateLayoutMode" → LayoutManager
- "showAdvancedSettings" → SettingsPanel
- "formatDuration" → TimeDisplay

// 3. 逐個提取並測試
// 每完成一個模組就測試一次
```

**預期成果：**
```javascript
// src/ui/RecorderUI.js 範例架構
export class RecorderUI {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    this.options = options;
    
    // 子模組
    this.controlPanel = new ControlPanel(this);
    this.playback = new PlaybackController(this);
    this.layout = new LayoutManager(this);
    this.settings = new SettingsPanel(this);
    
    // 與核心模組的引用
    this.audioEngine = options.audioEngine;
    this.waveformRenderer = options.waveformRenderer;
  }
  
  initialize() {
    this.renderUI();
    this.bindEvents();
  }
  
  renderUI() {
    // 創建 DOM 結構
    this.container.innerHTML = `
      <div class="voicebank-recorder">
        <div class="recorder-controls"></div>
        <div class="waveform-container"></div>
        <div class="playback-controls"></div>
      </div>
    `;
  }
  
  bindEvents() {
    // 綁定所有事件
  }
}
```

### Task 1.3: 完善 VoiceBankRecorder 主類別 🔴

**檔案：** `src/index.js`  
**當前狀態：** 骨架已建立，需實現核心邏輯  
**預估時間：** 0.5-1 天

#### 需要完成的方法：

```javascript
export class VoiceBankRecorder {
  constructor(options = {}) {
    // ✅ 已完成
  }
  
  // ❌ 待實現
  async initialize() {
    // 1. 初始化 AudioEngine
    this.audioEngine = new AudioEngine(this.options.audio);
    await this.audioEngine.initialize();
    
    // 2. 初始化 WaveformRenderer
    this.waveformRenderer = new WaveformRenderer({
      ...this.options.waveform,
      analyserNode: this.audioEngine.analyserNode
    });
    await this.waveformRenderer.initialize();
    
    // 3. 初始化 UI（如果有容器）
    if (this.options.container) {
      this.ui = new RecorderUI(this.options.container, {
        audioEngine: this.audioEngine,
        waveformRenderer: this.waveformRenderer
      });
      this.ui.initialize();
    }
    
    // 4. 綁定事件
    this.setupEventListeners();
    
    this.initialized = true;
  }
  
  setupEventListeners() {
    // AudioEngine 事件
    this.audioEngine.on('recording-start', () => {
      this.isRecording = true;
      if (this.ui) this.ui.setRecordingState(true);
      this.options.callbacks.onRecordStart();
    });
    
    this.audioEngine.on('recording-stop', (data) => {
      this.isRecording = false;
      this.currentBlob = data.blob;
      if (this.ui) this.ui.setRecordingState(false);
      this.options.callbacks.onRecordStop(data.blob);
    });
    
    this.audioEngine.on('data-available', (data) => {
      if (data.pcmData && this.waveformRenderer) {
        this.waveformRenderer.appendPCM(data.pcmData);
      }
    });
    
    // WaveformRenderer 事件
    // ... 其他事件綁定
  }
  
  // 實現所有公開方法
  async startRecording() {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.audioEngine.startRecording();
  }
  
  async stopRecording() {
    const result = await this.audioEngine.stopRecording();
    this.currentBlob = result.blob;
    return result;
  }
  
  // ... 其他方法
}
```

### Task 1.4: 整合 Workers 到功能中 🟡

**狀態：** Workers 已存在，需正確引入

#### 當前問題：
- ✅ `src/workers/wf-worker.js` 已存在 (527行)
- ✅ `src/workers/pcm-collector.js` 已存在 (49行)  
- ❌ WaveformRenderer 中未正確啟用 Worker 模式
- ❌ AudioEngine 中未使用 pcm-collector.js

#### 解決方案：

**1. 修改 WaveformRenderer.js：**

```javascript
// 當前（test-waveform.html）
useWorker: false  // 為了調試暫時禁用

// 應該改為
useWorker: true   // 生產環境啟用
workerPath: './src/workers/wf-worker.js'  // 正確的路徑
```

**2. 修改 AudioEngine.js：**

```javascript
// 新增 AudioWorklet 初始化
async initializeAudioWorklet() {
  if (this.audioContext.audioWorklet) {
    try {
      await this.audioContext.audioWorklet.addModule(
        './src/workers/pcm-collector.js'
      );
      
      this.pcmCollector = new AudioWorkletNode(
        this.audioContext, 
        'pcm-collector'
      );
      
      this.pcmCollector.port.onmessage = (event) => {
        if (event.data.type === 'pcm') {
          const pcmData = new Float32Array(
            event.data.buffer, 
            0, 
            event.data.length
          );
          this.emit('data-available', { pcmData });
        }
      };
      
      return true;
    } catch (error) {
      console.warn('AudioWorklet failed:', error);
      return false;
    }
  }
  return false;
}
```

---

## 🎯 Phase 2: 構建系統配置（預計 1-2 天）

### Task 2.1: 配置 Rollup

**目標：** 生成多種格式的構建檔案

#### rollup.config.js

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const banner = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License */`;

const production = process.env.NODE_ENV === 'production';

export default [
  // UMD build - 瀏覽器 <script> 標籤
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: !production,
      banner,
      globals: {
        // 外部依賴映射（如果有）
      }
    },
    plugins: [
      resolve({ browser: true }),
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
      sourcemap: !production,
      banner
    },
    plugins: [
      resolve({ browser: true }),
      commonjs()
    ]
  },
  
  // Minified build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.min.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: true,
      banner
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      terser({
        compress: {
          drop_console: production,
          drop_debugger: production
        }
      })
    ]
  }
];
```

#### package.json 更新

```json
{
  "name": "voicebank-recorder",
  "version": "1.0.0",
  "description": "跨平台音訊錄音庫 - Browser/Electron/Capacitor",
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
    "test": "node test-audioengine.html && node test-waveform.html && node test-storage.html",
    "lint": "eslint src/**/*.js",
    "prepare": "npm run build",
    "serve": "python3 -m http.server 8000"
  },
  
  "keywords": [
    "audio",
    "recorder",
    "waveform",
    "visualization",
    "cross-platform",
    "electron",
    "capacitor",
    "web-audio-api",
    "recordrtc"
  ],
  
  "author": "Your Name",
  "license": "MIT",
  
  "repository": {
    "type": "git",
    "url": "https://github.com/cychiang-ntpu/simple-recordrtc-example.git"
  },
  
  "devDependencies": {
    "@rollup/plugin-commonjs": "^25.0.0",
    "@rollup/plugin-node-resolve": "^15.0.0",
    "@rollup/plugin-terser": "^0.4.0",
    "rollup": "^4.0.0",
    "rollup-plugin-copy": "^3.5.0",
    "eslint": "^8.50.0"
  },
  
  "engines": {
    "node": ">=14.0.0"
  }
}
```

#### 安裝依賴

```bash
npm install --save-dev \
  rollup \
  @rollup/plugin-node-resolve \
  @rollup/plugin-commonjs \
  @rollup/plugin-terser \
  rollup-plugin-copy
```

#### 構建命令

```bash
# 開發模式（監聽變更）
npm run dev

# 生產構建
npm run build:prod

# 結果：
# dist/voicebank-recorder.js         (UMD, 未壓縮)
# dist/voicebank-recorder.esm.js     (ES Module)
# dist/voicebank-recorder.min.js     (UMD, 壓縮)
# dist/voicebank-recorder.css        (樣式)
# dist/workers/wf-worker.js
# dist/workers/pcm-collector.js
```

---

## 🎯 Phase 3: 跨平台範例專案（預計 2-3 天）

### Task 3.1: Browser 範例

**目錄：** `examples/browser/`

```html
<!-- examples/browser/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoiceBank Recorder - Browser Demo</title>
  <link rel="stylesheet" href="../../dist/voicebank-recorder.css">
</head>
<body>
  <div id="recorder"></div>
  
  <script src="../../dist/voicebank-recorder.min.js"></script>
  <script>
    // 使用瀏覽器 IndexedDB 儲存
    const recorder = new VoiceBankRecorder({
      container: '#recorder',
      layout: 'auto',
      
      storage: {
        type: 'browser'  // 使用 IndexedDB
      },
      
      onRecordStop: (blob) => {
        console.log('Recording stopped', blob.size);
      }
    });
    
    // 自動初始化
    recorder.initialize();
  </script>
</body>
</html>
```

### Task 3.2: Electron 範例

**目錄：** `examples/electron/`

```
examples/electron/
├── main.js              # 主程序
├── preload.js           # Preload 腳本
├── renderer.html        # 渲染器頁面
├── package.json         # 專案配置
└── README.md            # 使用說明
```

**main.js:**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
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
}

// IPC 處理器
ipcMain.handle('save-recording', async (event, { filename, buffer, metadata }) => {
  const savePath = path.join(app.getPath('documents'), 'VoiceBank', filename);
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, buffer);
  return { success: true, path: savePath };
});

app.whenReady().then(createWindow);
```

**package.json:**

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
  }
}
```

### Task 3.3: Capacitor 範例

**目錄：** `examples/capacitor/`

```
examples/capacitor/
├── src/
│   └── index.html       # Web 頁面
├── capacitor.config.ts  # Capacitor 配置
├── package.json
└── README.md
```

**capacitor.config.ts:**

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicebank.recorder',
  appName: 'VoiceBank Recorder',
  webDir: 'src',
  bundledWebRuntime: false
};

export default config;
```

### Task 3.4: Node.js Server 範例

**目錄：** `examples/node-server/`

**server.js:**

```javascript
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '.wav');
  }
});

const upload = multer({ storage });

// 上傳端點
app.post('/api/save', upload.single('audio-blob'), (req, res) => {
  res.send('success');
});

// 刪除端點
app.post('/api/delete', express.json(), (req, res) => {
  // 刪除邏輯
  res.send('success');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

---

## 🎯 Phase 4: 文檔撰寫（預計 1-2 天）

### Task 4.1: API 文檔

**檔案：** `docs/API.md`

內容包含：
- VoiceBankRecorder 類別完整 API
- 所有配置選項
- 事件列表
- 方法簽名
- 使用範例

### Task 4.2: 使用指南

**檔案：** `docs/USAGE.md`

內容包含：
- 快速開始
- 安裝方式（npm, CDN, 本地）
- 基礎用法
- 高級配置
- 平台特定說明

### Task 4.3: 遷移指南

**檔案：** `docs/MIGRATION.md`

內容包含：
- 從舊版本遷移步驟
- API 變更對照表
- 代碼範例對比
- 常見問題解答

---

## 📋 優先級總結

### 🔴 本週必須完成

1. ✅ 修復 test-storage.html（已完成）
2. **提取 UI 模組到 src/ui/**（最高優先級）
3. **完善 VoiceBankRecorder 主類別**
4. **啟用 Workers 支援**

### 🟠 下週完成

5. **配置 Rollup 構建**
6. **創建 Browser 範例**
7. **創建 Electron 範例**

### 🟡 有時間再做

8. Capacitor 範例
9. 完整文檔
10. 單元測試

---

## 📝 下一步行動

### 立即執行（今天）：

```bash
# 1. 從 app.js 開始提取 UI 模組
# 搜尋並複製以下區塊到對應檔案：

# RecorderUI.js
grep -n "class RecorderUI\|btnToggleRecording\|updateRecordingState" public/assets/js/app.js

# ControlPanel.js  
grep -n "btnPlay\|btnPause\|btnStop\|btnToggleRecording" public/assets/js/app.js

# PlaybackController.js
grep -n "playAudio\|pauseAudio\|seekAudio\|updateProgress" public/assets/js/app.js

# LayoutManager.js
grep -n "updateLayoutMode\|resizeCanvas\|toggleLayout" public/assets/js/app.js

# SettingsPanel.js
grep -n "showAdvancedSettings\|updateAudioSettings" public/assets/js/app.js

# TimeDisplay.js
grep -n "formatDuration\|updateDurationDisplay" public/assets/js/app.js
```

### 測試策略：

1. 每完成一個 UI 模組，立即測試
2. 創建 `test-ui.html` 測試頁面
3. 確保所有功能正常運作
4. 然後再進行下一個模組

---

**製作人：** AI Assistant  
**日期：** 2025-11-09  
**版本：** 1.0  
**狀態：** Ready for Implementation
