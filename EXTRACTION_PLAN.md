# 模組提取執行計劃

## 🎯 目標

將 `public/assets/js/app.js` (5,208 行) 的功能提取到 `src/` 目錄，使 `src/` 能完整實現 `public/index.html` 的所有功能。

---

## 📊 現況分析

### 已完成
- ✅ **src/core/AudioEngine.js** (800 行) - 錄音引擎
- ✅ **src/storage/** (完整) - 儲存抽象層

### 需要提取（從 app.js → src/）
- ⚠️ **WaveformRenderer** - 波形渲染類別
- ⚠️ **UI Controllers** - UI 控制邏輯
- ⚠️ **Workers** - wf-worker.js, pcm-collector.js

---

## 🚀 執行步驟

### 步驟 1: 複製 Workers（最簡單）⚡ 立即執行

**目標：** 將已經模組化的 Worker 檔案複製到 src/workers/

```bash
# 創建目錄
mkdir -p src/workers

# 複製檔案
cp public/assets/js/wf-worker.js src/workers/
cp public/assets/js/worklet/pcm-collector.js src/workers/
```

**這些檔案已經是獨立的，可以直接使用。**

---

### 步驟 2: 提取 WaveformRenderer（中等難度）

**目標：** 從 app.js 提取波形相關類別

#### 2.1 識別需要提取的類別

從 app.js 中找出：

```javascript
// 這些類別在 app.js 中
class AccumulatedWaveform { ... }
class OverviewWaveform { ... }
class LiveWaveform { ... }
```

#### 2.2 創建 src/core/WaveformRenderer.js

```javascript
/**
 * WaveformRenderer.js
 * 波形渲染管理器，整合三種波形顯示
 */

export class WaveformRenderer {
  constructor(options = {}) {
    this.options = {
      accumulatedCanvas: options.accumulatedCanvas,
      overviewCanvas: options.overviewCanvas,
      liveCanvas: options.liveCanvas,
      decimation: options.decimation || 10,
      useWorker: options.useWorker !== false,
      workerPath: options.workerPath || 'workers/wf-worker.js',
      colors: {
        waveform: '#1E88E5',
        selection: '#4CAF50',
        playback: '#FF0000',
        ...(options.colors || {})
      }
    };
    
    this.accumulatedWaveform = null;
    this.overviewWaveform = null;
    this.liveWaveform = null;
    this.worker = null;
  }
  
  async initialize() {
    // 初始化 Worker
    if (this.options.useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(this.options.workerPath);
      } catch (error) {
        console.warn('Worker 初始化失敗，使用主線程:', error);
      }
    }
    
    // 初始化各個波形
    if (this.options.accumulatedCanvas) {
      this.accumulatedWaveform = new AccumulatedWaveform({
        canvas: this.options.accumulatedCanvas,
        worker: this.worker,
        colors: this.options.colors
      });
    }
    
    if (this.options.overviewCanvas) {
      this.overviewWaveform = new OverviewWaveform({
        canvas: this.options.overviewCanvas,
        decimation: this.options.decimation,
        colors: this.options.colors
      });
    }
    
    if (this.options.liveCanvas) {
      this.liveWaveform = new LiveWaveform({
        canvas: this.options.liveCanvas,
        colors: this.options.colors
      });
    }
  }
  
  // 從 AudioEngine 接收 PCM 數據
  updateWithPCM(pcmData) {
    if (this.accumulatedWaveform) {
      this.accumulatedWaveform.appendData(pcmData);
    }
    if (this.overviewWaveform) {
      this.overviewWaveform.appendData(pcmData);
    }
  }
  
  // 更新即時波形（從 AnalyserNode）
  updateLive(analyserNode) {
    if (this.liveWaveform) {
      this.liveWaveform.draw(analyserNode);
    }
  }
  
  clear() {
    if (this.accumulatedWaveform) this.accumulatedWaveform.clear();
    if (this.overviewWaveform) this.overviewWaveform.clear();
    if (this.liveWaveform) this.liveWaveform.clear();
  }
  
  destroy() {
    if (this.worker) {
      this.worker.terminate();
    }
    // 清理各個波形
  }
}

// 從 app.js 複製這些類別（需要調整）
class AccumulatedWaveform {
  // ... 從 app.js 複製完整實現
}

class OverviewWaveform {
  // ... 從 app.js 複製完整實現
}

class LiveWaveform {
  // ... 從 app.js 複製完整實現
}

export { AccumulatedWaveform, OverviewWaveform, LiveWaveform };
```

#### 2.3 提取策略

```bash
# 1. 在 app.js 中搜尋類別定義
grep -n "class AccumulatedWaveform" public/assets/js/app.js
grep -n "class OverviewWaveform" public/assets/js/app.js
grep -n "class LiveWaveform" public/assets/js/app.js

