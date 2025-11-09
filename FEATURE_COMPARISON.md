# VoiceBank Recorder 功能比對分析

## 比對範圍
- `public/index.html` + `public/assets/js/app.js` (參考實作)
- `examples/browser/index.html` (當前庫實作)
- `src/core/*` (核心庫程式碼)

## 功能差異分析

### ✅ 已實現的功能

#### 基礎錄音功能
- [x] 開始/停止錄音
- [x] 即時波形顯示 (LiveWaveform)
- [x] 音量表 (VU Meter)
- [x] 累積波形 (AccumulatedWaveform)
- [x] 概覽波形 (OverviewWaveform)
- [x] WAV 格式輸出
- [x] 下載功能

#### 波形交互
- [x] 累積波形滑鼠拖曳平移
- [x] 累積波形滾輪縮放
- [x] 累積波形點擊定位
- [x] 概覽波形點擊導航

#### 基礎控制
- [x] 波形工具列 (放大/縮小/重置/平移/自動捲動)
- [x] Mic Gain 調整
- [x] 錄音資訊顯示 (時長/樣本數/採樣率/檔案大小)

---

### ❌ 缺失的功能 (public/index.html 有但 examples/browser/index.html 沒有)

#### 1. 裝置管理
- [ ] **麥克風裝置選擇** (`#mic-select`)
  - 列舉所有可用麥克風
  - 記憶上次選擇的裝置
  - 重新整理裝置清單
  - 裝置變更時自動更新

- [ ] **輸出裝置選擇** (`#spk-select`)
  - 列舉所有音訊輸出裝置
  - 支援 `setSinkId()` 切換播放輸出
  - 記憶偏好設定

#### 2. 顯示模式與自適應
- [ ] **水平/垂直模式切換**
  - 手動切換 (Radio buttons)
  - 自動偵測螢幕方向
  - 快速按鈕 (回水平/恢復自動)
  - 響應式 Canvas 尺寸調整

- [ ] **深色模式** (`#toggle-dark-mode`)
  - CSS 變數切換主題
  - `[data-theme="dark"]` 屬性

- [ ] **顯示選項**
  - 顯示/隱藏總覽波形 (`#toggle-overview`)
  - 自動降增益保護 (`#toggle-auto-gain-protect`)
  - 顯示削波標記 (`#toggle-clip-mark`)
  - 以原始樣本縮放 (`#toggle-raw-zoom`)
  - 動態細緻度 (`#toggle-dynamic-detail`)

#### 3. 高級波形渲染
- [ ] **Worker 離屏渲染**
  - `wf-worker.js` 處理波形繪製
  - `OffscreenCanvas` + `transferControlToOffscreen()`
  - 主線程非阻塞繪圖

- [ ] **動態細緻度 (Dynamic Detail)**
  ```javascript
  // 根據可視範圍密度調整繪圖精細度
  var detail = Math.min(2.0, Math.max(0.1, density / 2.0));
  ```

- [ ] **Raw PCM 視窗模式**
  - `rawZoomMode`: 直接操作原始樣本座標
  - 超高倍放大時精確顯示

- [ ] **時間刻度軸**
  - 根據可視範圍動態調整刻度間隔
  - Nice steps: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60...]
  - 水平/垂直模式分別繪製

- [ ] **削波標記**
  - 樣本值 ≥ 0.99 時顯示紅色標記
  - 削波統計 (maxAbs, clippedSamples, percentage)

#### 4. 選取區間功能
- [ ] **區間選取操作**
  - **PC**: `Shift + 拖曳` 建立選取
  - **PC**: `Shift + 點擊邊緣` 拉伸選取
  - **觸控**: 長按 (500ms) 啟動選取模式
  - **觸控**: 拖曳綠色圓點調整邊界
  - 最小選取長度: 0.2 秒
  - 震動回饋 (觸控裝置)

- [ ] **選取區間視覺化**
  - 半透明綠色遮罩
  - 綠色邊界線
  - 圓形控制點 (綠色外框白邊)
  - 水平/垂直模式不同呈現

- [ ] **選取區間播放**
  - 播放選取範圍內的音訊
  - 顯示選取時長

- [ ] **清除選取** (`#btn-clear-selection`)

#### 5. 播放控制
- [ ] **完整播放控制**
  - 播放 (`#btn-play`)
  - 暫停 (`#btn-pause`)
  - 停止 (`#btn-stop-playback`)
  - 跳到開頭 (`#btn-jump-start`)

- [ ] **播放位置追蹤**
  - 紅色播放指示線 + 三角形標記
  - 時間浮標 (當前播放時間)
  - 播放過程中持續更新位置
  - 播放時 VU Meter 持續更新

- [ ] **播放邏輯整合**
  ```javascript
  // 優先順序:
  // 1. 從播放位置繼續
  // 2. 播放選取範圍
  // 3. 播放整段
  ```

