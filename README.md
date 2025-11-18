# 🎙️ VoiceBank Recorder

跨平台音訊錄音函式庫，提供完整的音訊錄製、波形可視化和儲存功能。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](package.json)

## ✨ 特色功能

- 🎯 **開箱即用** - 提供完整的 UI 組件，一行代碼即可使用
- 🌐 **跨平台支援** - Browser / Electron / Capacitor / Node.js
- 🎨 **多層波形可視化** - 即時波形、累積波形、概覽波形、VU Meter
- 🔧 **模組化架構** - 核心模組可獨立使用，靈活組合
- 💾 **多種儲存方案** - IndexedDB / Server / Electron / Capacitor
- 🎛️ **完整音訊控制** - 增益、AGC、回音消除、降噪
- 🖥️ **高效能渲染** - 使用 AudioWorklet 和 OffscreenCanvas Worker
- 📱 **響應式設計** - 自動適配桌面和行動裝置

## 📦 安裝

```bash
npm install voicebank-recorder
```

或直接使用 CDN：

```html
<script src="https://unpkg.com/voicebank-recorder/dist/voicebank-recorder.min.js"></script>
```

## 🚀 快速開始

### 方案 1: 使用完整 UI 組件（最簡單）

```javascript
import { VoiceBankRecorderUI } from 'voicebank-recorder';

// 一行代碼創建完整錄音器
const recorder = new VoiceBankRecorderUI({
  container: '#app',
  theme: {
    primaryColor: '#667eea',
    secondaryColor: '#764ba2'
  }
});

await recorder.initialize();
```

### 方案 2: 使用核心模組（自定義 UI）

```javascript
import { AudioEngine, WaveformRenderer, DeviceManager } from 'voicebank-recorder';

// 1. 創建音訊引擎
const audioEngine = new AudioEngine({
  sampleRate: 48000,
  micGain: 1.5,
  autoGainControl: false
});

// 2. 創建波形渲染器
const waveform = new WaveformRenderer({
  liveCanvas: document.getElementById('live-canvas'),
  accumulatedCanvas: document.getElementById('acc-canvas'),
  audioEngine: audioEngine
});

// 3. 初始化並開始錄音
await audioEngine.initialize();
await waveform.initialize();
await audioEngine.startRecording();
```

### 方案 3: 僅使用錄音引擎

```javascript
import { AudioEngine } from 'voicebank-recorder';

const engine = new AudioEngine();

engine.on('recording-start', () => console.log('開始錄音'));
engine.on('data-available', (data) => console.log('PCM 數據', data.pcmData));
engine.on('recording-stop', (blob) => console.log('錄音完成', blob));

await engine.initialize();
await engine.startRecording();
// ... 錄音中 ...
await engine.stopRecording();
```

## 📚 核心模組

### AudioEngine

跨平台音訊錄音引擎，封裝 Web Audio API 和 RecordRTC。

**主要功能：**
- 麥克風輸入管理
- 雙模式錄音：AudioWorklet（高精度）/ RecordRTC（相容性）
- 即時 PCM 數據流
- 音訊增益控制
- AGC / 回音消除 / 降噪
- 事件驅動 API

**API 範例：**

```javascript
const engine = new AudioEngine({
  sampleRate: 48000,
  micGain: 2.0,
  autoGainControl: false,
  echoCancellation: true,
  noiseSuppression: true
});

await engine.initialize();
await engine.startRecording();
await engine.stopRecording();
const blob = await engine.getRecordedBlob();
```

### WaveformRenderer

多層波形可視化渲染器，支援四種顯示模式。

**四層波形：**
1. **LiveWaveform** - 即時波形（從 AnalyserNode）
2. **VUMeter** - 音量表（RMS/Peak dBFS）
3. **AccumulatedWaveform** - 累積波形（完整音訊，支援縮放平移）
4. **OverviewWaveform** - 全局概覽

**API 範例：**

```javascript
const renderer = new WaveformRenderer({
  liveCanvas: liveCanvasElement,
  vuMeterCanvas: vuCanvasElement,
  accumulatedCanvas: accCanvasElement,
  overviewCanvas: overviewCanvasElement,
  audioEngine: audioEngine,
  useWorker: true  // 使用 Worker 加速
});

await renderer.initialize();
renderer.start();  // 開始渲染
renderer.appendPCM(pcmData);  // 添加音訊數據
renderer.stop();  // 停止渲染
```