# 2. 記錄行號，手動複製到 src/core/WaveformRenderer.js
# 3. 調整相對路徑和依賴
```

---

### 步驟 3: 提取 UI Controllers（複雜）

**目標：** 從 app.js 提取 UI 控制邏輯

#### 3.1 識別 UI 功能模塊

app.js 中的 UI 功能：
- 錄音按鈕控制
- 播放/暫停/停止
- 時間顯示更新
- 進度條控制
- 波形選取
- 水平/垂直模式切換
- 設定面板控制

#### 3.2 創建 src/ui/ 結構

```
src/ui/
├── RecorderUI.js       # 主 UI 控制器
├── ControlPanel.js     # 錄音/播放控制
├── PlaybackController.js  # 播放邏輯
├── LayoutManager.js    # 佈局切換
├── SettingsPanel.js    # 設定面板
└── TimeDisplay.js      # 時間顯示
```

#### 3.3 RecorderUI.js 架構

```javascript
/**
 * RecorderUI.js
 * 主 UI 控制器，協調所有 UI 模組
 */

import { ControlPanel } from './ControlPanel.js';
import { PlaybackController } from './PlaybackController.js';
import { LayoutManager } from './LayoutManager.js';
import { SettingsPanel } from './SettingsPanel.js';
import { TimeDisplay } from './TimeDisplay.js';

export class RecorderUI {
  constructor(options = {}) {
    this.options = options;
    
    // 獲取 DOM 元素
    this.elements = {
      btnToggleRecording: document.getElementById('btn-toggle-recording'),
      btnPlay: document.getElementById('btn-play'),
      btnPause: document.getElementById('btn-pause'),
      btnStop: document.getElementById('btn-stop-playback'),
      recordingDuration: document.getElementById('recording-duration'),
      waveformWrapper: document.getElementById('waveform-wrapper'),
      // ... 其他元素
    };
    
    // 子模組
    this.controlPanel = new ControlPanel(this.elements);
    this.playback = new PlaybackController(this.elements);
    this.layout = new LayoutManager(this.elements.waveformWrapper);
    this.settings = new SettingsPanel();
    this.timeDisplay = new TimeDisplay(this.elements.recordingDuration);
  }
  
  initialize() {
    // 綁定事件
    this.bindEvents();
  }
  
  bindEvents() {
    // 錄音按鈕
    this.elements.btnToggleRecording.addEventListener('click', () => {
      if (this.isRecording) {
        this.emit('stop-recording');
      } else {
        this.emit('start-recording');
      }
    });
    
    // 播放按鈕
    this.elements.btnPlay.addEventListener('click', () => {
      this.emit('play');
    });
    
    // ... 其他事件綁定
  }
  
  // 事件發射器（與 AudioEngine 通信）
  emit(event, data) {
    if (this.options.onEvent) {
      this.options.onEvent(event, data);
    }
  }
  
  // 更新 UI 狀態
  setRecording(isRecording) {
    this.isRecording = isRecording;
    this.elements.btnToggleRecording.textContent = 
      isRecording ? '⏹ 停止錄音' : '● 開始錄音';
    this.elements.btnToggleRecording.classList.toggle('recording', isRecording);
  }
  
  updateDuration(duration, samples) {
    this.timeDisplay.update(duration, samples);
  }
}
```

---

### 步驟 4: 整合到 src/index.js

**目標：** 提供統一的 VoiceBankRecorder 類別

```javascript
/**
 * src/index.js
 * VoiceBank Recorder 主入口
 */

import { AudioEngine } from './core/AudioEngine.js';
import { WaveformRenderer } from './core/WaveformRenderer.js';
import { RecorderUI } from './ui/RecorderUI.js';
import { StorageFactory } from './storage/index.js';

export class VoiceBankRecorder {
  constructor(options = {}) {
    this.options = this.mergeOptions(options);
    
    // 核心模組
    this.audioEngine = new AudioEngine(this.options.audio);
    this.waveformRenderer = null;
    this.ui = null;
    this.storage = StorageFactory.create(this.options.storage);
    
    // 狀態
    this.isRecording = false;
  }
  
  async initialize() {
    // 初始化音訊引擎
    await this.audioEngine.initialize();
    
    // 初始化波形渲染器
    this.waveformRenderer = new WaveformRenderer({
      accumulatedCanvas: document.getElementById('accumulated-waveform'),
      overviewCanvas: document.getElementById('overview-waveform'),
      liveCanvas: document.getElementById('waveform'),
      useWorker: true,
      workerPath: 'workers/wf-worker.js'
    });
    await this.waveformRenderer.initialize();
    
    // 初始化 UI
    this.ui = new RecorderUI({
      onEvent: (event, data) => this.handleUIEvent(event, data)
    });
    this.ui.initialize();
    
    // 註冊 AudioEngine 事件
    this.audioEngine.on('recording-start', () => {
      this.isRecording = true;
      this.ui.setRecording(true);
    });
    
    this.audioEngine.on('recording-stop', (data) => {
      this.isRecording = false;
      this.ui.setRecording(false);
    });
    
    this.audioEngine.on('data-available', (data) => {
      if (data.pcmData) {
        this.waveformRenderer.updateWithPCM(data.pcmData);
      }
    });
  }
  
