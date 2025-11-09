# DeviceManager API 使用指南

## 概述
`DeviceManager` 是 VoiceBank Recorder 的核心模組，負責管理麥克風和輸出裝置的列舉、選擇與持久化。

## 基本使用

### 1. 獨立使用 DeviceManager

```javascript
import { DeviceManager } from 'voicebank-recorder';

// 創建 DeviceManager 實例
const deviceManager = new DeviceManager({
  autoLoadPreferences: true,  // 自動載入上次的偏好設定
  autoRequestPermission: true  // 列舉前自動請求麥克風權限
});

// 列舉所有裝置
const { microphones, outputs } = await deviceManager.enumerateAllDevices();

console.log('麥克風清單:', microphones);
console.log('輸出裝置清單:', outputs);

// 選擇麥克風
deviceManager.selectMicrophone(microphones[0].deviceId);

// 選擇輸出裝置
deviceManager.selectOutputDevice(outputs[0].deviceId);

// 取得當前選擇
const selectedMicId = deviceManager.getSelectedMicrophoneId();
const selectedOutputId = deviceManager.getSelectedOutputDeviceId();
```

### 2. 與 AudioEngine 整合使用

```javascript
import { AudioEngine, DeviceManager } from 'voicebank-recorder';

// 創建 DeviceManager
const deviceManager = new DeviceManager();

// 列舉裝置
await deviceManager.enumerateAllDevices();

// 創建 AudioEngine，並傳入 DeviceManager
const audioEngine = new AudioEngine({
  deviceManager: deviceManager,  // 傳入外部的 DeviceManager
  sampleRate: 48000,
  micGain: 1.0
});

await audioEngine.initialize();

// DeviceManager 會自動提供約束條件給 AudioEngine
await audioEngine.startRecording();
```

### 3. AudioEngine 自動管理裝置

```javascript
import { AudioEngine } from 'voicebank-recorder';

// AudioEngine 會自動創建內部的 DeviceManager
const audioEngine = new AudioEngine({
  autoManageDevices: true  // 預設為 true
});

await audioEngine.initialize();

// 訪問內部的 DeviceManager
const deviceManager = audioEngine.deviceManager;
await deviceManager.enumerateAllDevices();

// 選擇麥克風後重新開始錄音
deviceManager.selectMicrophone('some-device-id');
await audioEngine.startRecording();
```

## API 參考

### 建構函數

```javascript
new DeviceManager(options)
```

**選項:**
- `micStorageKey` (string): 麥克風偏好設定的 localStorage key，預設 `'preferredMicDeviceId'`
- `outputStorageKey` (string): 輸出裝置偏好設定的 localStorage key，預設 `'preferredOutputDeviceId'`
- `autoLoadPreferences` (boolean): 是否自動載入上次的偏好設定，預設 `true`
- `autoRequestPermission` (boolean): 列舉前是否自動請求麥克風權限，預設 `true`

### 方法

#### `isSupported()` → boolean
檢查瀏覽器是否支援裝置列舉。

#### `async requestMicrophonePermission()` → Promise<void>
請求麥克風權限（必要時）。

#### `async enumerateMicrophones(requestPermission?)` → Promise<Array<MediaDeviceInfo>>
列舉所有麥克風裝置。

**參數:**
- `requestPermission` (boolean, 可選): 是否先請求權限，預設使用建構函數設定

**返回:** MediaDeviceInfo 陣列

#### `async enumerateOutputDevices()` → Promise<Array<MediaDeviceInfo>>
列舉所有輸出裝置。

**返回:** MediaDeviceInfo 陣列

#### `async enumerateAllDevices(requestPermission?)` → Promise<Object>
列舉所有裝置（麥克風 + 輸出）。

**返回:** `{ microphones: Array, outputs: Array }`

#### `selectMicrophone(deviceId, save?)`
選擇麥克風裝置。

**參數:**
- `deviceId` (string): 裝置 ID
- `save` (boolean, 可選): 是否儲存偏好設定，預設 `true`

