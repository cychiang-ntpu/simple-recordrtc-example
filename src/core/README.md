# AudioEngine 模組

跨平台音訊錄音引擎，支援 AudioWorklet 與 RecordRTC。

## 功能特色

- ✅ **雙模式錄音**：優先使用 AudioWorklet（現代瀏覽器），自動回退到 RecordRTC（iOS Safari）
- ✅ **事件驅動**：完整的事件系統，易於整合
- ✅ **麥克風控制**：前級增益、AGC、設備選擇
- ✅ **WAV 輸出**：16-bit PCM WAV 格式
- ✅ **實時數據訪問**：可取得 PCM 樣本供波形顯示
- ✅ **iOS 優化**：自動調整增益以解決音量偏低問題

## 快速開始

### 基本使用

```javascript
import { AudioEngine } from './src/core/AudioEngine.js';

// 創建引擎實例
const engine = new AudioEngine({
  sampleRate: 48000,
  autoGainControl: false,
  micGain: 1.0
});

// 初始化
await engine.initialize();

// 開始錄音
await engine.startRecording();

// ... 錄音中 ...

// 停止錄音
const blob = await engine.stopRecording();

// 使用錄音 Blob
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
```

### 事件監聽

```javascript
// 錄音開始
engine.on('recording-start', (data) => {
  console.log('錄音開始', data);
  // data: { timestamp, mode, sampleRate }
});

// 實時數據（AudioWorklet 模式）
engine.on('data-available', (data) => {
  console.log('PCM 數據', data);
  // data: { pcmData, totalSamples, mode }
});

// 錄音停止
engine.on('recording-stop', (data) => {
  console.log('錄音停止', data);
  // data: { blob, url, duration, samples, sampleRate }
});

// 錯誤處理
engine.on('error', (data) => {
  console.error('錯誤', data);
  // data: { stage, error }
});

// 麥克風捕獲成功
engine.on('microphone-captured', (data) => {
  console.log('麥克風已捕獲', data);
});

// AudioWorklet 載入狀態
engine.on('worklet-loaded', () => {
  console.log('AudioWorklet 已載入');
});

engine.on('worklet-load-failed', () => {
  console.log('AudioWorklet 載入失敗，將使用 RecordRTC');
});

// iOS 增益自動調整
engine.on('ios-gain-adjusted', (data) => {
  console.log('iOS 增益已調整', data.gain);
});
```

## 配置選項

```javascript
const engine = new AudioEngine({
  // 採樣率（Hz）
  sampleRate: 48000,
  
  // 自動增益控制
  autoGainControl: false,
  
  // 回音消除
  echoCancellation: false,
  
  // 噪音抑制
  noiseSuppression: false,
  
  // 前級增益（1.0-6.0）
  micGain: 1.0,
  
  // 麥克風設備 ID（可選）
  deviceId: null,
  
  // AudioWorklet 模組路徑
  workletPath: 'assets/js/worklet/pcm-collector.js',
  
  // 優先使用 AudioWorklet
  preferWorklet: true
});
```

## API 方法

### 初始化

```javascript
await engine.initialize();
```

創建 AudioContext、Analyser、Gain 節點，載入 AudioWorklet 模組。

### 錄音控制

```javascript
// 開始錄音
await engine.startRecording();

// 停止錄音（返回 Blob）
const blob = await engine.stopRecording();

// 暫停錄音（僅 RecordRTC 模式）
engine.pauseRecording();

// 繼續錄音（僅 RecordRTC 模式）
engine.resumeRecording();
```

### 數據訪問

```javascript
// 取得最新錄音
const recording = engine.getLatestRecording();
// 返回: { blob, url, duration, samples, sampleRate }

// 取得 PCM 數據視窗（僅 AudioWorklet 模式）
const pcmData = engine.getPcmWindow(startSample, count);
// 返回: Float32Array

// 取得 Analyser 節點（供波形顯示）
const analyser = engine.getAnalyser();

// 取得 AudioContext
const audioContext = engine.getAudioContext();
```

### 增益控制

```javascript
// 設定麥克風增益（1.0-6.0）
engine.setMicGain(2.5);
```

### 清理資源

```javascript
engine.dispose();
```

## 事件列表

| 事件名稱 | 觸發時機 | 數據格式 |
|---------|---------|---------|
| `initialized` | 引擎初始化完成 | `{ sampleRate, state, workletSupported, workletLoaded }` |
| `recording-start` | 開始錄音 | `{ timestamp, mode, sampleRate }` |
| `recording-stop` | 停止錄音 | `{ blob, url, duration, samples, sampleRate }` |
| `recording-paused` | 暫停錄音 | `{ timestamp }` |
| `recording-resumed` | 繼續錄音 | `{ timestamp }` |
| `data-available` | 實時數據可用 | `{ pcmData?, blob?, totalSamples?, mode }` |
| `microphone-captured` | 麥克風捕獲成功 | `{ deviceId, constraints }` |
| `microphone-captured-fallback` | 回退到預設麥克風 | `{ constraints }` |
| `mic-gain-changed` | 增益調整 | `{ gain }` |
| `worklet-loaded` | AudioWorklet 載入成功 | `{ path }` |
| `worklet-load-failed` | AudioWorklet 載入失敗 | `{ error }` |
| `ios-gain-adjusted` | iOS 自動增益調整 | `{ gain }` |
| `error` | 錯誤發生 | `{ stage, error }` |
| `disposed` | 資源已釋放 | - |