  handleUIEvent(event, data) {
    switch (event) {
      case 'start-recording':
        this.startRecording();
        break;
      case 'stop-recording':
        this.stopRecording();
        break;
      case 'play':
        this.play();
        break;
      // ... 其他事件
    }
  }
  
  async startRecording() {
    await this.audioEngine.startRecording();
  }
  
  async stopRecording() {
    const blob = await this.audioEngine.stopRecording();
    return blob;
  }
  
  // ... 其他方法
}

export default VoiceBankRecorder;

// 也導出各模組
export { AudioEngine } from './core/AudioEngine.js';
export { WaveformRenderer } from './core/WaveformRenderer.js';
export { RecorderUI } from './ui/RecorderUI.js';
export * from './storage/index.js';
```

---

## 📋 執行檢查清單

### 階段 1: Workers（30 分鐘）
- [ ] 複製 wf-worker.js 到 src/workers/
- [ ] 複製 pcm-collector.js 到 src/workers/
- [ ] 驗證檔案內容完整

### 階段 2: WaveformRenderer（2-3 天）
- [ ] 搜尋 app.js 中的波形類別定義
- [ ] 複製 AccumulatedWaveform 類別
- [ ] 複製 OverviewWaveform 類別
- [ ] 複製 LiveWaveform 類別
- [ ] 創建 WaveformRenderer 管理器
- [ ] 測試波形渲染功能

### 階段 3: UI Controllers（3-5 天）
- [ ] 創建 RecorderUI.js
- [ ] 創建 ControlPanel.js
- [ ] 創建 PlaybackController.js
- [ ] 創建 LayoutManager.js
- [ ] 創建 SettingsPanel.js
- [ ] 創建 TimeDisplay.js
- [ ] 綁定所有事件處理器
- [ ] 測試 UI 互動

### 階段 4: 主入口整合（1-2 天）
- [ ] 擴充 src/index.js
- [ ] 整合 AudioEngine + WaveformRenderer + UI
- [ ] 實現事件通信
- [ ] 測試完整流程

### 階段 5: 驗證（1 天）
- [ ] 創建測試頁面使用 src/ 模組
- [ ] 對比 public/index.html 功能
- [ ] 確認所有功能都能運作
- [ ] 修復發現的問題

---

## 🎯 成功標準

完成後，應該能夠：

1. **使用 src/ 模組重建 public/index.html 的所有功能**
2. **不依賴 app.js，完全使用模組化代碼**
3. **可以用一個簡單的 HTML 頁面測試所有功能**

測試頁面範例：

```html
<!DOCTYPE html>
<html>
<head>
  <title>VoiceBank Recorder - 模組化版本測試</title>
  <link rel="stylesheet" href="../public/assets/css/style.css">
</head>
<body>
  <!-- 使用與 public/index.html 相同的 HTML 結構 -->
  <h1>VoiceBank+ 模組化版本</h1>
  
  <div id="waveform-wrapper" class="mode-horizontal">
    <!-- ... 相同的 HTML ... -->
  </div>
  
  <!-- 使用模組化的代碼 -->
  <script type="module">
    import VoiceBankRecorder from './src/index.js';
    
    const recorder = new VoiceBankRecorder({
      storage: { type: 'browser' }
    });
    
    recorder.initialize();
  </script>
</body>
</html>
```

---

## 💡 重要提醒

1. **不要一次提取所有代碼** - 分階段進行，每個階段都要測試
2. **保留 public/index.html** - 作為參考和向後兼容
3. **Worker 路徑** - 注意相對路徑的調整
4. **事件系統** - AudioEngine 和 UI 之間需要良好的事件通信
5. **依賴關係** - 注意模組之間的依賴順序

---

## 🚀 立即開始

第一步非常簡單，現在就可以執行：

```bash
# 1. 複製 Workers
mkdir -p src/workers
cp public/assets/js/wf-worker.js src/workers/
cp public/assets/js/worklet/pcm-collector.js src/workers/

# 2. 驗證
ls -l src/workers/
```

完成後，我們再進行下一步的 WaveformRenderer 提取！

---

**創建日期：** 2025-11-09  
**預計完成：** 1-2 週  
**當前狀態：** 準備開始