### DeviceManager

麥克風和輸出裝置管理器。

**API 範例：**

```javascript
const deviceManager = new DeviceManager();

await deviceManager.initialize();
const devices = deviceManager.getDevices();  // 獲取所有裝置
await deviceManager.selectDevice(deviceId);  // 切換麥克風
deviceManager.savePreferences();  // 保存到 localStorage
```

### StorageAdapter

統一的儲存介面，支援多種後端。

**支援的儲存方案：**
- `IndexedDBAdapter` - 瀏覽器本地儲存
- `ServerAdapter` - 伺服器上傳（HTTP）
- `ElectronAdapter` - Electron 檔案系統
- `CapacitorAdapter` - Capacitor 原生儲存

**API 範例：**

```javascript
import { StorageFactory } from 'voicebank-recorder';

// 自動偵測平台
const storage = StorageFactory.createAuto({
  serverUrl: '/api/recordings'
});

// 或手動指定
const storage = StorageFactory.create('browser', {
  dbName: 'recordings-db'
});

await storage.save(blob, { filename: 'recording.wav' });
const recordings = await storage.list();
```

## 🎨 完整範例

查看 `examples/browser/index.html` 獲取完整的使用範例。

### 本地執行

```bash
# 1. 安裝依賴
npm install

# 2. 打包
npm run build

# 3. 啟動伺服器
npm run serve
```

然後開啟 http://localhost:8000/examples/browser/index.html

## 🏗️ 專案結構

### 📚 函式庫核心資料夾

#### `src/` - 原始碼（開發時使用）

函式庫的所有核心模組原始碼，使用 ES Module 格式。

```
src/
├── index.js                    # 📌 主入口點，匯出所有公開 API
├── core/                       # 🎯 核心模組
│   ├── AudioEngine.js         #    音訊錄音引擎（Web Audio API + RecordRTC）
│   ├── WaveformRenderer.js    #    波形渲染器（四層可視化）
│   └── DeviceManager.js       #    裝置管理器（麥克風/輸出裝置）
├── ui/                        # 🎨 UI 組件
│   ├── VoiceBankRecorderUI.js #    完整 UI 組件（開箱即用）
│   └── RecorderUI.js          #    基礎 UI 組件
├── storage/                   # 💾 儲存模組
│   ├── StorageAdapter.js      #    抽象基類（定義儲存介面）
│   ├── IndexedDBAdapter.js    #    瀏覽器 IndexedDB 實作
│   ├── ServerAdapter.js       #    HTTP 伺服器上傳實作
│   ├── ElectronAdapter.js     #    Electron 檔案系統實作
│   ├── CapacitorAdapter.js    #    Capacitor 原生儲存實作
│   └── index.js               #    StorageFactory（自動偵測平台）
├── utils/                     # 🛠️ 工具模組
│   └── PlatformDetector.js    #    平台偵測工具
└── workers/                   # ⚡ Web Worker 腳本
    ├── pcm-collector.js       #    AudioWorklet 處理器（高精度 PCM 擷取）
    └── wf-worker.js           #    波形渲染 Worker（OffscreenCanvas 加速）
```

#### `dist/` - 打包輸出（發布時使用）

使用 Rollup 打包後的函式庫檔案，提供三種格式供不同使用場景。

```
dist/
├── voicebank-recorder.js       # UMD 格式（可用於 <script> 標籤）
├── voicebank-recorder.esm.js   # ES Module 格式（可用於 import）
├── voicebank-recorder.min.js   # 壓縮版（生產環境推薦，90KB）
├── *.map                       # Source Map 檔案（除錯用）
└── vendor/
    └── RecordRTC.js           # RecordRTC 依賴庫
```

**使用建議：**
- 開發環境：使用 `.esm.js` 並啟用 source map
- 生產環境：使用 `.min.js` 以減少檔案大小
- CDN 部署：使用 `.min.js` 提供全域變數 `VoiceBankRecorder`

---

### 🎯 非函式庫資料夾

#### `examples/` - 使用範例

展示如何使用函式庫的完整範例程式碼。