## 錄音模式

### AudioWorklet 模式（推薦）

**優點：**
- 低延遲
- 高效能
- 不阻塞主線程
- 實時 PCM 數據訪問

**支援瀏覽器：**
- Chrome 66+
- Edge 79+
- Firefox 76+
- Safari 14.1+（部分支援）

### RecordRTC 模式（回退）

**優點：**
- 廣泛瀏覽器支援
- 穩定可靠
- 支援暫停/繼續

**適用場景：**
- iOS Safari（AudioWorklet 支援不完整）
- 舊版瀏覽器
- AudioWorklet 載入失敗時

## 平台兼容性

| 平台 | AudioWorklet | RecordRTC | 建議模式 |
|-----|-------------|-----------|---------|
| Chrome 桌面 | ✅ | ✅ | AudioWorklet |
| Firefox 桌面 | ✅ | ✅ | AudioWorklet |
| Safari 桌面 | ⚠️ | ✅ | RecordRTC |
| Chrome Android | ✅ | ✅ | AudioWorklet |
| Safari iOS | ❌ | ✅ | RecordRTC |

## 進階用法

### 整合波形顯示

```javascript
const analyser = engine.getAnalyser();
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

function drawWaveform() {
  requestAnimationFrame(drawWaveform);
  
  analyser.getByteTimeDomainData(dataArray);
  
  // 繪製波形...
}

drawWaveform();
```

### 訪問原始 PCM 數據

```javascript
// 僅在 AudioWorklet 模式下可用
engine.on('data-available', (data) => {
  if (data.mode === 'worklet' && data.pcmData) {
    // data.pcmData 是 Float32Array
    // 值範圍: -1.0 ~ 1.0
    
    // 例如：計算 RMS
    let sum = 0;
    for (let i = 0; i < data.pcmData.length; i++) {
      sum += data.pcmData[i] * data.pcmData[i];
    }
    const rms = Math.sqrt(sum / data.pcmData.length);
    console.log('RMS:', rms);
  }
});
```

### 自定義麥克風設備

```javascript
// 列出所有音訊輸入設備
const devices = await navigator.mediaDevices.enumerateDevices();
const audioInputs = devices.filter(d => d.kind === 'audioinput');

// 使用特定設備
const engine = new AudioEngine({
  deviceId: audioInputs[0].deviceId
});
```

## 測試

打開 `test-audioengine.html` 進行互動式測試：

```bash
# 啟動本地伺服器
python3 -m http.server 8000

# 訪問測試頁面
open http://localhost:8000/test-audioengine.html
```

測試功能：
- ✅ 引擎初始化
- ✅ 開始/停止錄音
- ✅ 實時波形顯示
- ✅ 事件日誌
- ✅ 統計資訊
- ✅ 播放/下載錄音

## 限制與注意事項

1. **用戶手勢要求**：`startRecording()` 必須在用戶手勢（如點擊）中調用
2. **HTTPS 要求**：生產環境必須使用 HTTPS（localhost 除外）
3. **麥克風權限**：首次使用需要用戶授權
4. **iOS Safari**：AudioWorklet 支援不完整，自動使用 RecordRTC
5. **暫停功能**：僅在 RecordRTC 模式下可用
6. **記憶體管理**：長時間錄音應定期檢查記憶體使用

## 故障排除

### AudioWorklet 載入失敗

確保 `pcm-collector.js` 路徑正確：

```javascript
const engine = new AudioEngine({
  workletPath: '/assets/js/worklet/pcm-collector.js'  // 絕對路徑
});
```

### iOS 音量偏低

引擎會自動偵測 iOS 並調整增益：

```javascript
engine.on('ios-gain-adjusted', (data) => {
  console.log('自動調整至', data.gain, 'x');
});
```

### 麥克風權限被拒絕

```javascript
engine.on('error', (data) => {
  if (data.error.name === 'NotAllowedError') {
    alert('請允許麥克風權限');
  }
});
```

## 後續計畫

- [ ] 支援更多音訊格式（MP3, OGG）
- [ ] 內建降噪處理
- [ ] 錄音片段管理
- [ ] 多軌錄音支援
- [ ] 實時音訊效果處理

## 參考資料

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [RecordRTC](https://github.com/muaz-khan/RecordRTC)
- [MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