#### `selectOutputDevice(deviceId, save?)`
選擇輸出裝置。

**參數:**
- `deviceId` (string): 裝置 ID
- `save` (boolean, 可選): 是否儲存偏好設定，預設 `true`

#### `getSelectedMicrophoneId()` → string
取得當前選擇的麥克風裝置 ID。

#### `getSelectedOutputDeviceId()` → string
取得當前選擇的輸出裝置 ID。

#### `getSelectedMicrophone()` → MediaDeviceInfo|null
取得當前選擇的麥克風裝置資訊。

#### `getSelectedOutputDevice()` → MediaDeviceInfo|null
取得當前選擇的輸出裝置資訊。

#### `getMicrophoneConstraints(additionalConstraints?)` → Object
建立適用於 getUserMedia 的約束條件。

**參數:**
- `additionalConstraints` (Object, 可選): 額外的音訊約束

**返回:** MediaStreamConstraints 物件

**範例:**
```javascript
const constraints = deviceManager.getMicrophoneConstraints({
  autoGainControl: false,
  echoCancellation: false,
  noiseSuppression: false
});

// constraints 會包含選擇的裝置 ID
// {
//   audio: {
//     deviceId: { exact: 'selected-device-id' },
//     autoGainControl: false,
//     echoCancellation: false,
//     noiseSuppression: false
//   },
//   video: false
// }
```

#### `async setAudioOutputDevice(audioElement, deviceId?)` → Promise<void>
為 Audio 元素設定輸出裝置。

**參數:**
- `audioElement` (HTMLAudioElement): Audio 元素
- `deviceId` (string, 可選): 裝置 ID，不提供則使用當前選擇的裝置

**範例:**
```javascript
const audio = new Audio(url);
await deviceManager.setAudioOutputDevice(audio);
audio.play();
```

#### `isDeviceAvailable(deviceId, type)` → boolean
檢查指定裝置是否仍然存在。

**參數:**
- `deviceId` (string): 裝置 ID
- `type` (string): `'microphone'` 或 `'output'`

#### `startDeviceChangeMonitoring()`
啟動裝置變更監聽。當裝置插拔時自動重新列舉。

#### `stopDeviceChangeMonitoring()`
停止裝置變更監聽。

#### `loadPreferences()`
從 localStorage 載入上次的裝置偏好設定。

#### `savePreference(type, deviceId)`
儲存裝置偏好設定到 localStorage。

**參數:**
- `type` (string): `'microphone'` 或 `'output'`
- `deviceId` (string): 裝置 ID

#### `destroy()`
銷毀 DeviceManager，清理資源。

### 事件

#### `on(event, callback)`
註冊事件監聽器。

**事件類型:**
- `'devicechange'`: 裝置變更（插拔）
- `'micchange'`: 麥克風選擇變更
- `'outputchange'`: 輸出裝置選擇變更

**範例:**
```javascript
deviceManager.on('devicechange', ({ microphones, outputs }) => {
  console.log('裝置變更:', microphones, outputs);
  // 更新 UI
});

deviceManager.on('micchange', ({ deviceId }) => {
  console.log('麥克風變更:', deviceId);
});

deviceManager.on('outputchange', ({ deviceId }) => {
  console.log('輸出裝置變更:', deviceId);
});

// 啟動監聽
deviceManager.startDeviceChangeMonitoring();
```

#### `off(event, callback)`
移除事件監聽器。

## 完整範例：UI 整合