#### 6. 音訊處理設定
- [ ] **AGC (自動增益控制)**
  - Checkbox 啟用/停用
  - getUserMedia constraints: `autoGainControl`
  - AGC 關閉時 Mic Gain 才生效

- [ ] **其他音訊約束**
  - Echo Cancellation (`echoCancellation`)
  - Noise Suppression (`noiseSuppression`)

- [ ] **iOS 特殊處理**
  ```javascript
  // iOS + AGC 關閉 + Mic Gain=1.0 時自動提升到 3.5x
  if (isIOS && !agcEnabled && micGainUserFactor === 1.0) {
    micGainUserFactor = 3.5;
  }
  ```

#### 7. 視窗與焦點管理
- [ ] **預設視窗秒數設定** (`#default-window-seconds`)
  - 錄音完成後聚焦範圍
  - 點擊 Overview 的預設縮放
  - 範圍: 0.1 ~ 30 秒
  - LocalStorage 記憶

- [ ] **可視範圍指示** (`#visible-window-seconds`)
  - 即時顯示當前可視範圍的時間長度

#### 8. 診斷與規格面板
- [ ] **完整規格顯示** (`#recording-specs`)
  - 環境 (Browser/Electron/Capacitor + OS)
  - 輸入 MediaTrack 設定 (deviceId, sampleRate, channelCount, latency, AEC, NS, AGC)
  - AudioContext (sampleRate, state, baseLatency)
  - Recorder (channels, bufferSize, preGain)
  - 輸出 WAV (type, size, duration)
  - Decimation (targetRate, sourceRate, factor)
  - Clipping (maxAbs, clippedSamples, percentage)
  - Dropout 估計 (expected vs actual samples)
  - 可視 Raw 樣本數
  - 動態細緻度 (detail, density sppx)

- [ ] **即時更新**
  - 錄音期間持續更新規格
  - 非阻塞式資料收集

#### 9. Overview 波形進階交互
- [ ] **拖曳視窗內部** → 移動觀察位置
- [ ] **拖曳視窗邊緣** → 拉伸縮放範圍
- [ ] **點擊視窗外** → 跳轉並聚焦 (預設視窗秒數)
- [ ] **點擊視窗內** → 重新聚焦點擊位置

#### 10. 累積波形進階交互
- [ ] **垂直模式特殊行為**
  - 時間軸沿 Y 軸向下
  - 振幅沿 X 軸左右擺動
  - 不同的刻度與標籤方向

- [ ] **Decimation 與 Raw 座標切換**
  - 在極高倍放大時自動使用原始樣本
  - 避免 decimated 樣本插值失真

#### 11. 其他 UI 元素
- [ ] **可編輯標題** (`contenteditable` H1)
  - 錄音名稱自訂
  
- [ ] **可編輯文本** (`contenteditable` H2)
  - 錄音文本或備註

- [ ] **Toast 通知系統** (`#toast-container`)
  - 浮動提示訊息
  - 漸入漸出動畫

- [ ] **迷你音量條** (`.mini-level`)
  - 精簡的 RMS/Peak 顯示
  - 動態重定位 (水平模式上方 / 垂直模式下方)
  - 寬度同步累積波形

#### 12. 記憶體與效能保護
- [ ] **錄音上限保護**
  ```javascript
  const MAX_RECORDING_BYTES = 50 * 1024 * 1024; // 50MB
  const MAX_RECORDING_SECONDS = 10 * 60;        // 10 分鐘
  ```

- [ ] **自動檢查與停止**
  - 每次 PCM 資料收集時檢查
  - 達到上限自動停止並提示

#### 13. AudioWorklet PCM 收集
- [ ] **Worklet 優先模式**
  ```javascript
  // public/assets/js/worklet/pcm-collector.js
  class PCMCollectorProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
      // 收集 Float32 PCM 樣本
      // postMessage 傳遞給主線程
    }
  }
  ```

- [ ] **回退到 RecordRTC**
  - Worklet 不支援時自動回退
  - 保持一致的 PCM 資料流

---

### 🔧 需要改進的實作

#### 1. 波形繪製演算法粗糙
**問題**: `examples/browser/index.html` 的累積波形顯示粗糙，不夠細緻

**原因分析**:
```javascript
// src/core/WaveformRenderer.js - AccumulatedWaveform.append()
// 簡單的 min/max 計算，沒有中心化處理
for (var i = 0; i < total; i += factor) {
  var blockMin = 1.0, blockMax = -1.0;
  for (var j = 0; j < factor && (i + j) < total; j++) {
    var sample = audioSamples[i + j];
    if (sample < blockMin) blockMin = sample;
    if (sample > blockMax) blockMax = sample;
  }
  this.sampleMin.push(blockMin);
  this.sampleMax.push(blockMax);
}
```

