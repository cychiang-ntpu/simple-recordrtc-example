# RecordRTC Library 重構計劃

## 📋 目標

1. **單頁面顯示** - 進階設定收合後,所有內容在視窗內可見(無需滾動)
2. **JS Library 化** - 可作為獨立模組被其他專案引用
3. **跨平台支援** - 支援 Browser / Electron / Capacitor

---

## 🎯 階段一:單頁面顯示修正 (已完成 ✅)

### 1.1 垂直模式高度調整

**問題:** 波形高度 80vh 導致頁面超出視窗

**解決方案:**
```css
/* 從 80vh 調整為 55vh + max-height 限制 */
#waveform-wrapper.mode-vertical .waveform-col {
    height: 55vh;
    max-height: 500px;
}
```

**高度計算(進階設定收合):**
- h1: ~60px
- mini-level: ~30px  
- waveform (55vh @ 800px): ~440px
- h2: ~80px
- h3: ~30px
- action-bar: ~80px
- 進階設定(收合): ~50px
- footer: ~30px
- **總計: ~800px** ✅ 適合大多數手機(667-932px)

### 1.2 水平模式優化

**建議:**
```css
/* 限制波形最大高度 */
#waveform-wrapper.mode-horizontal .accumulated-col canvas,
#waveform-wrapper.mode-horizontal .overview-col canvas {
    max-height: 200px;
}
```

---

## 🎯 階段二:模組化重構

### 2.1 目標架構

```
VoiceBankRecorder/
├── src/
│   ├── core/
│   │   ├── AudioEngine.js      # 錄音核心引擎
│   │   ├── WaveformRenderer.js # 波形渲染引擎
│   │   └── VUMeter.js          # 音量表
│   ├── ui/
│   │   ├── RecorderUI.js       # UI 控制器
│   │   └── LayoutManager.js    # 佈局管理
│   ├── utils/
│   │   ├── AudioUtils.js       # 音訊工具
│   │   └── PlatformDetector.js # 平台偵測
│   └── index.js                # 主入口
├── dist/
│   ├── voicebank-recorder.js      # UMD build
│   ├── voicebank-recorder.esm.js  # ES Module
│   └── voicebank-recorder.min.js  # Minified
├── styles/
│   └── voicebank-recorder.css
└── examples/
    ├── browser.html
    ├── electron/
    └── capacitor/
```

### 2.2 API 設計

```javascript
// 初始化範例
const recorder = new VoiceBankRecorder({
  container: '#recorder-container',
  layout: 'horizontal', // 'horizontal' | 'vertical' | 'auto'
  theme: 'light',       // 'light' | 'dark'
  
  // 音訊設定
  audio: {
    sampleRate: 48000,
    channels: 1,
    agc: false,
    gain: 1.0
  },
  
  // 波形設定
  waveform: {
    showOverview: true,
    decimation: 10,
    colors: {
      waveform: '#1E88E5',
      selection: '#4CAF50',
      playback: '#FF0000'
    }
  },
  
  // 儲存設定
  storage: {
    type: 'browser', // 'browser' | 'electron' | 'capacitor'
    path: './uploads'
  },
  
  // 事件回調
  onRecordStart: () => {},
  onRecordStop: (blob) => {},
  onError: (error) => {}
});

// API 方法
recorder.startRecording();
recorder.stopRecording();
recorder.play();
recorder.pause();
recorder.exportWAV();
recorder.destroy();
```

### 2.3 模組化步驟

1. **提取 AudioEngine 類別**
   - 封裝 AudioContext, AudioWorklet, RecordRTC
   - 提供統一的錄音介面

2. **提取 WaveformRenderer**
   - 封裝 AccumulatedWaveform, OverviewWaveform
   - 支援 Worker / 非 Worker 模式

3. **解耦 UI 與邏輯**
   - UI 層只負責事件綁定和顯示更新
   - 邏輯層處理音訊處理和狀態管理

4. **建立配置系統**
   - 使用 options pattern
   - 提供預設值和驗證

---

## 🎯 階段三:跨平台適配

### 3.1 Browser (原生支援)

**無需修改,已完全支援:**
- ✅ Web Audio API
- ✅ getUserMedia
- ✅ AudioWorklet
- ✅ OffscreenCanvas + Worker