```javascript
import { DeviceManager } from 'voicebank-recorder';

// 創建 DeviceManager
const deviceManager = new DeviceManager();

// UI 元素
const micSelect = document.getElementById('mic-select');
const outputSelect = document.getElementById('output-select');
const btnRefreshMics = document.getElementById('btn-refresh-mics');
const btnRefreshOutputs = document.getElementById('btn-refresh-outputs');

// 初始化
async function initialize() {
  // 列舉裝置
  const { microphones, outputs } = await deviceManager.enumerateAllDevices();
  
  // 填充麥克風下拉選單
  populateMicrophoneSelect(microphones);
  populateOutputSelect(outputs);
  
  // 監聽裝置變更
  deviceManager.on('devicechange', ({ microphones, outputs }) => {
    populateMicrophoneSelect(microphones);
    populateOutputSelect(outputs);
  });
  
  deviceManager.startDeviceChangeMonitoring();
  
  // 監聽選擇變更
  micSelect.addEventListener('change', (e) => {
    deviceManager.selectMicrophone(e.target.value);
  });
  
  outputSelect.addEventListener('change', (e) => {
    deviceManager.selectOutputDevice(e.target.value);
  });
  
  // 重新整理按鈕
  btnRefreshMics.addEventListener('click', async () => {
    const mics = await deviceManager.enumerateMicrophones();
    populateMicrophoneSelect(mics);
  });
  
  btnRefreshOutputs.addEventListener('click', async () => {
    const outputs = await deviceManager.enumerateOutputDevices();
    populateOutputSelect(outputs);
  });
}

function populateMicrophoneSelect(microphones) {
  micSelect.innerHTML = '';
  
  microphones.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `麥克風 ${micSelect.options.length + 1}`;
    micSelect.appendChild(option);
  });
  
  // 恢復上次選擇
  const selectedId = deviceManager.getSelectedMicrophoneId();
  if (selectedId) {
    micSelect.value = selectedId;
  }
}

function populateOutputSelect(outputs) {
  outputSelect.innerHTML = '<option value="default">系統預設</option>';
  
  outputs.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `輸出 ${outputSelect.options.length}`;
    outputSelect.appendChild(option);
  });
  
  // 恢復上次選擇
  const selectedId = deviceManager.getSelectedOutputDeviceId();
  if (selectedId) {
    outputSelect.value = selectedId;
  }
}

// 啟動
initialize();
```

## 跨平台相容性

| 功能 | Chrome/Edge | Firefox | Safari | Electron | Capacitor |
|------|-------------|---------|--------|----------|-----------|
| 列舉麥克風 | ✅ | ✅ | ✅ | ✅ | ⚠️ 需權限 |
| 列舉輸出裝置 | ✅ | ❌ | ❌ | ✅ | ❌ |
| setSinkId | ✅ | ❌ | ❌ | ✅ | ❌ |
| devicechange | ✅ | ✅ | ✅ | ✅ | ✅ |
| localStorage | ✅ | ✅ | ✅ | ✅ | ✅ |

**注意事項:**
- Firefox 和 Safari 不支援 `setSinkId()`，輸出裝置選擇功能會自動降級
- Capacitor 環境需要在 `AndroidManifest.xml` 和 `Info.plist` 中宣告麥克風權限
- iOS Safari 需要 HTTPS 才能列舉裝置（開發時可以使用 localhost）

## 錯誤處理

```javascript
try {
  const { microphones, outputs } = await deviceManager.enumerateAllDevices();
} catch (error) {
  if (error.message.includes('not supported')) {
    console.error('瀏覽器不支援裝置列舉');
  } else if (error.message.includes('permission')) {
    console.error('未授予麥克風權限');
  } else {
    console.error('列舉裝置失敗:', error);
  }
}
```

## 最佳實踐

1. **初始化時列舉裝置**
   ```javascript
   await deviceManager.enumerateAllDevices();
   ```

2. **啟動裝置變更監聽**
   ```javascript
   deviceManager.startDeviceChangeMonitoring();
   ```

3. **錄音前確認裝置可用**
   ```javascript
   const selectedMic = deviceManager.getSelectedMicrophone();
   if (!selectedMic) {
     console.warn('未選擇麥克風，將使用預設裝置');
   }
   ```

4. **播放前設定輸出裝置**
   ```javascript
   const audio = new Audio(url);
   await deviceManager.setAudioOutputDevice(audio);
   audio.play();
   ```

5. **銷毀時清理資源**
   ```javascript
   deviceManager.stopDeviceChangeMonitoring();
   deviceManager.destroy();
   ```