```
examples/
└── browser/
    ├── index.html              # 完整範例（使用 VoiceBankRecorderUI）
    └── simple-test.html        # 簡易測試（使用 public/assets）
```

**啟動方式：**
```bash
npm run serve
# 開啟 http://localhost:8000/examples/browser/index.html
```

#### `public/` - 舊版完整應用（保留參考）

重構前的單一檔案應用，包含完整的錄音器實作（5200+ 行）。

```
public/
├── index.html                  # 主頁面
├── assets/
│   ├── css/
│   │   └── style.css          # 樣式表
│   └── js/
│       ├── app.js             # 📦 單一檔案版本（重構前）
│       ├── RecordRTC.js       # RecordRTC 依賴
│       ├── wf-worker.js       # 波形渲染 Worker
│       └── worklet/
│           └── pcm-collector.js # AudioWorklet 處理器
└── uploads/                    # 錄音檔案上傳目錄
```

**用途：**
- 作為重構前的參考實作
- 可直接執行的完整應用
- 不依賴打包工具，適合快速測試

#### `backend/` - PHP 伺服器範例

提供 ServerAdapter 使用的後端 API 範例。

```
backend/
├── save.php                    # 儲存錄音檔案 API
├── delete.php                  # 刪除錄音檔案 API
└── index.php                   # PHP 版本主頁
```

**API 端點：**
- `POST /backend/save.php` - 上傳錄音檔案
- `POST /backend/delete.php` - 刪除指定檔案

#### `docs/` - 文檔資料夾

保留原始專案的文檔和授權檔案。

```
docs/
└── LICENSE                     # 原始授權文件
```

---

### 🔧 配置檔案

```
專案根目錄/
├── package.json                # npm 套件配置
├── rollup.config.js            # Rollup 打包配置
├── .gitignore                  # Git 忽略規則
├── LICENSE                     # MIT 授權
└── README.md                   # 本文件
```

## 🛠️ 開發

```bash
# 安裝依賴
npm install

# 開發模式（watch）
npm run dev

# 打包
npm run build

# 生產環境打包
npm run build:prod

# 程式碼檢查
npm run lint

# 測試
npm test
```

## 📋 系統需求

- **Node.js**: >= 14.0.0
- **瀏覽器**: 支援 Web Audio API 和 ES6 Module
  - Chrome/Edge >= 88
  - Firefox >= 78
  - Safari >= 14

## 🔧 配置選項

### AudioEngine 選項

```javascript
{
  sampleRate: 48000,              // 採樣率
  autoGainControl: false,         // 自動增益控制
  echoCancellation: false,        // 回音消除
  noiseSuppression: false,        // 降噪
  micGain: 1.0,                   // 麥克風增益 (1.0-6.0)
  deviceId: null,                 // 麥克風 ID
  workletPath: 'path/to/worker',  // AudioWorklet 路徑
  preferWorklet: true             // 優先使用 AudioWorklet
}
```

### WaveformRenderer 選項

```javascript
{
  liveCanvas: HTMLCanvasElement,
  vuMeterCanvas: HTMLCanvasElement,
  accumulatedCanvas: HTMLCanvasElement,
  overviewCanvas: HTMLCanvasElement,
  audioEngine: AudioEngine,
  workerPath: 'path/to/worker',
  useWorker: true,
  showClipMarks: true
}
```

### VoiceBankRecorderUI 選項

```javascript
{
  container: '#app',
  showAdvancedOptions: true,
  showStatusLog: true,
  theme: {
    primaryColor: '#667eea',
    secondaryColor: '#764ba2',
    successColor: '#10b981',
    errorColor: '#ef4444'
  },
  audioConfig: { /* AudioEngine 選項 */ },
  waveformConfig: { /* WaveformRenderer 選項 */ }
}
```

## 🎯 使用場景

- 📞 線上客服錄音
- 🎓 語言學習應用
- 🎵 音樂創作工具
- 📝 語音筆記
- 🎮 遊戲語音聊天
- 📊 語音分析工具

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

[MIT License](LICENSE)

## 👥 作者

VoiceBank Team

## 🔗 相關連結

- [GitHub Repository](https://github.com/cychiang-ntpu/simple-recordrtc-example)
- [Issue Tracker](https://github.com/cychiang-ntpu/simple-recordrtc-example/issues)
- [RecordRTC](https://recordrtc.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)