### 3.2 Electron 適配

**需要的修改:**

```javascript
// 1. 麥克風權限 (main.js)
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});

// 設置麥克風權限
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  if (permission === 'media') {
    callback(true); // 允許麥克風存取
  }
});

// 2. 檔案儲存 (preload.js)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveRecording: (blob, filename) => {
    return ipcRenderer.invoke('save-recording', blob, filename);
  }
});

// 3. 主進程處理 (main.js)
ipcMain.handle('save-recording', async (event, blob, filename) => {
  const { dialog } = require('electron');
  const fs = require('fs');
  
  const result = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'Audio', extensions: ['wav'] }]
  });
  
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, Buffer.from(blob));
    return result.filePath;
  }
});
```

**package.json 配置:**
```json
{
  "name": "voicebank-recorder-electron",
  "main": "main.js",
  "dependencies": {
    "electron": "^28.0.0"
  }
}
```

### 3.3 Capacitor 適配

**需要的修改:**

```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicebank.recorder',
  appName: 'VoiceBank Recorder',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  },
  ios: {
    // iOS 音訊設定
    backgroundColor: '#ffffff'
  },
  android: {
    // Android 權限
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.WRITE_EXTERNAL_STORAGE'
    ]
  }
};

export default config;
```

**權限請求 (TypeScript):**
```typescript
import { Plugins } from '@capacitor/core';
const { Permissions } = Plugins;

async function requestMicrophonePermission() {
  const result = await Permissions.requestPermissions({
    permissions: ['microphone']
  });
  
  return result.microphone === 'granted';
}
```

**檔案儲存 (使用 Filesystem plugin):**
```typescript
import { Filesystem, Directory } from '@capacitor/filesystem';

async function saveRecording(blob: Blob, filename: string) {
  const base64Data = await blobToBase64(blob);
  
  await Filesystem.writeFile({
    path: `recordings/${filename}`,
    data: base64Data,
    directory: Directory.Documents
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

**iOS 特殊處理 - AudioWorklet Fallback:**
```javascript
// iOS Safari 不完全支援 AudioWorklet,需要 fallback
const supportsAudioWorklet = 'audioWorklet' in AudioContext.prototype;

if (!supportsAudioWorklet) {
  // 使用 ScriptProcessorNode (deprecated but works)
  console.warn('AudioWorklet not supported, using ScriptProcessorNode');
  // ... fallback implementation
}
```

---

## 🎯 階段四:建置與發布

### 4.1 建置工具配置

**使用 Rollup 打包:**

```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

export default [
  // UMD build (瀏覽器直接使用)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: true
    },
    plugins: [resolve(), commonjs()]
  },
  
  // ES Module (現代打包工具)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [resolve(), commonjs()]
  },
  
  // Minified build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.min.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      sourcemap: true
    },
    plugins: [resolve(), commonjs(), terser()]
  },
  
  // Copy CSS
  {
    input: 'src/index.js',
    plugins: [
      copy({
        targets: [
          { src: 'styles/*.css', dest: 'dist' }
        ]
      })
    ]
  }
];
```

### 4.2 NPM 發布準備

```json
{
  "name": "voicebank-recorder",
  "version": "1.0.0",
  "description": "Cross-platform audio recorder with waveform visualization",
  "main": "dist/voicebank-recorder.js",
  "module": "dist/voicebank-recorder.esm.js",
  "unpkg": "dist/voicebank-recorder.min.js",
  "types": "dist/index.d.ts",
  
  "files": [
    "dist",
    "styles",
    "README.md",
    "LICENSE"
  ],
  
  "keywords": [
    "audio",
    "recorder",
    "waveform",
    "visualization",
    "electron",
    "capacitor",
    "cross-platform"
  ],
  
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "test": "jest",
    "lint": "eslint src/**/*.js"
  },
  
  "peerDependencies": {},
  "devDependencies": {
    "@rollup/plugin-commonjs": "^25.0.0",
    "@rollup/plugin-node-resolve": "^15.0.0",
    "rollup": "^4.0.0",
    "rollup-plugin-terser": "^7.0.0"
  }
}
```

---

## 📦 範例專案結構

### Browser 範例
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
      layout: 'auto'
    });
  </script>
</body>
</html>
```