**public/app.js 的改進**:
```javascript
// 1. 計算區塊平均值 (DC offset)
var blockSum = 0, blockCount = 0;
for (var j = 0; j < factor && (i + j) < total; j++) {
  blockSum += audioSamples[i + j];
  blockCount++;
}
var blockMean = blockCount ? (blockSum / blockCount) : 0;

// 2. 以區塊平均值為中心計算 min/max
for (var k = 0; k < blockCount; k++) {
  var centeredSample = audioSamples[i + k] - blockMean;
  if (centeredSample < blockMin) blockMin = centeredSample;
  if (centeredSample > blockMax) blockMax = centeredSample;
}
```

**效果**: 移除 DC 偏移，波形更對稱細緻

#### 2. 缺少動態細緻度
**問題**: 所有縮放層級使用相同的繪圖策略

**改進**: 根據 `samplesPerPixel` 動態調整繪圖精細度
```javascript
var density = visibleRaw / (width * dpr);
var detail = Math.min(2.0, Math.max(0.1, density / 2.0));

// detail < 0.5: 使用原始 PCM 樣本 (極高倍放大)
// detail 0.5-1.0: 使用 decimated min/max
// detail > 1.0: 聚合多個 decimated 樣本
```

#### 3. 主線程繪圖阻塞
**問題**: `canvas.getContext('2d')` 在主線程繪製，錄音時可能卡頓

**改進**: 使用 `OffscreenCanvas` + Worker
```javascript
var offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
```

---

## 實作優先順序

### P0 (核心功能)
1. ✅ 修復波形繪製演算法 (DC offset removal)
2. ✅ 裝置選擇 (麥克風/輸出)
3. ✅ 選取區間功能
4. ✅ 完整播放控制 (播放/暫停/停止/跳轉)

### P1 (重要增強)
5. ✅ 水平/垂直模式切換
6. ✅ 時間刻度軸
7. ✅ 削波標記
8. ✅ 規格診斷面板
9. ✅ 動態細緻度

### P2 (進階優化)
10. ⏳ Worker 離屏渲染
11. ⏳ Raw PCM 視窗模式
12. ⏳ AudioWorklet PCM 收集
13. ⏳ Toast 通知系統

### P3 (UI 改善)
14. ⏳ 深色模式
15. ⏳ 可編輯標題/文本
16. ⏳ 迷你音量條
17. ⏳ 其他顯示選項

---

## 跨平台兼容性檢查

| 功能 | Browser | Electron | Capacitor iOS | Capacitor Android |
|------|---------|----------|---------------|-------------------|
| 裝置列舉 | ✅ | ✅ | ⚠️ (需權限) | ⚠️ (需權限) |
| setSinkId | ✅ Chrome/Edge | ✅ | ❌ | ❌ |
| AudioWorklet | ✅ (HTTPS) | ✅ | ✅ | ✅ |
| OffscreenCanvas | ✅ (Chrome 69+) | ✅ | ⚠️ (iOS 16.4+) | ✅ |
| 觸控事件 | ✅ | ✅ | ✅ | ✅ |
| 震動 API | ✅ | ❌ | ✅ | ✅ |
| 檔案下載 | ✅ | ✅ | ⚠️ (需插件) | ⚠️ (需插件) |

---

## 測試清單

### 基礎錄音
- [ ] 開始/停止錄音正常
- [ ] 即時波形正常顯示
- [ ] VU Meter 正常更新
- [ ] 累積波形正常繪製
- [ ] 概覽波形正常同步
- [ ] WAV 檔案正常下載

### 波形交互
- [ ] 滑鼠拖曳平移
- [ ] Ctrl/Cmd + 滾輪縮放
- [ ] 點擊設定播放位置
- [ ] 工具列按鈕控制
- [ ] 自動捲動開關

### 選取功能
- [ ] Shift + 拖曳建立選取
- [ ] Shift + 拖曳邊緣拉伸
- [ ] 觸控長按選取
- [ ] 最小選取長度限制
- [ ] 播放選取範圍
- [ ] 清除選取

### 播放功能
- [ ] 播放整段
- [ ] 播放選取範圍
- [ ] 從播放位置繼續
- [ ] 暫停/繼續
- [ ] 停止並重置
- [ ] 跳到開頭

### 裝置管理
- [ ] 列舉麥克風
- [ ] 切換麥克風
- [ ] 列舉輸出裝置
- [ ] 切換輸出裝置
- [ ] 裝置變更偵測

### 顯示模式
- [ ] 水平模式顯示
- [ ] 垂直模式顯示
- [ ] 自動偵測方向
- [ ] 手動切換模式
- [ ] Canvas 尺寸適應

### 跨平台
- [ ] Chrome/Edge 瀏覽器
- [ ] Firefox 瀏覽器
- [ ] Safari (macOS/iOS)
- [ ] Electron (Windows/macOS/Linux)
- [ ] Capacitor iOS
- [ ] Capacitor Android

---

## 文件更新需求

- [ ] README.md - 加入新功能說明
- [ ] API.md - 記錄新增的 API
- [ ] EXAMPLES.md - 各功能使用範例
- [ ] CROSS_PLATFORM.md - 跨平台差異與注意事項

---

**最後更新**: 2025-01-09
