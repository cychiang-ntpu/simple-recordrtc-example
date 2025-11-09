# src/ 目錄結構說明

這是 VoiceBank Recorder 的模組化源代碼目錄。

## 📁 目錄結構

```
src/
├── core/              # 核心功能模組（待實作）
│   ├── AudioEngine.js      # 音訊引擎（錄音、AudioContext、AudioWorklet）
│   ├── WaveformManager.js  # 波形管理器（AccumulatedWaveform, OverviewWaveform）
│   ├── VUMeter.js         # VU 表管理器
│   └── PCMProcessor.js    # PCM 數據處理
│
├── ui/                # UI 控制模組（待實作）
│   ├── RecorderUI.js      # 錄音器 UI 控制器
│   ├── ControlPanel.js    # 控制面板
│   └── LayoutManager.js   # 佈局管理器（水平/垂直模式）
│
├── storage/           # 儲存抽象層 ✅ 已完成
│   ├── StorageAdapter.js      # 儲存適配器基類
│   ├── IndexedDBAdapter.js    # IndexedDB 實現（瀏覽器本地儲存）
│   ├── ServerAdapter.js       # 伺服器實現（PHP/Node.js）
│   ├── ElectronAdapter.js     # Electron 檔案系統實現
│   ├── CapacitorAdapter.js    # Capacitor 原生檔案系統實現
│   └── index.js              # 儲存模組統一入口
│
├── utils/             # 工具函數 ✅ 已完成
│   ├── PlatformDetector.js   # 平台偵測工具
│   ├── AudioUtils.js         # 音訊工具（待實作）
│   └── WavEncoder.js         # WAV 編碼器（待實作）
│
├── workers/           # Web Workers（待遷移）
│   ├── wf-worker.js          # 波形繪製 worker
│   └── pcm-collector.js      # PCM 收集器
│
└── index.js           # 主入口點 ✅ 已完成
```

## ✅ 已完成的模組

### 1. 儲存抽象層 (storage/)

提供統一的儲存介面，支援多種平台：

- **StorageAdapter**: 基類，定義統一介面
- **IndexedDBAdapter**: 瀏覽器本地儲存（無需伺服器）
- **ServerAdapter**: 伺服器儲存（支援 PHP/Node.js）
- **ElectronAdapter**: Electron 桌面應用程式
- **CapacitorAdapter**: 移動應用程式（iOS/Android）

### 2. 平台偵測 (utils/PlatformDetector.js)

自動偵測當前運行環境：
- Browser / Electron / Capacitor
- 移動裝置檢測
- AudioWorklet 支援檢測
- OffscreenCanvas 支援檢測

### 3. 主入口 (index.js)

VoiceBankRecorder 主類別，提供統一的 API：
- 錄音控制（開始/停止/暫停/恢復）
- 播放控制
- 儲存管理（自動選擇適當的儲存適配器）
- 事件回調系統

## 🚧 待實作的模組

### core/ - 核心功能
從 `public/assets/js/app.js` 提取：
- AudioEngine: 音訊引擎核心
- WaveformManager: 波形渲染管理
- VUMeter: VU 表控制
- PCMProcessor: PCM 數據處理

### ui/ - UI 控制
從 `public/index.html` 和 `app.js` 提取：
- RecorderUI: UI 控制器
- ControlPanel: 按鈕和控制項
- LayoutManager: 響應式佈局

### utils/ - 更多工具
- AudioUtils: 音訊處理工具函數
- WavEncoder: WAV 檔案編碼

### workers/ - Web Workers
從 `public/assets/js/` 遷移：
- wf-worker.js
- pcm-collector.js

## 📚 使用範例

### 基本使用（瀏覽器 + IndexedDB）

```javascript
import VoiceBankRecorder from './src/index.js';

const recorder = new VoiceBankRecorder({
  storage: {
    type: 'browser'  // 使用 IndexedDB（無需伺服器）
  },
  
  callbacks: {
    onRecordStop: async (blob) => {
      // 自動儲存到 IndexedDB
      await recorder.saveRecording(blob);
    }
  }
});

// 開始錄音
await recorder.startRecording();

// 停止錄音
await recorder.stopRecording();

// 列出所有錄音
const recordings = await recorder.listRecordings();
```

### 使用 PHP 後端

```javascript
const recorder = new VoiceBankRecorder({
  storage: {
    type: 'server',
    saveEndpoint: '/backend/save.php',
    deleteEndpoint: '/backend/delete.php'
  }
});
```

### 自動偵測平台

```javascript
const recorder = new VoiceBankRecorder({
  storage: {
    type: 'auto'  // 自動選擇：Browser/Electron/Capacitor
  }
});
```

## 🔄 下一步

1. **實作 AudioEngine** - 從 app.js 提取錄音核心
2. **實作 WaveformManager** - 提取波形渲染邏輯
3. **建立構建系統** - Rollup 配置
4. **創建範例專案** - Browser/Electron/Capacitor

## 📖 相關文件

- [CROSS_PLATFORM_IMPLEMENTATION.md](../CROSS_PLATFORM_IMPLEMENTATION.md) - 完整實施計劃
- [REFACTORING_PLAN.md](../REFACTORING_PLAN.md) - 重構計劃
- [README.md](../README.md) - 專案說明

---

**更新日期**: 2025-11-09  
**狀態**: 儲存層已完成，核心功能待實作