### Electron 範例
```javascript
// renderer.js (Electron 渲染進程)
import VoiceBankRecorder from 'voicebank-recorder';

const recorder = new VoiceBankRecorder({
  container: '#recorder',
  storage: {
    type: 'electron',
    saveHandler: async (blob, filename) => {
      return await window.electronAPI.saveRecording(blob, filename);
    }
  }
});
```

### Capacitor 範例
```typescript
// app.component.ts (Angular/React/Vue)
import VoiceBankRecorder from 'voicebank-recorder';
import { Filesystem, Directory } from '@capacitor/filesystem';

const recorder = new VoiceBankRecorder({
  container: '#recorder',
  storage: {
    type: 'capacitor',
    saveHandler: async (blob, filename) => {
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: `recordings/${filename}`,
        data: base64,
        directory: Directory.Documents
      });
    }
  }
});
```

---

## 🧪 測試策略

### 單元測試
```javascript
// tests/AudioEngine.test.js
import { AudioEngine } from '../src/core/AudioEngine';

describe('AudioEngine', () => {
  test('should initialize with default options', () => {
    const engine = new AudioEngine();
    expect(engine.sampleRate).toBe(48000);
  });
  
  test('should start recording', async () => {
    const engine = new AudioEngine();
    await engine.startRecording();
    expect(engine.isRecording).toBe(true);
  });
});
```

### 整合測試
- Browser: Playwright / Puppeteer
- Electron: Spectron
- Capacitor: Appium

---

## 📊 效能考量

### 記憶體優化
```javascript
// 使用 Ring Buffer 避免無限增長
class RingBuffer {
  constructor(maxSize) {
    this.buffer = new Float32Array(maxSize);
    this.writePos = 0;
    this.size = 0;
    this.maxSize = maxSize;
  }
  
  push(data) {
    const spaceLeft = this.maxSize - this.size;
    const toCopy = Math.min(data.length, spaceLeft);
    
    this.buffer.set(data.subarray(0, toCopy), this.writePos);
    this.writePos = (this.writePos + toCopy) % this.maxSize;
    this.size = Math.min(this.size + toCopy, this.maxSize);
  }
}
```

### Canvas 渲染優化
```javascript
// 使用 requestAnimationFrame 節流
let rafId = null;
let needsRedraw = false;

function scheduleRedraw() {
  if (needsRedraw) return;
  needsRedraw = true;
  
  rafId = requestAnimationFrame(() => {
    draw();
    needsRedraw = false;
  });
}
```

---

## 🔄 遷移路徑

### 階段一:立即修復 (1-2 天)
- ✅ 調整垂直模式高度為 55vh
- ✅ 添加 max-height 限制
- 測試各種螢幕尺寸

### 階段二:模組化基礎 (1 週)
- 建立 src/ 目錄結構
- 提取 AudioEngine 類別
- 提取 WaveformRenderer 類別
- 建立 API 介面

### 階段三:打包建置 (3-5 天)
- 配置 Rollup
- 產生 UMD/ESM builds
- 建立範例頁面

### 階段四:跨平台適配 (1-2 週)
- Electron 範例專案
- Capacitor 範例專案
- 平台特定功能實作

### 階段五:測試與文檔 (1 週)
- 撰寫單元測試
- 建立使用文檔
- 準備 NPM 發布

---

## 📝 待辦清單

- [ ] 完成垂直模式高度調整
- [ ] 測試進階設定收合狀態下的顯示
- [ ] 建立模組化目錄結構
- [ ] 提取 AudioEngine 核心
- [ ] 提取 WaveformRenderer
- [ ] 設計統一 API
- [ ] 配置 Rollup 建置
- [ ] 建立 Electron 範例
- [ ] 建立 Capacitor 範例
- [ ] 撰寫使用文檔
- [ ] 準備 NPM 發布

---

## 🎓 學習資源

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Electron](https://www.electronjs.org/docs/latest/)
- [Capacitor](https://capacitorjs.com/docs)
- [Rollup](https://rollupjs.org/guide/en/)

---

**製作日期:** 2025-11-09  
**版本:** 1.0  
**狀態:** Draft
