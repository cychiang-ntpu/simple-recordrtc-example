/*!
 * voicebank-recorder v1.0.0
 * 跨平台音訊錄音庫，支援 Browser/Electron/Capacitor
 * 
 * Includes RecordRTC v5.6.2 (https://github.com/muaz-khan/RecordRTC)
 * RecordRTC License: MIT
 * 
 * @license MIT
 * @author VoiceBank Team
 * @repository https://github.com/cychiang-ntpu/simple-recordrtc-example.git
 */

/**
 * DeviceManager.js
 * 音訊裝置管理模組 - 處理麥克風和輸出裝置的列舉、選擇、記憶
 * 
 * @module DeviceManager
 * @description 提供完整的音訊裝置管理功能，包含：
 * - 裝置列舉 (enumerateDevices)
 * - 裝置選擇與記憶 (localStorage)
 * - 裝置變更偵測 (devicechange event)
 * - 跨平台相容性處理
 */

/**
 * DeviceManager - 音訊裝置管理器
 * 統一管理麥克風和輸出裝置的列舉、選擇與持久化
 */
class DeviceManager {
  /**
   * @param {Object} options - 配置選項
   * @param {string} [options.micStorageKey='preferredMicDeviceId'] - 麥克風偏好設定的 localStorage key
   * @param {string} [options.outputStorageKey='preferredOutputDeviceId'] - 輸出裝置偏好設定的 localStorage key
   * @param {boolean} [options.autoLoadPreferences=true] - 是否自動載入上次的偏好設定
   * @param {boolean} [options.autoRequestPermission=true] - 列舉前是否自動請求麥克風權限
   */
  constructor(options = {}) {
    this.options = {
      micStorageKey: 'preferredMicDeviceId',
      outputStorageKey: 'preferredOutputDeviceId',
      autoLoadPreferences: true,
      autoRequestPermission: true,
      ...options
    };

    // 裝置清單
    this.microphoneDevices = [];
    this.outputDevices = [];

    // 當前選擇的裝置 ID
    this.selectedMicDeviceId = '';
    this.selectedOutputDeviceId = 'default';

    // 事件監聽器
    this._eventListeners = {
      'devicechange': [],
      'micchange': [],
      'outputchange': []
    };

    // 裝置變更監聽器
    this._deviceChangeListener = null;

    // 自動載入偏好設定
    if (this.options.autoLoadPreferences) {
      this.loadPreferences();
    }
  }

  /**
   * 從 localStorage 載入上次的裝置偏好設定
   */
  loadPreferences() {
    console.log('[DeviceManager] loadPreferences 被呼叫');
    try {
      const savedMicId = localStorage.getItem(this.options.micStorageKey);
      const savedOutputId = localStorage.getItem(this.options.outputStorageKey);
      console.log(`[DeviceManager] localStorage 中的值:`);
      console.log(`  - ${this.options.micStorageKey}: "${savedMicId}"`);
      console.log(`  - ${this.options.outputStorageKey}: "${savedOutputId}"`);
      if (savedMicId) {
        this.selectedMicDeviceId = savedMicId;
        console.log(`[DeviceManager] 已載入麥克風偏好: ${savedMicId}`);
      } else {
        console.log(`[DeviceManager] 沒有儲存的麥克風偏好`);
      }
      if (savedOutputId) {
        this.selectedOutputDeviceId = savedOutputId;
        console.log(`[DeviceManager] 已載入輸出裝置偏好: ${savedOutputId}`);
      } else {
        console.log(`[DeviceManager] 沒有儲存的輸出裝置偏好，使用 default`);
      }
    } catch (error) {
      console.warn('[DeviceManager] Failed to load device preferences:', error);
    }
  }

  /**
   * 儲存裝置偏好設定到 localStorage
   * @param {string} type - 'microphone' 或 'output'
   * @param {string} deviceId - 裝置 ID
   */
  savePreference(type, deviceId) {
    try {
      if (type === 'microphone') {
        localStorage.setItem(this.options.micStorageKey, deviceId);
        this.selectedMicDeviceId = deviceId;
      } else if (type === 'output') {
        localStorage.setItem(this.options.outputStorageKey, deviceId);
        this.selectedOutputDeviceId = deviceId;
      }
    } catch (error) {
      console.warn('Failed to save device preference:', error);
    }
  }

  /**
   * 檢查瀏覽器是否支援裝置列舉
   * @returns {boolean}
   */
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices);
  }

  /**
   * 請求麥克風權限（必要時）
   * @returns {Promise<void>}
   */
  async requestMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia is not supported in this browser');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      // 立即停止所有 track，只是為了獲取權限
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      throw new Error(`Failed to request microphone permission: ${error.message}`);
    }
  }

  /**
   * 列舉所有麥克風裝置
   * @param {boolean} [requestPermission=true] - 是否先請求權限
   * @returns {Promise<Array>} 麥克風裝置清單
   */
  async enumerateMicrophones(requestPermission = this.options.autoRequestPermission) {
    if (!this.isSupported()) {
      throw new Error('Device enumeration is not supported in this browser');
    }
    try {
      // 如果需要，先請求權限
      if (requestPermission) {
        try {
          await this.requestMicrophonePermission();
        } catch (error) {
          // 忽略權限錯誤，繼續嘗試列舉（可能已經有權限）
          console.warn('Permission request failed, continuing anyway:', error);
        }
      }

      // 列舉所有裝置
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.microphoneDevices = devices.filter(device => device.kind === 'audioinput');
      return this.microphoneDevices;
    } catch (error) {
      throw new Error(`Failed to enumerate microphones: ${error.message}`);
    }
  }

  /**
   * 列舉所有輸出裝置
   * @returns {Promise<Array>} 輸出裝置清單
   */
  async enumerateOutputDevices() {
    if (!this.isSupported()) {
      throw new Error('Device enumeration is not supported in this browser');
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.outputDevices = devices.filter(device => device.kind === 'audiooutput');
      return this.outputDevices;
    } catch (error) {
      throw new Error(`Failed to enumerate output devices: ${error.message}`);
    }
  }

  /**
   * 列舉所有裝置（麥克風 + 輸出）
   * @param {boolean} [requestPermission=true] - 是否先請求麥克風權限
   * @returns {Promise<Object>} { microphones, outputs }
   */
  async enumerateAllDevices(requestPermission = this.options.autoRequestPermission) {
    const [microphones, outputs] = await Promise.all([this.enumerateMicrophones(requestPermission), this.enumerateOutputDevices()]);
    return {
      microphones,
      outputs
    };
  }

  /**
   * 選擇麥克風裝置
   * @param {string} deviceId - 裝置 ID
   * @param {boolean} [save=true] - 是否儲存偏好設定
   */
  selectMicrophone(deviceId, save = true) {
    console.log(`[DeviceManager] selectMicrophone 被呼叫:`, {
      deviceId,
      save
    });
    console.log(`[DeviceManager] 變更前: selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
    this.selectedMicDeviceId = deviceId;
    console.log(`[DeviceManager] 變更後: selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
    if (save) {
      this.savePreference('microphone', deviceId);
      console.log(`[DeviceManager] 已儲存至 localStorage (${this.options.micStorageKey})`);
    }

    // 觸發 micchange 事件
    this._emit('micchange', {
      deviceId
    });
  }

  /**
   * 選擇輸出裝置
   * @param {string} deviceId - 裝置 ID
   * @param {boolean} [save=true] - 是否儲存偏好設定
   */
  selectOutputDevice(deviceId, save = true) {
    this.selectedOutputDeviceId = deviceId;
    if (save) {
      this.savePreference('output', deviceId);
    }

    // 觸發 outputchange 事件
    this._emit('outputchange', {
      deviceId
    });
  }

  /**
   * 取得當前選擇的麥克風裝置 ID
   * @returns {string}
   */
  getSelectedMicrophoneId() {
    return this.selectedMicDeviceId;
  }

  /**
   * 取得當前選擇的輸出裝置 ID
   * @returns {string}
   */
  getSelectedOutputDeviceId() {
    return this.selectedOutputDeviceId;
  }

  /**
   * 取得當前選擇的麥克風裝置資訊
   * @returns {MediaDeviceInfo|null}
   */
  getSelectedMicrophone() {
    return this.microphoneDevices.find(device => device.deviceId === this.selectedMicDeviceId) || null;
  }

  /**
   * 取得當前選擇的輸出裝置資訊
   * @returns {MediaDeviceInfo|null}
   */
  getSelectedOutputDevice() {
    return this.outputDevices.find(device => device.deviceId === this.selectedOutputDeviceId) || null;
  }

  /**
   * 建立適用於 getUserMedia 的約束條件
   * @param {Object} [additionalConstraints={}] - 額外的音訊約束
   * @returns {Object} MediaStreamConstraints
   */
  getMicrophoneConstraints(additionalConstraints = {}) {
    console.log(`[DeviceManager] getMicrophoneConstraints 被呼叫`);
    console.log(`[DeviceManager] 當前 selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
    const constraints = {
      audio: {
        ...additionalConstraints
      },
      video: false
    };

    // 如果有選擇特定裝置，加入 deviceId 約束
    if (this.selectedMicDeviceId) {
      constraints.audio.deviceId = {
        exact: this.selectedMicDeviceId
      };
      console.log(`[DeviceManager] 已加入 deviceId 約束: ${this.selectedMicDeviceId}`);
    } else {
      console.log(`[DeviceManager] 沒有選擇特定裝置，使用系統預設`);
    }
    return constraints;
  }

  /**
   * 為 Audio 元素設定輸出裝置
   * @param {HTMLAudioElement} audioElement - Audio 元素
   * @param {string} [deviceId] - 裝置 ID（不提供則使用當前選擇的裝置）
   * @returns {Promise<void>}
   */
  async setAudioOutputDevice(audioElement, deviceId) {
    const targetDeviceId = deviceId || this.selectedOutputDeviceId;

    // 檢查瀏覽器是否支援 setSinkId
    if (typeof audioElement.setSinkId !== 'function') {
      console.warn('setSinkId is not supported in this browser');
      return;
    }
    try {
      await audioElement.setSinkId(targetDeviceId);
    } catch (error) {
      throw new Error(`Failed to set audio output device: ${error.message}`);
    }
  }

  /**
   * 檢查指定裝置是否仍然存在
   * @param {string} deviceId - 裝置 ID
   * @param {string} type - 'microphone' 或 'output'
   * @returns {boolean}
   */
  isDeviceAvailable(deviceId, type) {
    const devices = type === 'microphone' ? this.microphoneDevices : this.outputDevices;
    return devices.some(device => device.deviceId === deviceId);
  }

  /**
   * 啟動裝置變更監聽
   * 當裝置插拔時自動重新列舉
   */
  startDeviceChangeMonitoring() {
    if (!navigator.mediaDevices || this._deviceChangeListener) {
      return; // 不支援或已經在監聽
    }
    this._deviceChangeListener = async () => {
      try {
        // 重新列舉裝置
        await this.enumerateAllDevices(false); // 不需要重新請求權限

        // 觸發 devicechange 事件
        this._emit('devicechange', {
          microphones: this.microphoneDevices,
          outputs: this.outputDevices
        });
      } catch (error) {
        console.error('Device change enumeration failed:', error);
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', this._deviceChangeListener);
  }

  /**
   * 停止裝置變更監聽
   */
  stopDeviceChangeMonitoring() {
    if (this._deviceChangeListener && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', this._deviceChangeListener);
      this._deviceChangeListener = null;
    }
  }

  /**
   * 註冊事件監聽器
   * @param {string} event - 事件名稱 ('devicechange', 'micchange', 'outputchange')
   * @param {function} callback - 回調函數
   */
  on(event, callback) {
    if (!this._eventListeners[event]) {
      console.warn(`Unknown event: ${event}`);
      return;
    }
    this._eventListeners[event].push(callback);
  }

  /**
   * 移除事件監聽器
   * @param {string} event - 事件名稱
   * @param {function} callback - 回調函數
   */
  off(event, callback) {
    if (!this._eventListeners[event]) {
      return;
    }
    const index = this._eventListeners[event].indexOf(callback);
    if (index > -1) {
      this._eventListeners[event].splice(index, 1);
    }
  }

  /**
   * 觸發事件
   * @private
   */
  _emit(event, data) {
    if (!this._eventListeners[event]) {
      return;
    }
    this._eventListeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} event handler:`, error);
      }
    });
  }

  /**
   * 銷毀 DeviceManager，清理資源
   */
  destroy() {
    this.stopDeviceChangeMonitoring();
    this._eventListeners = {
      'devicechange': [],
      'micchange': [],
      'outputchange': []
    };
    this.microphoneDevices = [];
    this.outputDevices = [];
  }
}

/**
 * AudioEngine - 跨平台音訊錄音引擎
 * 
 * 功能：
 * - 封裝 Web Audio API (AudioContext, AudioWorklet)
 * - 支援 RecordRTC 錄音 (WAV 格式)
 * - 自動處理 AudioWorklet 與 ScriptProcessor fallback
 * - 提供錄音控制 (開始/停止/暫停/繼續)
 * - 事件驅動架構 (recording-start, data-available, recording-stop 等)
 * - 麥克風輸入管理與前級增益控制
 * - 整合裝置管理 (DeviceManager)
 * 
 * @example
 * const engine = new AudioEngine({
 *   sampleRate: 48000,
 *   autoGainControl: false,
 *   micGain: 1.0
 * });
 * 
 * engine.on('recording-start', () => console.log('Started'));
 * engine.on('data-available', (pcmData) => console.log('PCM chunk', pcmData));
 * engine.on('recording-stop', (blob) => console.log('Finished', blob));
 * 
 * await engine.initialize();
 * await engine.startRecording();
 * // ... 錄音中 ...
 * await engine.stopRecording();
 */

class AudioEngine {
  /**
   * 創建 AudioEngine 實例
   * @param {Object} options - 配置選項
   * @param {number} [options.sampleRate=48000] - 採樣率
   * @param {boolean} [options.autoGainControl=false] - 自動增益控制
   * @param {boolean} [options.echoCancellation=false] - 回音消除
   * @param {boolean} [options.noiseSuppression=false] - 噪音抑制
   * @param {number} [options.micGain=1.0] - 前級增益 (1.0-6.0)
   * @param {string} [options.deviceId] - 麥克風設備 ID
   * @param {string} [options.workletPath='assets/js/worklet/pcm-collector.js'] - AudioWorklet 模組路徑
   * @param {boolean} [options.preferWorklet=true] - 優先使用 AudioWorklet（支援時）
   * @param {DeviceManager} [options.deviceManager] - 外部提供的 DeviceManager 實例（可選）
   * @param {boolean} [options.autoManageDevices=true] - 是否自動創建和管理 DeviceManager
   */
  constructor(options = {}) {
    // 配置選項
    this.config = {
      sampleRate: options.sampleRate || 48000,
      autoGainControl: options.autoGainControl !== undefined ? options.autoGainControl : false,
      echoCancellation: options.echoCancellation !== undefined ? options.echoCancellation : false,
      noiseSuppression: options.noiseSuppression !== undefined ? options.noiseSuppression : false,
      micGain: options.micGain || 1.0,
      deviceId: options.deviceId || null,
      workletPath: options.workletPath || 'assets/js/worklet/pcm-collector.js',
      preferWorklet: options.preferWorklet !== undefined ? options.preferWorklet : true,
      autoManageDevices: options.autoManageDevices !== undefined ? options.autoManageDevices : true
    };

    // 裝置管理器
    if (options.deviceManager) {
      this.deviceManager = options.deviceManager;
      this._ownDeviceManager = false;
    } else if (this.config.autoManageDevices) {
      this.deviceManager = new DeviceManager();
      this._ownDeviceManager = true;
    } else {
      this.deviceManager = null;
      this._ownDeviceManager = false;
    }

    // Web Audio API 物件
    this.audioContext = null;
    this.analyser = null;
    this.preGainNode = null;
    this.mediaDest = null;
    this.analyserSilencer = null;

    // AudioWorklet 相關
    this.workletSupported = false;
    this.workletLoaded = false;
    this.pcmCollectorNode = null;
    this.usingWorklet = false;

    // PCM 數據收集 (AudioWorklet 模式)
    this.pcmChunks = [];
    this.pcmTotalSamples = 0;

    // RecordRTC 錄音器
    this.recorder = null;

    // RecordRTC 模式 PCM 採集
    this._pcmCaptureInterval = null;

    // 麥克風串流
    this.micStream = null;

    // 錄音狀態
    this.isRecording = false;
    this.isPaused = false;
    this.isInitialized = false;

    // 時間戳記
    this.recordStartTime = 0;
    this.recordStopTime = 0;
    this.recordWallStartMs = 0;
    this.recordWallStopMs = 0;

    // 最後的錄音結果
    this.latestBlob = null;
    this.latestUrl = null;

    // 事件監聽器
    this._eventListeners = {};
  }

  /**
   * 初始化音訊引擎
   * 創建 AudioContext、Analyser、Gain 節點等
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    try {
      // 創建 AudioContext
      // 注意：不指定 sampleRate，讓 AudioContext 使用硬體預設值
      // 這樣可以避免 "different sample-rate" 錯誤
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // 記錄實際使用的採樣率
      console.log(`[AudioEngine] AudioContext 採樣率: ${this.audioContext.sampleRate} Hz`);
      console.log(`[AudioEngine] 配置要求的採樣率: ${this.config.sampleRate} Hz`);
      if (this.audioContext.sampleRate !== this.config.sampleRate) {
        console.warn(`[AudioEngine] 注意：實際採樣率 (${this.audioContext.sampleRate}) 與配置 (${this.config.sampleRate}) 不同`);
      }

      // 創建分析器節點
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      // 創建前級增益節點
      this.preGainNode = this.audioContext.createGain();
      this.preGainNode.gain.value = this.config.micGain;

      // 創建 MediaStreamDestination（供 RecordRTC 使用）
      this.mediaDest = this.audioContext.createMediaStreamDestination();

      // 連接節點：preGain -> analyser -> silencer -> destination
      this.preGainNode.connect(this.analyser);
      this.preGainNode.connect(this.mediaDest);

      // 創建靜音節點（避免回授）
      this.analyserSilencer = this.audioContext.createGain();
      this.analyserSilencer.gain.value = 0;
      this.analyser.connect(this.analyserSilencer);
      this.analyserSilencer.connect(this.audioContext.destination);

      // 檢測 AudioWorklet 支援
      this.workletSupported = !!(this.audioContext.audioWorklet && window.AudioWorkletNode);

      // 載入 AudioWorklet 模組（如果支援且偏好使用）
      if (this.workletSupported && this.config.preferWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule(this.config.workletPath);
          this.workletLoaded = true;
          this._emit('worklet-loaded', {
            path: this.config.workletPath
          });
        } catch (error) {
          console.warn('載入 AudioWorklet 模組失敗，將回退到 RecordRTC:', error);
          this.workletLoaded = false;
          this._emit('worklet-load-failed', {
            error
          });
        }
      }

      // 恢復 AudioContext（如果暫停）
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.isInitialized = true;
      this._emit('initialized', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        workletSupported: this.workletSupported,
        workletLoaded: this.workletLoaded
      });
    } catch (error) {
      this._emit('error', {
        stage: 'initialize',
        error
      });
      throw error;
    }
  }

  /**
   * 開始錄音
   * @returns {Promise<void>}
   */
  async startRecording() {
    if (!this.isInitialized) {
      throw new Error('AudioEngine 尚未初始化，請先調用 initialize()');
    }
    if (this.isRecording) {
      throw new Error('已經在錄音中');
    }
    try {
      // 確保 AudioContext 是活躍狀態
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // 停止舊的麥克風串流（如果存在）
      this._stopMicrophone();

      // 獲取麥克風（會使用 DeviceManager 選擇的裝置）
      await this._captureMicrophone();

      // 重置 PCM 數據收集
      this.pcmChunks = [];
      this.pcmTotalSamples = 0;

      // 清理舊的錄音結果
      if (this.latestUrl) {
        URL.revokeObjectURL(this.latestUrl);
        this.latestUrl = null;
      }
      this.latestBlob = null;

      // 記錄開始時間
      this.recordStartTime = Date.now();
      this.recordWallStartMs = performance.now();
      this.recordStopTime = 0;
      this.recordWallStopMs = 0;

      // 決定使用 AudioWorklet 或 RecordRTC
      const useWorklet = this.workletLoaded && this.config.preferWorklet;
      if (useWorklet) {
        await this._startWorkletRecording();
      } else {
        await this._startRecordRTCRecording();
      }
      this.isRecording = true;
      this.isPaused = false;
      this._emit('recording-start', {
        timestamp: this.recordStartTime,
        mode: useWorklet ? 'worklet' : 'recordrtc',
        sampleRate: this.audioContext.sampleRate
      });
    } catch (error) {
      this._emit('error', {
        stage: 'start-recording',
        error
      });
      throw error;
    }
  }

  /**
   * 停止錄音
   * @returns {Promise<Blob>} 錄音的 Blob
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('目前沒有在錄音');
    }
    try {
      this.isRecording = false;
      this.recordStopTime = Date.now();
      this.recordWallStopMs = performance.now();
      let blob;
      if (this.usingWorklet) {
        blob = await this._stopWorkletRecording();
      } else if (this.recorder) {
        blob = await this._stopRecordRTCRecording();
      } else {
        throw new Error('沒有可用的錄音器');
      }

      // 停止麥克風
      this._stopMicrophone();

      // 儲存結果
      this.latestBlob = blob;
      this.latestUrl = URL.createObjectURL(blob);
      const duration = (this.recordStopTime - this.recordStartTime) / 1000;
      this._emit('recording-stop', {
        blob,
        url: this.latestUrl,
        duration,
        samples: this.pcmTotalSamples,
        sampleRate: this.audioContext.sampleRate
      });
      return blob;
    } catch (error) {
      this._emit('error', {
        stage: 'stop-recording',
        error
      });
      throw error;
    }
  }

  /**
   * 暫停錄音（僅 RecordRTC 模式支援）
   */
  pauseRecording() {
    if (!this.isRecording) {
      throw new Error('目前沒有在錄音');
    }
    if (this.usingWorklet) {
      throw new Error('AudioWorklet 模式不支援暫停功能');
    }
    if (this.recorder && typeof this.recorder.pauseRecording === 'function') {
      this.recorder.pauseRecording();
      this.isPaused = true;
      this._emit('recording-paused', {
        timestamp: Date.now()
      });
    } else {
      throw new Error('暫停功能不可用');
    }
  }

  /**
   * 繼續錄音（僅 RecordRTC 模式支援）
   */
  resumeRecording() {
    if (!this.isPaused) {
      throw new Error('錄音沒有暫停');
    }
    if (this.recorder && typeof this.recorder.resumeRecording === 'function') {
      this.recorder.resumeRecording();
      this.isPaused = false;
      this._emit('recording-resumed', {
        timestamp: Date.now()
      });
    } else {
      throw new Error('繼續錄音功能不可用');
    }
  }

  /**
   * 取得最新的錄音數據
   * @returns {Object} { blob, url, duration, samples }
   */
  getLatestRecording() {
    return {
      blob: this.latestBlob,
      url: this.latestUrl,
      duration: this.latestBlob ? (this.recordStopTime - this.recordStartTime) / 1000 : 0,
      samples: this.pcmTotalSamples,
      sampleRate: this.audioContext ? this.audioContext.sampleRate : 0
    };
  }

  /**
   * 取得 PCM 數據視窗（僅 AudioWorklet 模式）
   * @param {number} start - 起始樣本索引
   * @param {number} count - 樣本數量
   * @returns {Float32Array|null}
   */
  getPcmWindow(start, count) {
    if (!this.usingWorklet || !this.pcmChunks.length) {
      return null;
    }
    if (start < 0) start = 0;
    const total = this.pcmTotalSamples;
    if (start >= total) return new Float32Array(0);
    const end = Math.min(total, start + count);
    const out = new Float32Array(end - start);
    let offset = 0;
    let passed = 0;
    for (let i = 0; i < this.pcmChunks.length && passed < end; i++) {
      const chunk = this.pcmChunks[i];
      if (!chunk || !chunk.length) continue;
      const cLen = chunk.length;
      const cStart = passed;
      const cEnd = passed + cLen;
      if (cEnd <= start) {
        passed = cEnd;
        continue;
      }
      const segStart = Math.max(start, cStart);
      const segEnd = Math.min(end, cEnd);
      if (segEnd > segStart) {
        const localStart = segStart - cStart;
        const slice = chunk.subarray(localStart, localStart + (segEnd - segStart));
        out.set(slice, offset);
        offset += slice.length;
      }
      passed = cEnd;
      if (segEnd >= end) break;
    }
    return out;
  }

  /**
   * 取得 Analyser 節點（供外部波形顯示使用）
   * @returns {AnalyserNode|null}
   */
  getAnalyser() {
    return this.analyser;
  }

  /**
   * 取得 AudioContext
   * @returns {AudioContext|null}
   */
  getAudioContext() {
    return this.audioContext;
  }

  /**
   * 取得麥克風媒體流
   * @returns {MediaStream|null}
   */
  get microphoneStream() {
    return this.micStream;
  }

  /**
   * 設定前級增益
   * @param {number} gain - 增益值 (1.0-6.0)
   */
  setMicGain(gain) {
    gain = Math.max(1.0, Math.min(6.0, gain));
    this.config.micGain = gain;
    if (this.preGainNode) {
      this.preGainNode.gain.value = gain;
    }
    this._emit('mic-gain-changed', {
      gain
    });
  }

  /**
   * 釋放資源
   */
  dispose() {
    if (this.isRecording) {
      this.stopRecording().catch(console.error);
    }
    this._stopMicrophone();
    this._stopPcmCapture();
    if (this.latestUrl) {
      URL.revokeObjectURL(this.latestUrl);
      this.latestUrl = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    this.analyser = null;
    this.preGainNode = null;
    this.mediaDest = null;
    this.analyserSilencer = null;
    this.pcmCollectorNode = null;
    this.recorder = null;
    this.pcmChunks = [];
    this.pcmTotalSamples = 0;
    this.isInitialized = false;
    this._emit('disposed');
  }

  // ============================================================
  // 事件系統
  // ============================================================

  /**
   * 註冊事件監聽器
   * @param {string} event - 事件名稱
   * @param {Function} handler - 處理函數
   */
  on(event, handler) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(handler);
  }

  /**
   * 移除事件監聽器
   * @param {string} event - 事件名稱
   * @param {Function} handler - 處理函數
   */
  off(event, handler) {
    if (!this._eventListeners[event]) return;
    const index = this._eventListeners[event].indexOf(handler);
    if (index > -1) {
      this._eventListeners[event].splice(index, 1);
    }
  }

  /**
   * 觸發事件（內部使用）
   * @private
   */
  _emit(event, data) {
    if (!this._eventListeners[event]) return;
    this._eventListeners[event].forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`事件處理器錯誤 [${event}]:`, error);
      }
    });
  }

  // ============================================================
  // 私有方法 - 麥克風捕獲
  // ============================================================

  async _captureMicrophone() {
    let constraints;

    // 如果有 DeviceManager，使用它來建立約束條件
    if (this.deviceManager) {
      constraints = this.deviceManager.getMicrophoneConstraints({
        echoCancellation: this.config.echoCancellation,
        noiseSuppression: this.config.noiseSuppression,
        autoGainControl: this.config.autoGainControl
      });

      // 記錄選擇的裝置
      const selectedId = this.deviceManager.getSelectedMicrophoneId();
      console.log('[AudioEngine] 使用 DeviceManager 選擇的麥克風:', selectedId);
      console.log('[AudioEngine] 約束條件:', JSON.stringify(constraints, null, 2));
    } else {
      // 傳統模式：手動建立約束條件
      constraints = {
        audio: {
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl
        },
        video: false
      };

      // 加入設備 ID 限制（如果有指定）
      if (this.config.deviceId) {
        constraints.audio.deviceId = {
          exact: this.config.deviceId
        };
      }
      console.log('[AudioEngine] 使用傳統模式，約束條件:', JSON.stringify(constraints, null, 2));
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);

      // iOS 自動增益調整
      this._applyIOSMicGainAdjustment();

      // 連接麥克風到前級增益節點
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      source.connect(this.preGainNode);
      const usedDeviceId = this.deviceManager ? this.deviceManager.getSelectedMicrophoneId() : this.config.deviceId;

      // 取得實際使用的裝置資訊
      const audioTracks = this.micStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const actualDevice = audioTracks[0].label;
        console.log('[AudioEngine] 實際使用的麥克風:', actualDevice);
      }
      this._emit('microphone-captured', {
        deviceId: usedDeviceId,
        constraints
      });
    } catch (error) {
      // 如果指定設備失敗，嘗試使用預設設備
      if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
        console.warn('指定的麥克風無法使用，嘗試預設設備');
        delete constraints.audio.deviceId;
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        this._applyIOSMicGainAdjustment();
        const source = this.audioContext.createMediaStreamSource(this.micStream);
        source.connect(this.preGainNode);
        this._emit('microphone-captured-fallback', {
          constraints
        });
      } else {
        throw error;
      }
    }
  }
  _stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.warn('停止麥克風軌道失敗:', error);
        }
      });
      this.micStream = null;
    }
  }
  _applyIOSMicGainAdjustment() {
    // iOS 上 AGC 關閉時音量偏低，自動提升增益
    try {
      const ua = navigator.userAgent || '';
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      if (isIOS && !this.config.autoGainControl) {
        if (Math.abs(this.config.micGain - 1.0) < 0.0001) {
          this.setMicGain(3.5);
          this._emit('ios-gain-adjusted', {
            gain: 3.5
          });
        }
      }
    } catch (error) {
      console.warn('iOS 增益調整失敗:', error);
    }
  }

  // ============================================================
  // 私有方法 - AudioWorklet 錄音
  // ============================================================

  async _startWorkletRecording() {
    try {
      // 創建 AudioWorkletNode
      this.pcmCollectorNode = new AudioWorkletNode(this.audioContext, 'pcm-collector-processor');

      // 監聽 PCM 數據
      this.pcmCollectorNode.port.onmessage = event => {
        const {
          type,
          pcmData
        } = event.data;
        if (type === 'pcm-data' && pcmData) {
          this.pcmChunks.push(new Float32Array(pcmData));
          this.pcmTotalSamples += pcmData.length;
          this._emit('data-available', {
            pcmData: new Float32Array(pcmData),
            totalSamples: this.pcmTotalSamples,
            mode: 'worklet'
          });
        }
      };

      // 連接節點：preGain -> pcmCollector -> analyser
      this.preGainNode.connect(this.pcmCollectorNode);
      this.pcmCollectorNode.connect(this.audioContext.destination);
      this.usingWorklet = true;
    } catch (error) {
      console.error('AudioWorklet 啟動失敗，回退到 RecordRTC:', error);
      this.usingWorklet = false;
      await this._startRecordRTCRecording();
    }
  }
  async _stopWorkletRecording() {
    try {
      // 斷開 AudioWorkletNode
      if (this.pcmCollectorNode) {
        this.pcmCollectorNode.port.onmessage = null;
        this.preGainNode.disconnect(this.pcmCollectorNode);
        this.pcmCollectorNode.disconnect();
        this.pcmCollectorNode = null;
      }

      // 合併 PCM 數據並轉換為 WAV
      if (this.pcmChunks.length === 0) {
        throw new Error('沒有錄音數據');
      }
      const merged = new Float32Array(this.pcmTotalSamples);
      let offset = 0;
      for (const chunk of this.pcmChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // 轉換為 16-bit PCM WAV
      const wavBuffer = this._buildWavFromFloat32Mono(merged, this.audioContext.sampleRate);
      const blob = new Blob([wavBuffer], {
        type: 'audio/wav'
      });
      this.usingWorklet = false;
      return blob;
    } catch (error) {
      console.error('AudioWorklet 停止失敗:', error);
      throw error;
    }
  }

  // ============================================================
  // 私有方法 - RecordRTC 錄音
  // ============================================================

  async _startRecordRTCRecording() {
    return new Promise((resolve, reject) => {
      try {
        // 檢查 RecordRTC 是否可用
        if (typeof RecordRTC === 'undefined') {
          reject(new Error('RecordRTC 未載入'));
          return;
        }
        const recordStream = this.mediaDest.stream || this.micStream;
        this.recorder = RecordRTC(recordStream, {
          type: 'audio',
          mimeType: 'audio/wav',
          recorderType: StereoAudioRecorder,
          numberOfAudioChannels: 1,
          bufferSize: 4096,
          timeSlice: 100,
          ondataavailable: blob => {
            this._emit('data-available', {
              blob,
              mode: 'recordrtc'
            });
          }
        });
        this.recorder.startRecording();
        this.usingWorklet = false;

        // 啟動 PCM 數據採集循環（用於累積波形）
        this._startPcmCapture();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
  async _stopRecordRTCRecording() {
    return new Promise((resolve, reject) => {
      try {
        if (!this.recorder) {
          reject(new Error('RecordRTC 錄音器不存在'));
          return;
        }

        // 停止 PCM 數據採集循環
        this._stopPcmCapture();
        this.recorder.stopRecording(() => {
          try {
            const blob = this.recorder.getBlob();

            // 清理錄音器
            this.recorder = null;
            resolve(blob);
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 啟動 PCM 數據採集（RecordRTC 模式使用）
   * @private
   */
  _startPcmCapture() {
    if (!this.analyser) return;
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    // 每 100ms 採集一次 PCM 數據
    this._pcmCaptureInterval = setInterval(() => {
      if (!this.isRecording || !this.analyser) {
        return;
      }

      // 從 AnalyserNode 讀取時域數據
      this.analyser.getFloatTimeDomainData(dataArray);

      // 複製數據以避免被覆蓋
      const pcmChunk = new Float32Array(dataArray);

      // 儲存到 pcmChunks
      this.pcmChunks.push(pcmChunk);
      this.pcmTotalSamples += pcmChunk.length;

      // 發送事件給 WaveformRenderer
      this._emit('data-available', {
        pcmData: pcmChunk,
        totalSamples: this.pcmTotalSamples,
        mode: 'recordrtc-pcm'
      });
    }, 100);
  }

  /**
   * 停止 PCM 數據採集
   * @private
   */
  _stopPcmCapture() {
    if (this._pcmCaptureInterval) {
      clearInterval(this._pcmCaptureInterval);
      this._pcmCaptureInterval = null;
    }
  }

  // ============================================================
  // 私有方法 - WAV 格式轉換
  // ============================================================

  _buildWavFromFloat32Mono(float32Data, sampleRate) {
    const numSamples = float32Data.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // WAV Header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, 1, true); // number of channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    this._writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // PCM Data (float32 -> int16)
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
    return buffer;
  }
  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * 銷毀 AudioEngine，釋放所有資源
   */
  destroy() {
    // 停止錄音（如果正在錄音）
    if (this.isRecording) {
      this.stopRecording().catch(err => {
        console.warn('停止錄音失敗:', err);
      });
    }

    // 停止麥克風
    this._stopMicrophone();

    // 停止 PCM 採集
    this._stopPcmCapture();

    // 清理 AudioWorklet
    if (this.pcmCollectorNode) {
      this.pcmCollectorNode.disconnect();
      this.pcmCollectorNode = null;
    }

    // 關閉 AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch(err => {
        console.warn('關閉 AudioContext 失敗:', err);
      });
      this.audioContext = null;
    }

    // 清理 DeviceManager（如果是自己創建的）
    if (this._ownDeviceManager && this.deviceManager) {
      this.deviceManager.destroy();
      this.deviceManager = null;
    }

    // 清理事件監聽器
    this._eventListeners = {};

    // 重置狀態
    this.isInitialized = false;
    this.isRecording = false;
  }
}

/**
 * WaveformRenderer.js
 * 波形渲染模組 - 整合即時波形、累積波形、概覽波形和 VU Meter
 * 
 * @module WaveformRenderer
 * @description 提供完整的波形可視化功能，包含：
 * - LiveWaveform: 即時波形顯示（從 AnalyserNode）
 * - VUMeter: 音量表顯示（RMS/Peak dBFS）
 * - AccumulatedWaveform: 累積波形（使用 Worker 加速）
 * - OverviewWaveform: 全局概覽波形
 */

/**
 * WaveformRenderer - 波形渲染管理器
 * 統一管理所有波形組件的初始化、更新和銷毀
 */
class WaveformRenderer {
  /**
   * @param {Object} options - 配置選項
   * @param {HTMLCanvasElement} options.liveCanvas - 即時波形 Canvas
   * @param {HTMLCanvasElement} options.vuMeterCanvas - VU Meter Canvas
   * @param {HTMLCanvasElement} options.accumulatedCanvas - 累積波形 Canvas
   * @param {HTMLCanvasElement} options.overviewCanvas - 概覽波形 Canvas
   * @param {AnalyserNode} options.analyserNode - Web Audio AnalyserNode
   * @param {Object} options.audioEngine - AudioEngine 實例（可選，會自動獲取 analyserNode）
   * @param {string} [options.workerPath] - Worker 腳本路徑
   * @param {boolean} [options.useWorker=true] - 是否使用 Worker
   * @param {boolean} [options.showClipMarks=true] - 是否顯示削波標記
   */
  constructor(options = {}) {
    this.options = {
      workerPath: options.workerPath || 'workers/wf-worker.js',
      useWorker: options.useWorker !== false,
      showClipMarks: options.showClipMarks !== false,
      ...options
    };

    // 支援從 audioEngine 獲取 analyserNode
    this.audioEngine = options.audioEngine;
    this.liveWaveform = null;
    this.vuMeter = null;
    this.accumulatedWaveform = null;
    this.overviewWaveform = null;
    this.isVerticalMode = false;
    this._overviewUpdateScheduled = false;

    // 如果提供了 audioEngine，監聽錄音事件
    if (this.audioEngine) {
      this._setupAudioEngineListeners();
    }
  }

  /**
   * 設置 AudioEngine 事件監聽
   * @private
   */
  _setupAudioEngineListeners() {
    if (!this.audioEngine) return;

    // 錄音開始時自動啟動波形
    this.audioEngine.on('recording-start', () => {
      this.start();
    });

    // 錄音停止時停止波形
    this.audioEngine.on('recording-stop', () => {
      this.stopLive();
    });

    // PCM 數據到達時更新累積波形
    this.audioEngine.on('data-available', data => {
      if (data.pcmData && this.accumulatedWaveform) {
        this.appendPCM(data.pcmData);
      }
    });
  }

  /**
   * 初始化所有波形組件
   */
  async initialize() {
    const {
      liveCanvas,
      vuMeterCanvas,
      accumulatedCanvas,
      overviewCanvas
    } = this.options;

    // 從 audioEngine 或 options 獲取 analyserNode
    let analyserNode = this.options.analyserNode;
    if (!analyserNode && this.audioEngine && typeof this.audioEngine.getAnalyser === 'function') {
      analyserNode = this.audioEngine.getAnalyser();
    }

    // 初始化即時波形
    if (liveCanvas && analyserNode) {
      this.liveWaveform = new LiveWaveform(liveCanvas, analyserNode);
    }

    // 初始化 VU Meter
    if (vuMeterCanvas && analyserNode) {
      this.vuMeter = new VUMeter(vuMeterCanvas, analyserNode);
    }

    // 初始化累積波形
    if (accumulatedCanvas) {
      this.accumulatedWaveform = new AccumulatedWaveform(accumulatedCanvas, {
        workerPath: this.options.workerPath,
        useWorker: this.options.useWorker,
        showClipMarks: this.options.showClipMarks
      });
    }

    // 初始化概覽波形
    if (overviewCanvas && this.accumulatedWaveform) {
      this.overviewWaveform = new OverviewWaveform(overviewCanvas, this.accumulatedWaveform);
      // 建立雙向引用，讓累積波形可以通知概覽波形更新
      this.accumulatedWaveform.overviewWaveform = this.overviewWaveform;
    }
  }

  /**
   * 開始即時波形顯示
   * @param {MediaStream} stream - 麥克風媒體流
   * @param {AudioContext} audioContext - Web Audio Context
   * @param {GainNode} [preGainNode] - 前級增益節點（可選）
   */
  startLive(stream, audioContext, preGainNode) {
    if (this.liveWaveform) {
      this.liveWaveform.start(stream, audioContext, preGainNode);
    }
    if (this.vuMeter) {
      this.vuMeter.start();
    }
  }

  /**
   * 開始波形顯示（簡化版，從 audioEngine 自動獲取資訊）
   */
  start() {
    if (!this.audioEngine) {
      console.warn('No audioEngine provided, cannot start waveform rendering');
      return;
    }

    // 獲取必要資訊
    const stream = this.audioEngine.microphoneStream;
    const audioContext = this.audioEngine.audioContext;
    const preGainNode = this.audioEngine.preGainNode;
    if (stream && audioContext) {
      this.startLive(stream, audioContext, preGainNode);
    }
  }

  /**
   * 停止即時波形顯示
   */
  stopLive() {
    if (this.liveWaveform) {
      this.liveWaveform.stop();
    }
    if (this.vuMeter) {
      this.vuMeter.stop();
    }
  }

  /**
   * 附加 PCM 數據到累積波形
   * @param {Float32Array} pcmData - PCM 音訊數據
   */
  appendPCM(pcmData) {
    if (this.accumulatedWaveform) {
      this.accumulatedWaveform.append(pcmData);

      // 同時更新 OverviewWaveform
      if (this.overviewWaveform) {
        // 使用 requestAnimationFrame 避免過度繪製
        if (!this._overviewUpdateScheduled) {
          this._overviewUpdateScheduled = true;
          requestAnimationFrame(() => {
            if (this.overviewWaveform) {
              this.overviewWaveform.draw();
            }
            this._overviewUpdateScheduled = false;
          });
        }
      }
    }
  }

  /**
   * 重置所有波形
   */
  reset() {
    if (this.accumulatedWaveform) {
      this.accumulatedWaveform.reset();
    }
    if (this.overviewWaveform) {
      this.overviewWaveform.clear();
    }
  }

  /**
   * 清除所有波形
   */
  clear() {
    if (this.liveWaveform) {
      this.liveWaveform.canvasContext.clearRect(0, 0, this.liveWaveform.width, this.liveWaveform.height);
    }
    if (this.vuMeter) {
      this.vuMeter.clear();
    }
    if (this.accumulatedWaveform) {
      this.accumulatedWaveform.clear();
    }
    if (this.overviewWaveform) {
      this.overviewWaveform.clear();
    }
  }

  /**
   * 設定垂直/水平模式
   * @param {boolean} isVertical - 是否為垂直模式
   */
  setVerticalMode(isVertical) {
    this.isVerticalMode = isVertical;

    // 通知 Worker 模式變更
    if (this.accumulatedWaveform && this.accumulatedWaveform._worker) {
      this.accumulatedWaveform._worker.postMessage({
        type: 'setVerticalMode',
        verticalMode: isVertical
      });
    }
  }

  /**
   * 調整 Canvas 尺寸
   */
  resize() {
    if (this.liveWaveform) {
      this.liveWaveform.width = this.liveWaveform.canvas.width;
      this.liveWaveform.height = this.liveWaveform.canvas.height;
    }
    if (this.vuMeter) {
      this.vuMeter.resize();
    }
    if (this.accumulatedWaveform) {
      this.accumulatedWaveform.width = this.accumulatedWaveform.canvas.width;
      this.accumulatedWaveform.height = this.accumulatedWaveform.canvas.height;
      if (this.accumulatedWaveform._worker) {
        this.accumulatedWaveform._worker.postMessage({
          type: 'resize',
          width: this.accumulatedWaveform.width,
          height: this.accumulatedWaveform.height
        });
      }
      this.accumulatedWaveform.draw();
    }
    if (this.overviewWaveform) {
      this.overviewWaveform.width = this.overviewWaveform.canvas.width;
      this.overviewWaveform.height = this.overviewWaveform.canvas.height;
      this.overviewWaveform.draw();
    }
  }

  /**
   * 銷毀所有組件，釋放資源
   */
  destroy() {
    this.stopLive();
    if (this.accumulatedWaveform && this.accumulatedWaveform._worker) {
      this.accumulatedWaveform._worker.terminate();
    }
    this.liveWaveform = null;
    this.vuMeter = null;
    this.accumulatedWaveform = null;
    this.overviewWaveform = null;
  }
}

/* ================================================================
 * LiveWaveform 類 - 即時波形顯示
 * 從 AnalyserNode 取得時域數據並即時繪製波形
 * 支援水平和垂直模式
 * ================================================================ */
class LiveWaveform {
  constructor(canvas, analyserNode) {
    this.canvas = canvas;
    this.canvasContext = canvas.getContext('2d');
    this.analyser = analyserNode;
    this.mediaStreamSource = null;
    this.animationId = null;
    this.isRunning = false;
    this.width = canvas.width;
    this.height = canvas.height;
    this.bufferLength = 0;
    this.dataArray = null;
    this.amplification = 3.0;
    this._lastDataArray = null;
    this._verticalScrollOffset = 0;
  }

  /**
   * 開始即時波形顯示
   * @param {MediaStream} stream - 麥克風媒體流
   * @param {AudioContext} audioContext - Web Audio Context
   * @param {GainNode} [preGainNode] - 前級增益節點（可選）
   */
  start(stream, audioContext, preGainNode) {
    if (this.isRunning || !audioContext || !this.analyser) {
      console.warn('LiveWaveform.start() 條件不滿足:', {
        isRunning: this.isRunning,
        hasAudioContext: !!audioContext,
        hasAnalyser: !!this.analyser
      });
      return;
    }
    console.log('✅ LiveWaveform 開始啟動...');
    this.isRunning = true;
    const self = this;

    // 確保 AudioContext 處於運行狀態
    let contextReady = Promise.resolve();
    if (audioContext.state === 'suspended') {
      contextReady = audioContext.resume().catch(function (err) {
        console.warn('Unable to resume AudioContext:', err);
      });
    }

    // 等待 AudioContext 就緒後再連接麥克風
    contextReady.then(function () {
      // 為避免重複連線先清除舊的 source
      if (self.mediaStreamSource) {
        self.mediaStreamSource.disconnect();
      }

      // 連接麥克風
      self.mediaStreamSource = audioContext.createMediaStreamSource(stream);
      if (preGainNode) {
        try {
          self.mediaStreamSource.connect(preGainNode);
        } catch (e) {
          console.warn('connect preGainNode failed', e);
        }
      } else {
        self.mediaStreamSource.connect(self.analyser);
      }

      // 設定 FFT 參數
      self.analyser.fftSize = 1024;
      self.bufferLength = self.analyser.fftSize;
      self.dataArray = new Uint8Array(self.bufferLength);
      console.log('✅ LiveWaveform 音訊連接完成，開始繪製');

      // 立即開始繪製
      self.draw(false); // false = 水平模式
    });
  }

  /**
   * 停止即時波形顯示
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.canvasContext.clearRect(0, 0, this.width, this.height);
  }

  /**
   * 繪製波形（持續更新）
   * @param {boolean} [isVertical=false] - 是否為垂直模式
   */
  draw(isVertical = false) {
    if (!this.isRunning || !this.analyser || !this.dataArray) {
      return;
    }
    this.animationId = requestAnimationFrame(() => this.draw(isVertical));
    this.analyser.getByteTimeDomainData(this.dataArray);
    if (!isVertical) {
      // 水平模式
      this.canvasContext.fillStyle = '#f0f0f0';
      this.canvasContext.fillRect(0, 0, this.width, this.height);
      this.canvasContext.lineWidth = 2;
      this.canvasContext.strokeStyle = '#1E88E5';
      this.canvasContext.beginPath();
      const sliceWidth = this.width / this.bufferLength;
      let x = 0;
      for (let i = 0; i < this.bufferLength; i++) {
        const v = (this.dataArray[i] / 128.0 - 1) * this.amplification;
        const y = v * this.height / 2 + this.height / 2;
        if (i === 0) {
          this.canvasContext.moveTo(x, y);
        } else {
          this.canvasContext.lineTo(x, y);
        }
        x += sliceWidth;
      }
      this.canvasContext.lineTo(this.width, this.height / 2);
      this.canvasContext.stroke();
    } else {
      // 垂直模式（滾動繪製）
      const scrollSpeed = 2;
      this._verticalScrollOffset += scrollSpeed;
      if (this._verticalScrollOffset >= this.height) {
        this._verticalScrollOffset = 0;
        this.canvasContext.fillStyle = '#f0f0f0';
        this.canvasContext.fillRect(0, 0, this.width, this.height);
      }
      this.canvasContext.lineWidth = 1.5;
      this.canvasContext.strokeStyle = '#1E88E5';
      this.canvasContext.beginPath();
      const sliceHeight = this.height / this.bufferLength;
      let y = 0;
      for (let i = 0; i < this.bufferLength; i++) {
        const v = (this.dataArray[i] / 128.0 - 1) * this.amplification;
        const x = v * this.width / 2 + this.width / 2;
        if (i === 0) {
          this.canvasContext.moveTo(x, y);
        } else {
          this.canvasContext.lineTo(x, y);
        }
        y += sliceHeight;
      }
      this.canvasContext.stroke();
    }
  }
}

/* ================================================================
 * VUMeter 類 - 即時音量 (RMS/Peak) 顯示
 * 計算 RMS 與 Peak，轉換為 dB 值 (-90dB ~ 0dB)
 * 提供 peak hold 功能：峰值維持一段時間後緩降
 * ================================================================ */
class VUMeter {
  constructor(canvas, analyserNode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyserNode;
    this.bufferLength = 2048;
    this.timeData = new Float32Array(this.bufferLength);
    this.levelDb = -90;
    this.peakDb = -90;
    this.holdPeakDb = -90;
    this.lastPeakTime = 0;
    this.peakHoldMillis = 1500;
    this.fallRateDbPerSec = 20;
    this.minDb = -90;
    this.maxDb = 0;
    this.animationId = null;
    this.lastClipTime = 0;
    this.clipHoldMillis = 2000;
    this._lastLogTime = 0;
  }
  _computeLevels() {
    if (!this.analyser) return {
      rmsDb: this.minDb,
      peakDb: this.minDb
    };
    const required = this.analyser.fftSize || this.bufferLength;
    if (this.timeData.length !== required) {
      this.bufferLength = required;
      this.timeData = new Float32Array(required);
    }
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sumSquares = 0;
    let peak = 0;
    let clipped = false;
    for (let i = 0; i < this.bufferLength; i++) {
      let v = this.timeData[i];
      if (v > 1) v = 1;else if (v < -1) v = -1;
      sumSquares += v * v;
      const absV = Math.abs(v);
      if (absV > peak) peak = absV;
      if (absV >= 0.995) clipped = true;
    }
    const rms = Math.sqrt(sumSquares / this.bufferLength);
    let rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    let peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    if (rmsDb < this.minDb) rmsDb = this.minDb;
    if (rmsDb > this.maxDb) rmsDb = this.maxDb;
    if (peakDb < this.minDb) peakDb = this.minDb;
    if (peakDb > this.maxDb) peakDb = this.maxDb;
    if (clipped) {
      this.lastClipTime = performance.now ? performance.now() : Date.now();
    }
    return {
      rmsDb,
      peakDb
    };
  }
  resize() {
    this.clear();
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  draw(currentDb) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 背景
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#2d3748');
    grd.addColorStop(1, '#1a202c');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // dB 對應到 0~1
    let norm = (currentDb - this.minDb) / (this.maxDb - this.minDb);
    if (norm < 0) norm = 0;
    if (norm > 1) norm = 1;

    // 彩色漸層 (綠->黃->紅)
    const barGrad = ctx.createLinearGradient(0, 0, w, 0);
    barGrad.addColorStop(0, '#38a169');
    barGrad.addColorStop(0.6, '#d69e2e');
    barGrad.addColorStop(0.85, '#dd6b20');
    barGrad.addColorStop(1, '#c53030');
    ctx.fillStyle = barGrad;
    const barWidth = Math.round(w * norm);
    ctx.fillRect(0, 0, barWidth, h);

    // 刻度線
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let db = this.minDb; db <= this.maxDb; db += 10) {
      const posNorm = (db - this.minDb) / (this.maxDb - this.minDb);
      const xPos = Math.round(w * posNorm) + 0.5;
      if (db === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, h);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      } else {
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, h * 0.4);
        ctx.moveTo(xPos, h);
        ctx.lineTo(xPos, h * 0.6);
      }
      if (db % 20 === 0 || db === -10) {
        const label = db.toString();
        ctx.fillStyle = db === 0 ? '#ffffff' : db === -10 ? '#ffeb3b' : '#cbd5e0';
        ctx.font = '10px -apple-system,Segoe UI,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, xPos, 1);
      }
    }
    ctx.restore();

    // -10dBFS 區域高亮
    const minus10Norm = (-10 - this.minDb) / (this.maxDb - this.minDb);
    if (minus10Norm > 0 && minus10Norm < 1) {
      const minus10X = Math.round(w * minus10Norm);
      ctx.save();
      ctx.fillStyle = 'rgba(255,235,59,0.08)';
      ctx.fillRect(minus10X - 2, 0, 4, h);
      ctx.restore();
    }

    // 峰值 hold 指示線
    let holdNorm = (this.holdPeakDb - this.minDb) / (this.maxDb - this.minDb);
    if (holdNorm < 0) holdNorm = 0;
    if (holdNorm > 1) holdNorm = 1;
    const holdX = Math.round(w * holdNorm);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(holdX + 0.5, 0);
    ctx.lineTo(holdX + 0.5, h);
    ctx.stroke();

    // 文字顯示
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 12px -apple-system,Segoe UI,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const displayRms = currentDb <= this.minDb ? '-∞' : currentDb.toFixed(1);
    const displayPeak = this.peakDb <= this.minDb ? '-∞' : this.peakDb.toFixed(1);
    const txt = `RMS ${displayRms} dBFS   Peak ${displayPeak} dBFS`;
    ctx.fillText(txt, 8, h / 2);

    // CLIP 指示
    const now = performance.now ? performance.now() : Date.now();
    if (this.lastClipTime && now - this.lastClipTime < this.clipHoldMillis) {
      ctx.save();
      ctx.fillStyle = '#B00020';
      const badgeW = 42,
        badgeH = 18;
      ctx.fillRect(w - badgeW - 8, 4, badgeW, badgeH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px -apple-system,Segoe UI,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CLIP', w - badgeW / 2 - 8, 4 + badgeH / 2 + 0.5);
      ctx.restore();
    }
  }
  update() {
    const levels = this._computeLevels();
    this.levelDb = levels.rmsDb;
    this.peakDb = levels.peakDb;
    const now = performance.now();

    // 更新 peak hold
    if (this.peakDb > this.holdPeakDb + 0.5) {
      this.holdPeakDb = this.peakDb;
      this.lastPeakTime = now;
    } else {
      const elapsed = now - this.lastPeakTime;
      if (elapsed > this.peakHoldMillis) {
        const fallSeconds = (elapsed - this.peakHoldMillis) / 1000;
        const fallAmount = this.fallRateDbPerSec * fallSeconds;
        this.holdPeakDb = Math.max(this.peakDb, this.holdPeakDb - fallAmount);
      }
    }
    this.draw(this.levelDb);
  }
  start() {
    this.stop();
    if (this.analyser) {
      const required = this.analyser.fftSize || 2048;
      if (this.timeData.length !== required) {
        this.bufferLength = required;
        this.timeData = new Float32Array(required);
      }
    }
    const self = this;
    function loop() {
      self.update();
      self.animationId = requestAnimationFrame(loop);
    }
    loop();
  }
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }
}

/* ================================================================
 * AccumulatedWaveform 類 - 累積音訊波形顯示
 * 持續繪製目前錄製完成的音訊波形
 * 支援 OffscreenCanvas + Worker 加速
 * 支援縮放、平移、播放位置顯示
 * ================================================================ */
class AccumulatedWaveform {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.canvasContext = null;
    this.width = canvas.width;
    this.height = canvas.height;
    this.targetSampleRate = 5000;
    this.sourceSampleRate = 48000;
    this.decimationFactor = 10;
    this.sampleMin = [];
    this.sampleMax = [];
    this.sampleCount = 0;
    this.zoomFactor = 1;
    this.viewStart = 0;
    this.isAutoScroll = true;
    this._panRemainder = 0;
    this.playbackPosition = 0;
    this.isPlaying = false;
    this.playbackStartTime = 0;
    this.playbackStartSample = 0;
    this.rawZoomMode = false;
    this.rawViewStart = 0;
    this.rawVisibleRaw = 0;

    // 關聯的 OverviewWaveform（用於同步更新）
    this.overviewWaveform = null;
    this._useWorker = options.useWorker !== false;
    this._worker = null;
    this._appendBatchMin = [];
    this._appendBatchMax = [];
    this._appendFlushScheduled = false;
    this.lastDetail = null;
    this.lastDensity = null;

    // 嘗試使用 OffscreenCanvas + Worker
    if (this._useWorker && canvas.transferControlToOffscreen && typeof Worker !== 'undefined') {
      try {
        const off = canvas.transferControlToOffscreen();
        this._worker = new Worker(options.workerPath || 'workers/wf-worker.js');
        this._worker.postMessage({
          type: 'init',
          canvas: off,
          width: this.width,
          height: this.height,
          verticalMode: false,
          showClipMarks: options.showClipMarks !== false,
          sourceSampleRate: this.sourceSampleRate,
          decimationFactor: this.decimationFactor
        }, [off]);
        const self = this;
        this._worker.onmessage = function (ev) {
          const msg = ev.data;
          if (!msg) return;
          if (msg.type === 'detailUpdate') {
            self.lastDetail = msg.detail;
            self.lastDensity = msg.density;
          }
        };
      } catch (e) {
        console.warn('OffscreenCanvas 初始化失敗，使用主線程繪製:', e);
        this._useWorker = false;
      }
    } else {
      this._useWorker = false;
    }

    // 如果沒有使用 Worker，獲取 2D context
    if (!this._useWorker) {
      try {
        this.canvasContext = canvas.getContext('2d');
      } catch (e) {
        console.warn('無法獲取 canvas context:', e);
      }
    }

    // 設置滑鼠互動
    this._setupMouseInteraction();
    this.clear();
  }

  /**
   * 設置滑鼠互動（平移、縮放、點擊定位）
   * @private
   */
  _setupMouseInteraction() {
    if (!this.canvas) return;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartViewStart = 0;

    // 滑鼠按下
    this.canvas.addEventListener('mousedown', e => {
      isDragging = true;
      dragStartX = e.offsetX;
      dragStartViewStart = this.viewStart;
      this.isAutoScroll = false;
      this.canvas.style.cursor = 'grabbing';
    });

    // 滑鼠移動（拖曳）
    this.canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const deltaX = e.offsetX - dragStartX;
      const info = this.getVisibleSamples();
      const samplesPerPixel = info.visible / this.width;
      const sampleDelta = Math.round(-deltaX * samplesPerPixel);
      this.viewStart = dragStartViewStart + sampleDelta;
      this._enforceViewBounds();
      this.draw();

      // 同步更新 OverviewWaveform
      if (this.overviewWaveform) {
        this.overviewWaveform.draw();
      }
    });

    // 滑鼠放開
    this.canvas.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    // 滑鼠離開 canvas
    this.canvas.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        this.canvas.style.cursor = 'default';
      }
    });

    // 滑鼠滾輪（縮放）
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();

      // 計算滑鼠位置相對於 canvas 的比例
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const anchorRatio = x / this.width;

      // 根據滾輪方向縮放
      const zoomSteps = e.deltaY > 0 ? -1 : 1;
      this.zoomBySteps(zoomSteps, anchorRatio);
    });

    // 點擊定位（跳到播放位置）
    this.canvas.addEventListener('click', e => {
      if (isDragging) return; // 如果是拖曳結束，不觸發點擊

      const info = this.getVisibleSamples();
      const clickRatio = e.offsetX / this.width;
      const clickedSample = Math.floor(info.start + clickRatio * info.visible);

      // 觸發自定義事件，讓外部處理播放跳轉
      const event = new CustomEvent('waveform-seek', {
        detail: {
          sample: clickedSample,
          time: clickedSample / this.sourceSampleRate
        }
      });
      this.canvas.dispatchEvent(event);
    });

    // 設置 cursor 樣式
    this.canvas.style.cursor = 'grab';
  }
  clear() {
    if (this._useWorker && this._worker) {
      this._worker.postMessage({
        type: 'reset'
      });
      return;
    }
    if (!this.canvasContext) return;
    this.canvasContext.clearRect(0, 0, this.width, this.height);
    this.canvasContext.fillStyle = '#f0f0f0';
    this.canvasContext.fillRect(0, 0, this.width, this.height);
    this.canvasContext.lineWidth = 1;
    this.canvasContext.strokeStyle = '#d0d0d0';
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(0, this.height / 2);
    this.canvasContext.lineTo(this.width, this.height / 2);
    this.canvasContext.stroke();
  }
  reset() {
    this.sampleMin.length = 0;
    this.sampleMax.length = 0;
    this.sampleCount = 0;
    this.zoomFactor = 1;
    this.viewStart = 0;
    this.isAutoScroll = true;
    this._panRemainder = 0;
    this.clear();
  }
  append(audioSamples) {
    if (!audioSamples || !audioSamples.length) {
      return;
    }
    const factor = this.decimationFactor;
    const total = audioSamples.length;
    const appendedMin = [];
    const appendedMax = [];

    // 每秒記錄一次
    if (!this._lastAppendLog) this._lastAppendLog = 0;
    const now = Date.now();
    if (now - this._lastAppendLog > 1000) {
      console.log('📈 AccumulatedWaveform.append():', total, '樣本 →', Math.floor(total / factor), '區塊');
      this._lastAppendLog = now;
    }

    // 改進的演算法：DC Offset Removal（移除直流偏移）
    // 先計算區塊平均值，再以此為中心計算 min/max
    // 這樣可以讓波形更對稱、細緻
    for (let i = 0; i < total; i += factor) {
      let blockSum = 0;
      let blockCount = 0;

      // 第一階段：計算區塊平均值（DC offset）
      for (let j = 0; j < factor && i + j < total; j++) {
        const sample = audioSamples[i + j];
        blockSum += sample;
        blockCount++;
      }
      if (!blockCount) {
        continue;
      }
      const blockMean = blockSum / blockCount;

      // 第二階段：以區塊平均值為中心，計算去中心化的 min/max
      let blockMin = 1.0;
      let blockMax = -1;
      for (let k = 0; k < blockCount; k++) {
        const centeredSample = audioSamples[i + k] - blockMean;
        if (centeredSample < blockMin) {
          blockMin = centeredSample;
        }
        if (centeredSample > blockMax) {
          blockMax = centeredSample;
        }
      }

      // 防呆：確保 min <= max
      if (blockMin > blockMax) {
        blockMin = blockMax = 0;
      }
      this.sampleMin.push(blockMin);
      this.sampleMax.push(blockMax);
      appendedMin.push(blockMin);
      appendedMax.push(blockMax);
      this.sampleCount++;
    }
    if (this.isAutoScroll) {
      this.scrollToLatest();
    } else {
      this._enforceViewBounds();
    }
    if (this._useWorker && this._worker) {
      this._appendBatchMin.push(...appendedMin);
      this._appendBatchMax.push(...appendedMax);
      if (!this._appendFlushScheduled) {
        this._appendFlushScheduled = true;
        const self = this;
        const flush = () => self._flushAppendBatch();
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(flush);
        } else {
          setTimeout(flush, 32);
        }
      }
    }
    this.draw();
  }
  _flushAppendBatch() {
    if (!this._worker || this._appendBatchMin.length === 0) {
      this._appendFlushScheduled = false;
      return;
    }
    this._worker.postMessage({
      type: 'append',
      minArr: this._appendBatchMin,
      maxArr: this._appendBatchMax
    });
    this._appendBatchMin = [];
    this._appendBatchMax = [];
    this._appendFlushScheduled = false;
  }
  draw() {
    if (this._useWorker && this._worker) {
      this._worker.postMessage({
        type: 'draw',
        zoomFactor: this.zoomFactor,
        viewStart: this.viewStart,
        playbackPosition: this.playbackPosition,
        isPlaying: this.isPlaying
      });
      return;
    }
    if (!this.canvasContext) return;

    // 主線程繪製
    this.clear();
    if (this.sampleCount === 0) return;

    // 使用 getVisibleSamples() 獲取正確的可見範圍
    const info = this.getVisibleSamples();
    const {
      start,
      end,
      visible
    } = info;
    if (visible === 0 || start >= end) return;
    const centerY = this.height / 2;

    // 繪製波形 - 使用 sample 之間的連線
    this.canvasContext.strokeStyle = '#1E88E5';
    this.canvasContext.lineWidth = 1.5;
    this.canvasContext.lineJoin = 'round';
    this.canvasContext.lineCap = 'round';

    // 繪製上半部波形（最大值）
    this.canvasContext.beginPath();
    let hasFirstPoint = false;
    for (let i = start; i < end; i++) {
      const x = (i - start) / visible * this.width;
      const y = centerY - this.sampleMax[i] * centerY * 0.95;
      if (!hasFirstPoint) {
        this.canvasContext.moveTo(x, y);
        hasFirstPoint = true;
      } else {
        this.canvasContext.lineTo(x, y);
      }
    }
    this.canvasContext.stroke();

    // 繪製下半部波形（最小值）
    this.canvasContext.beginPath();
    hasFirstPoint = false;
    for (let i = start; i < end; i++) {
      const x = (i - start) / visible * this.width;
      const y = centerY - this.sampleMin[i] * centerY * 0.95;
      if (!hasFirstPoint) {
        this.canvasContext.moveTo(x, y);
        hasFirstPoint = true;
      } else {
        this.canvasContext.lineTo(x, y);
      }
    }
    this.canvasContext.stroke();

    // 繪製中線
    this.canvasContext.strokeStyle = '#d0d0d0';
    this.canvasContext.lineWidth = 1;
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(0, centerY + 0.5);
    this.canvasContext.lineTo(this.width, centerY + 0.5);
    this.canvasContext.stroke();
  }
  getVisibleSamples() {
    const total = this.sampleCount;
    if (total === 0) return {
      start: 0,
      end: 0,
      visible: 0
    };
    const minVis = this._getMinVisibleSamples(total);
    let visible = Math.max(minVis, Math.round(total / this.zoomFactor));
    if (visible > total) visible = total;
    let start = this.viewStart;
    if (start + visible > total) start = total - visible;
    if (start < 0) start = 0;
    const end = Math.min(total, start + visible);
    return {
      start,
      end,
      visible
    };
  }
  _getMinVisibleSamples(total) {
    // 允許放大到看到每個 sample
    // 最小可見樣本數設為 canvas 寬度的 1/10，這樣每個 sample 可以占據約 10 個像素
    return Math.max(10, Math.floor(this.width / 10));
  }
  _enforceViewBounds() {
    if (this.sampleCount === 0) {
      this.viewStart = 0;
      return;
    }
    const info = this.getVisibleSamples();
    this.viewStart = info.start;

    // 確保 viewStart 在有效範圍內
    if (this.viewStart < 0) {
      this.viewStart = 0;
    }
    const maxStart = Math.max(0, this.sampleCount - info.visible);
    if (this.viewStart > maxStart) {
      this.viewStart = maxStart;
    }
  }
  scrollToLatest() {
    const total = this.sampleCount;
    if (total === 0) return;
    const minVis = this._getMinVisibleSamples(total);
    let visible = Math.max(minVis, Math.round(total / this.zoomFactor));
    if (visible > total) visible = total;
    this.viewStart = total - visible;
    if (this.viewStart < 0) this.viewStart = 0;
  }
  setZoom(targetZoom, anchorSample) {
    if (this.sampleCount === 0) return;
    if (targetZoom < 1) targetZoom = 1;
    const maxZoom = Math.max(1, this.sampleCount / this._getMinVisibleSamples(this.sampleCount));
    if (targetZoom > maxZoom) targetZoom = maxZoom;
    const oldInfo = this.getVisibleSamples();
    this.zoomFactor = targetZoom;
    const newInfo = this.getVisibleSamples();

    // 如果有錨點 sample，保持其視覺位置
    if (typeof anchorSample === 'number' && anchorSample >= 0 && oldInfo.visible > 0) {
      const oldRatio = (anchorSample - oldInfo.start) / oldInfo.visible;
      const desiredStart = anchorSample - oldRatio * newInfo.visible;
      this.viewStart = Math.max(0, Math.min(this.sampleCount - newInfo.visible, Math.floor(desiredStart)));
    } else {
      // 沒有錨點時，保持視圖中心
      const oldCenter = oldInfo.start + oldInfo.visible / 2;
      const desiredStart = oldCenter - newInfo.visible / 2;
      this.viewStart = Math.max(0, Math.min(this.sampleCount - newInfo.visible, Math.floor(desiredStart)));
    }
    this._enforceViewBounds();
    this.draw();

    // 同步更新 OverviewWaveform
    if (this.overviewWaveform) {
      this.overviewWaveform.draw();
    }
  }
  zoomBySteps(stepCount, anchorRatio = 0.5) {
    if (stepCount === 0 || this.sampleCount === 0) return;

    // 增加縮放步進，從 1.2 改為 1.5，讓縮放更快
    const zoomStep = 1.5;
    const oldInfo = this.getVisibleSamples();

    // 確保 oldInfo.visible > 0 才計算錨點
    let anchorSample;
    if (oldInfo.visible > 0) {
      anchorSample = oldInfo.start + anchorRatio * oldInfo.visible;
    } else {
      anchorSample = 0;
    }
    let newZoom = this.zoomFactor;
    if (stepCount > 0) {
      newZoom *= Math.pow(zoomStep, stepCount);
    } else {
      newZoom /= Math.pow(zoomStep, -stepCount);
    }
    this.setZoom(newZoom, anchorSample);
  }
  panBySamples(sampleDelta) {
    if (sampleDelta === 0) return;
    this.isAutoScroll = false;
    this.viewStart += sampleDelta;
    this._enforceViewBounds();
    this.draw();

    // 同步更新 OverviewWaveform
    if (this.overviewWaveform) {
      this.overviewWaveform.draw();
    }
  }
  panByPixels(pixelDelta) {
    if (pixelDelta === 0) return;
    const info = this.getVisibleSamples();
    const samplesPerPixel = info.visible / this.width;
    const totalDelta = pixelDelta * samplesPerPixel + this._panRemainder;
    const intDelta = Math.round(totalDelta);
    this._panRemainder = totalDelta - intDelta;
    this.panBySamples(intDelta);
  }
  resetView() {
    this.zoomFactor = 1;
    this.viewStart = 0;
    this.isAutoScroll = true;
    this._panRemainder = 0;
    this.scrollToLatest();
    this.draw();

    // 同步更新 OverviewWaveform
    if (this.overviewWaveform) {
      this.overviewWaveform.draw();
    }
  }
  setSourceSampleRate(sampleRate) {
    this.sourceSampleRate = sampleRate || 48000;
    this.decimationFactor = Math.max(1, Math.round(this.sourceSampleRate / this.targetSampleRate));
    if (this._worker) {
      this._worker.postMessage({
        type: 'setSampleRate',
        sourceSampleRate: this.sourceSampleRate,
        decimationFactor: this.decimationFactor
      });
    }
  }
  _getSamplePair(index) {
    if (index < 0 || index >= this.sampleCount) {
      return {
        min: 0,
        max: 0
      };
    }
    return {
      min: this.sampleMin[index],
      max: this.sampleMax[index]
    };
  }
  setPlaybackPosition(sampleIndex) {
    this.playbackPosition = sampleIndex;
    this.draw();
  }
  setRawZoomMode(enabled) {
    this.rawZoomMode = !!enabled;
  }
  startPlayback(startSample, sampleRate) {
    this.isPlaying = true;
    this.playbackStartSample = startSample || 0;
    this.playbackStartTime = performance.now ? performance.now() : Date.now();
    this.playbackPosition = this.playbackStartSample;
    const self = this;
    const sr = sampleRate || this.sourceSampleRate;
    function updatePosition() {
      if (!self.isPlaying) return;
      const now = performance.now ? performance.now() : Date.now();
      const elapsed = (now - self.playbackStartTime) / 1000;
      const rawSamples = elapsed * sr;
      const decimatedPos = self.playbackStartSample + Math.floor(rawSamples / self.decimationFactor);
      self.playbackPosition = decimatedPos;
      self.draw();
      requestAnimationFrame(updatePosition);
    }
    requestAnimationFrame(updatePosition);
  }
  stopPlayback() {
    this.isPlaying = false;
    this.playbackPosition = 0;
    this.draw();
  }
  _updatePlaybackPosition() {
    if (!this.isPlaying) return;
    const now = performance.now ? performance.now() : Date.now();
    const elapsed = (now - this.playbackStartTime) / 1000;
    const rawSamples = elapsed * this.sourceSampleRate;
    const decimatedPos = this.playbackStartSample + Math.floor(rawSamples / this.decimationFactor);
    this.playbackPosition = decimatedPos;
  }
}

/* ================================================================
 * OverviewWaveform 類 - 全局波形概覽
 * 顯示整個錄音的波形概覽，並標示當前可視範圍
 * ================================================================ */
class OverviewWaveform {
  constructor(canvas, accumulatedWaveform) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.accumulatedWaveform = accumulatedWaveform;
    this.width = canvas.width;
    this.height = canvas.height;

    // 暫時禁用 Worker 模式，使用主線程繪製
    this._useWorker = false;
    this._workerRef = null;
    this._warnedNoData = false;
    this._lastTotal = 0;

    // 設置滑鼠互動
    this._setupMouseInteraction();

    // 注意：如果要啟用 Worker，需要確保 canvas 尚未獲取 context
    // 且 accumulatedWaveform 已成功轉移其 canvas 控制權
  }

  /**
   * 設置滑鼠互動（點擊跳轉、拖曳可視範圍）
   * @private
   */
  _setupMouseInteraction() {
    if (!this.canvas) return;
    let isDragging = false;
    let dragClickedSample = 0; // 記錄點擊位置對應的絕對樣本位置
    let dragVisibleSamples = 0; // 記錄拖曳開始時的可視範圍大小

    // 滑鼠按下 - 點擊或開始拖曳
    this.canvas.addEventListener('mousedown', e => {
      const acc = this.accumulatedWaveform;
      if (!acc || acc.sampleCount === 0) return;
      isDragging = true;
      e.offsetX;
      acc.viewStart;

      // 記錄拖曳開始時的狀態
      const total = acc.sampleCount;
      const info = acc.getVisibleSamples();
      dragVisibleSamples = info.visible;

      // 計算點擊位置在可視範圍指示器內的偏移
      // 使用與繪製時相同的座標映射邏輯
      const viewStartX = Math.floor(info.start / total * this.width);
      const offsetInView = e.offsetX - viewStartX;
      dragClickedSample = offsetInView; // 記錄在可視範圍內的像素偏移

      this.canvas.style.cursor = 'grabbing';
    });

    // 滑鼠移動 - 拖曳更新
    this.canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const acc = this.accumulatedWaveform;
      if (!acc || acc.sampleCount === 0) return;
      const total = acc.sampleCount;

      // 計算新的可視範圍起始位置（像素）
      // 保持滑鼠在可視範圍內的相對位置不變
      const targetViewStartX = e.offsetX - dragClickedSample;

      // 像素 → 樣本（使用反向映射）
      const newViewStart = Math.floor(targetViewStartX / this.width * total);

      // 確保 viewStart 在有效範圍內
      const maxViewStart = Math.max(0, total - dragVisibleSamples);
      const clampedViewStart = Math.max(0, Math.min(maxViewStart, newViewStart));

      // 更新視圖
      acc.viewStart = clampedViewStart;
      acc.isAutoScroll = false;
      acc._enforceViewBounds();
      acc.draw();

      // 重繪 overview
      this.draw();
    });

    // 滑鼠放開
    this.canvas.addEventListener('mouseup', () => {
      isDragging = false;
      this.canvas.style.cursor = 'pointer';
    });

    // 滑鼠離開
    this.canvas.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        this.canvas.style.cursor = 'pointer';
      }
    });

    // 設置 cursor 樣式
    this.canvas.style.cursor = 'pointer';
  }

  /**
   * 處理點擊/拖曳跳轉
   * @private
   */
  _handleSeek(clickX) {
    const acc = this.accumulatedWaveform;
    if (!acc || acc.sampleCount === 0) return;
    const total = acc.sampleCount;
    const clickRatio = Math.max(0, Math.min(1, clickX / this.width));
    const targetSample = Math.floor(clickRatio * total);

    // 獲取當前縮放級別下的可見樣本數
    // 注意：這裡我們需要在設置 viewStart 之前就知道可見範圍
    const currentZoom = acc.zoomFactor;
    const minVis = acc._getMinVisibleSamples(total);
    let visibleSamples = Math.max(minVis, Math.round(total / currentZoom));
    if (visibleSamples > total) visibleSamples = total;

    // 計算新的 viewStart，讓 targetSample 位於可見範圍的中心
    const halfVisible = Math.floor(visibleSamples / 2);
    let newViewStart = targetSample - halfVisible;

    // 確保 viewStart 在有效範圍內
    const maxViewStart = Math.max(0, total - visibleSamples);
    newViewStart = Math.max(0, Math.min(maxViewStart, newViewStart));
    console.log('🎯 OverviewWaveform 導航:', {
      clickX,
      clickRatio: clickRatio.toFixed(3),
      targetSample,
      total,
      visibleSamples,
      halfVisible,
      newViewStart,
      maxViewStart,
      zoomFactor: currentZoom
    });

    // 更新 accumulated waveform 的視圖位置
    acc.viewStart = newViewStart;
    acc.isAutoScroll = false;
    acc._enforceViewBounds();
    acc.draw();

    // 重繪 overview 以更新可視範圍指示器
    this.draw();

    // 觸發自定義事件
    const event = new CustomEvent('overview-seek', {
      detail: {
        sample: targetSample,
        time: targetSample / acc.sourceSampleRate
      }
    });
    this.canvas.dispatchEvent(event);
  }
  clear() {
    if (this._useWorker && this._workerRef) {
      this._workerRef.postMessage({
        type: 'clearOverview'
      });
      return;
    }
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#f5f5f5';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  draw() {
    if (this._useWorker && this._workerRef) {
      // Worker 會自動同步繪製 overview
      return;
    }

    // 主線程繪製
    this.clear();
    const acc = this.accumulatedWaveform;
    if (!acc || acc.sampleCount === 0) {
      console.log('⚠️ OverviewWaveform: 沒有數據可顯示', {
        hasAcc: !!acc,
        sampleCount: acc ? acc.sampleCount : 0
      });
      return;
    }
    const total = acc.sampleCount;
    const info = acc.getVisibleSamples();
    console.log('📊 OverviewWaveform 繪製:', {
      total,
      visibleStart: info.start,
      visibleEnd: info.end,
      canvasWidth: this.width,
      canvasHeight: this.height
    });

    // 繪製全局波形
    this.ctx.strokeStyle = '#64b5f6';
    this.ctx.lineWidth = 1;
    const samplesPerPixel = total / this.width;
    for (let x = 0; x < this.width; x++) {
      const sampleIndex = Math.floor(x * samplesPerPixel);
      if (sampleIndex >= total) break;
      const sample = acc._getSamplePair(sampleIndex);
      const centerY = this.height / 2;
      const yMin = Math.floor(centerY - sample.max * centerY * 0.9);
      const yMax = Math.floor(centerY - sample.min * centerY * 0.9);

      // 繪製垂直線
      this.ctx.beginPath();
      this.ctx.moveTo(x, yMin);
      this.ctx.lineTo(x, yMax);
      this.ctx.stroke();
    }

    // 繪製中線
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height / 2);
    this.ctx.lineTo(this.width, this.height / 2);
    this.ctx.stroke();

    // 繪製可視範圍指示器
    const viewStartX = Math.floor(info.start / total * this.width);
    const viewEndX = Math.floor(info.end / total * this.width);
    const viewWidth = Math.max(2, viewEndX - viewStartX);

    // 半透明覆蓋
    this.ctx.fillStyle = 'rgba(33, 150, 243, 0.15)';
    this.ctx.fillRect(viewStartX, 0, viewWidth, this.height);

    // 邊框
    this.ctx.strokeStyle = '#2196F3';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(viewStartX, 0, viewWidth, this.height);
    console.log('✅ OverviewWaveform 繪製完成');
  }
}

/**
 * VoiceBankRecorderUI.js
 * 完整的錄音器 UI 組件 - 包含所有界面元素和交互邏輯
 * 
 * @module VoiceBankRecorderUI
 * @description 提供開箱即用的錄音器界面，包含：
 * - 自動生成 UI (HTML + CSS)
 * - 錄音控制按鈕
 * - 波形顯示 (即時、累積、概覽、VU Meter)
 * - 裝置管理 (麥克風、輸出裝置)
 * - 音訊處理選項 (增益、AGC、回音消除、降噪)
 * - 播放控制
 * - 狀態日誌
 */


/**
 * VoiceBankRecorderUI - 完整的錄音器 UI 組件
 */
class VoiceBankRecorderUI {
  /**
   * @param {Object} options - 配置選項
   * @param {HTMLElement|string} options.container - 容器元素或選擇器
   * @param {Object} [options.theme] - 主題配置
   * @param {boolean} [options.showAdvancedOptions=true] - 是否顯示進階選項
   * @param {boolean} [options.showStatusLog=true] - 是否顯示狀態日誌
   * @param {Object} [options.audioConfig] - AudioEngine 配置
   * @param {Object} [options.waveformConfig] - WaveformRenderer 配置
   */
  constructor(options = {}) {
    this.options = {
      showAdvancedOptions: true,
      showStatusLog: true,
      theme: {
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        successColor: '#10b981',
        errorColor: '#ef4444',
        warningColor: '#f59e0b'
      },
      ...options
    };

    // 獲取容器
    if (typeof options.container === 'string') {
      this.container = document.querySelector(options.container);
    } else {
      this.container = options.container;
    }
    if (!this.container) {
      throw new Error('Container element not found');
    }

    // 核心組件
    this.audioEngine = null;
    this.waveformRenderer = null;
    this.deviceManager = null;

    // UI 元素引用
    this.elements = {};

    // 播放器
    this.audioPlayer = null;
    this.recordedBlob = null;
    this.recordedUrl = null;

    // 初始化狀態
    this.isInitialized = false;
  }

  /**
   * 初始化 UI - 生成 HTML 和綁定事件
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('VoiceBankRecorderUI already initialized');
      return;
    }

    // 生成 UI
    this._generateHTML();
    this._injectStyles();
    this._cacheElements();

    // 初始化音訊引擎
    await this._initializeAudioEngine();

    // 初始化波形渲染器
    await this._initializeWaveformRenderer();

    // 綁定事件
    this._bindEvents();

    // 初始化裝置列表
    await this._initializeDevices();
    this.isInitialized = true;
    this._log('✓ VoiceBank Recorder UI 初始化完成', 'success');
  }

  /**
   * 生成 HTML 結構
   * @private
   */
  _generateHTML() {
    this.container.innerHTML = `
            <div class="voicebank-recorder-ui">
                <!-- 錄音控制按鈕 -->
                <div class="vbr-controls">
                    <button class="vbr-btn vbr-btn-record" data-action="record">
                        <span class="vbr-icon">🎙️</span>
                        <span class="vbr-text">開始錄音</span>
                    </button>
                    <button class="vbr-btn vbr-btn-stop" data-action="stop" disabled>
                        <span class="vbr-icon">⏹️</span>
                        <span class="vbr-text">停止錄音</span>
                    </button>
                </div>
                
                <!-- 波形顯示區 -->
                <div class="vbr-waveforms">
                    <!-- 即時波形 -->
                    <div class="vbr-waveform-section">
                        <h3 class="vbr-section-title">即時波形</h3>
                        <canvas class="vbr-canvas" data-canvas="live" width="800" height="120"></canvas>
                    </div>
                    
                    <!-- VU Meter -->
                    <div class="vbr-waveform-section">
                        <h3 class="vbr-section-title">音量表 (VU Meter)</h3>
                        <canvas class="vbr-canvas" data-canvas="vu" width="800" height="50"></canvas>
                    </div>
                    
                    <!-- 累積波形 -->
                    <div class="vbr-waveform-section">
                        <h3 class="vbr-section-title">累積波形（可拖曳平移、滾輪縮放、點擊定位）</h3>
                        <canvas class="vbr-canvas" data-canvas="accumulated" width="800" height="200"></canvas>
                        <div class="vbr-toolbar">
                            <button class="vbr-toolbar-btn" data-action="zoom-in" disabled>
                                <span>🔍+</span>
                            </button>
                            <button class="vbr-toolbar-btn" data-action="zoom-out" disabled>
                                <span>🔍-</span>
                            </button>
                            <button class="vbr-toolbar-btn" data-action="zoom-reset" disabled>
                                <span>🔄 重置視圖</span>
                            </button>
                            <button class="vbr-toolbar-btn" data-action="pan-left" disabled>
                                <span>◀ 向左</span>
                            </button>
                            <button class="vbr-toolbar-btn" data-action="pan-right" disabled>
                                <span>向右 ▶</span>
                            </button>
                            <label class="vbr-checkbox-label">
                                <input type="checkbox" data-check="auto-scroll" checked>
                                <span>自動捲動</span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- 概覽波形 -->
                    <div class="vbr-waveform-section">
                        <h3 class="vbr-section-title">概覽波形（點擊或拖曳可快速導航）</h3>
                        <canvas class="vbr-canvas" data-canvas="overview" width="800" height="80"></canvas>
                    </div>
                </div>
                
                <!-- 設定區 -->
                <div class="vbr-settings">
                    <!-- 裝置設定 -->
                    <div class="vbr-settings-section">
                        <h3 class="vbr-settings-title">裝置設定</h3>
                        <div class="vbr-device-row">
                            <label class="vbr-label">麥克風：</label>
                            <div class="vbr-device-select-group">
                                <select class="vbr-select" data-select="microphone" disabled>
                                    <option>載入中...</option>
                                </select>
                                <button class="vbr-refresh-btn" data-action="refresh-mic" title="重新整理麥克風清單">🔄</button>
                            </div>
                            <small class="vbr-hint" data-hint="microphone">選擇要使用的麥克風裝置</small>
                        </div>
                        <div class="vbr-device-row">
                            <label class="vbr-label">輸出裝置：</label>
                            <div class="vbr-device-select-group">
                                <select class="vbr-select" data-select="output" disabled>
                                    <option value="default">系統預設輸出</option>
                                </select>
                                <button class="vbr-refresh-btn" data-action="refresh-output" title="重新整理輸出裝置清單">🔄</button>
                            </div>
                            <small class="vbr-hint" data-hint="output">部分瀏覽器需 HTTPS 才可切換輸出裝置</small>
                        </div>
                    </div>
                    
                    <!-- 進階選項 -->
                    ${this.options.showAdvancedOptions ? `
                    <div class="vbr-settings-section">
                        <h3 class="vbr-settings-title">進階選項</h3>
                        <div class="vbr-slider-row">
                            <label class="vbr-label">麥克風增益：</label>
                            <input type="range" class="vbr-slider" data-slider="gain" min="1" max="6" step="0.1" value="1.0">
                            <span class="vbr-slider-value" data-value="gain">1.0x</span>
                        </div>
                        <div class="vbr-checkbox-row">
                            <label class="vbr-checkbox-label">
                                <input type="checkbox" data-check="agc">
                                <span>自動增益控制 (AGC)</span>
                            </label>
                            <label class="vbr-checkbox-label">
                                <input type="checkbox" data-check="echo-cancel">
                                <span>回音消除</span>
                            </label>
                            <label class="vbr-checkbox-label">
                                <input type="checkbox" data-check="noise-suppress">
                                <span>背景降噪</span>
                            </label>
                        </div>
                    </div>
                    ` : ''}
                    
                    <!-- 錄音資訊 -->
                    <div class="vbr-info-section" data-section="recording-info" style="display: none;">
                        <h3 class="vbr-settings-title">錄音資訊</h3>
                        <div class="vbr-info-grid">
                            <div>時長：<span data-info="duration">00:00.000</span></div>
                            <div>樣本數：<span data-info="samples">0</span></div>
                            <div>採樣率：<span data-info="samplerate">48000</span> Hz</div>
                            <div>檔案大小：<span data-info="filesize">0</span> KB</div>
                        </div>
                    </div>
                </div>
                
                <!-- 播放控制 -->
                <div class="vbr-playback">
                    <button class="vbr-btn vbr-btn-play" data-action="play" disabled>
                        <span class="vbr-icon">▶</span>
                        <span class="vbr-text">播放</span>
                    </button>
                    <button class="vbr-btn vbr-btn-pause" data-action="pause" disabled>
                        <span class="vbr-icon">⏸</span>
                        <span class="vbr-text">暫停</span>
                    </button>
                    <button class="vbr-btn vbr-btn-download" data-action="download" disabled>
                        <span class="vbr-icon">💾</span>
                        <span class="vbr-text">下載錄音</span>
                    </button>
                </div>
                
                <!-- 狀態日誌 -->
                ${this.options.showStatusLog ? `
                <div class="vbr-status-log" data-log="status">
                    <div class="vbr-log-entry">
                        <span class="vbr-log-time">[${this._getTimeString()}]</span>
                        <span class="vbr-log-text">準備就緒</span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
  }

  /**
   * 注入 CSS 樣式
   * @private
   */
  _injectStyles() {
    const styleId = 'voicebank-recorder-ui-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = this._getStyles();
    document.head.appendChild(style);
  }

  /**
   * 獲取 CSS 樣式
   * @private
   * @returns {string}
   */
  _getStyles() {
    const theme = this.options.theme;
    return `
            .voicebank-recorder-ui {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 900px;
                margin: 0 auto;
            }
            
            /* 錄音控制按鈕 */
            .vbr-controls {
                display: flex;
                gap: 15px;
                justify-content: center;
                margin-bottom: 30px;
                padding: 20px;
                background: #f9fafb;
                border-radius: 10px;
            }
            
            .vbr-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 16px;
                padding: 12px 30px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            
            .vbr-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .vbr-btn-record {
                background: ${theme.errorColor};
                color: white;
            }
            
            .vbr-btn-record:hover:not(:disabled) {
                background: #dc2626;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }
            
            .vbr-btn-stop {
                background: #9ca3af;
                color: white;
            }
            
            .vbr-btn-stop:hover:not(:disabled) {
                background: #6b7280;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(156, 163, 175, 0.3);
            }
            
            .vbr-btn-play {
                background: ${theme.primaryColor};
                color: white;
            }
            
            .vbr-btn-play:hover:not(:disabled) {
                background: #5568d3;
                transform: translateY(-2px);
            }
            
            .vbr-btn-pause {
                background: ${theme.warningColor};
                color: white;
            }
            
            .vbr-btn-pause:hover:not(:disabled) {
                background: #d97706;
                transform: translateY(-2px);
            }
            
            .vbr-btn-download {
                background: ${theme.primaryColor};
                color: white;
            }
            
            .vbr-btn-download:hover:not(:disabled) {
                background: #5568d3;
                transform: translateY(-2px);
            }
            
            /* 波形區域 */
            .vbr-waveforms {
                margin-bottom: 30px;
            }
            
            .vbr-waveform-section {
                margin-bottom: 20px;
            }
            
            .vbr-section-title {
                font-size: 14px;
                font-weight: 600;
                color: #555;
                margin-bottom: 8px;
            }
            
            .vbr-canvas {
                display: block;
                width: 100%;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                background: #f9fafb;
            }
            
            .vbr-toolbar {
                display: flex;
                gap: 10px;
                margin-top: 10px;
                flex-wrap: wrap;
                align-items: center;
            }
            
            .vbr-toolbar-btn {
                padding: 8px 16px;
                border: 1px solid #d0d0d0;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                color: #555;
                transition: all 0.2s ease;
            }
            
            .vbr-toolbar-btn:hover:not(:disabled) {
                border-color: ${theme.primaryColor};
                color: ${theme.primaryColor};
                background: #f0f4ff;
            }
            
            .vbr-toolbar-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            
            .vbr-checkbox-label {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 13px;
                color: #555;
                cursor: pointer;
            }
            
            /* 設定區域 */
            .vbr-settings {
                margin-bottom: 30px;
            }
            
            .vbr-settings-section {
                background: #f9fafb;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 20px;
            }
            
            .vbr-settings-title {
                font-size: 16px;
                font-weight: 600;
                color: ${theme.primaryColor};
                margin-bottom: 15px;
            }
            
            .vbr-device-row {
                margin-bottom: 15px;
            }
            
            .vbr-label {
                display: block;
                font-size: 14px;
                font-weight: 500;
                color: #555;
                margin-bottom: 5px;
            }
            
            .vbr-device-select-group {
                display: flex;
                gap: 10px;
            }
            
            .vbr-select {
                flex: 1;
                padding: 8px;
                border: 1px solid #d0d0d0;
                border-radius: 6px;
                font-size: 14px;
            }
            
            .vbr-refresh-btn {
                padding: 8px 12px;
                background: ${theme.primaryColor};
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            }
            
            .vbr-hint {
                display: block;
                color: #666;
                font-size: 12px;
                margin-top: 5px;
            }
            
            .vbr-slider-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .vbr-slider {
                flex: 1;
            }
            
            .vbr-slider-value {
                min-width: 50px;
                font-weight: 600;
            }
            
            .vbr-checkbox-row {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
            }
            
            .vbr-info-section {
                background: #f0f4ff;
                padding: 20px;
                border-radius: 10px;
                border-left: 4px solid ${theme.primaryColor};
            }
            
            .vbr-info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 10px;
                font-size: 14px;
            }
            
            .vbr-info-grid span {
                font-weight: 600;
                color: ${theme.primaryColor};
            }
            
            /* 播放控制 */
            .vbr-playback {
                display: flex;
                gap: 15px;
                justify-content: center;
                margin-bottom: 30px;
            }
            
            /* 狀態日誌 */
            .vbr-status-log {
                background: #1f2937;
                color: ${theme.successColor};
                padding: 20px;
                border-radius: 10px;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.8;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .vbr-log-entry {
                margin-bottom: 5px;
            }
            
            .vbr-log-time {
                color: #6b7280;
                margin-right: 10px;
            }
            
            .vbr-log-error {
                color: ${theme.errorColor};
            }
            
            .vbr-log-warning {
                color: ${theme.warningColor};
            }
            
            .vbr-log-success {
                color: ${theme.successColor};
            }
        `;
  }

  /**
   * 快取 DOM 元素引用
   * @private
   */
  _cacheElements() {
    const root = this.container.querySelector('.voicebank-recorder-ui');

    // 按鈕
    this.elements.recordBtn = root.querySelector('[data-action="record"]');
    this.elements.stopBtn = root.querySelector('[data-action="stop"]');
    this.elements.playBtn = root.querySelector('[data-action="play"]');
    this.elements.pauseBtn = root.querySelector('[data-action="pause"]');
    this.elements.downloadBtn = root.querySelector('[data-action="download"]');

    // 波形工具列按鈕
    this.elements.zoomInBtn = root.querySelector('[data-action="zoom-in"]');
    this.elements.zoomOutBtn = root.querySelector('[data-action="zoom-out"]');
    this.elements.zoomResetBtn = root.querySelector('[data-action="zoom-reset"]');
    this.elements.panLeftBtn = root.querySelector('[data-action="pan-left"]');
    this.elements.panRightBtn = root.querySelector('[data-action="pan-right"]');
    this.elements.autoScrollCheck = root.querySelector('[data-check="auto-scroll"]');

    // Canvas
    this.elements.liveCanvas = root.querySelector('[data-canvas="live"]');
    this.elements.vuCanvas = root.querySelector('[data-canvas="vu"]');
    this.elements.accumulatedCanvas = root.querySelector('[data-canvas="accumulated"]');
    this.elements.overviewCanvas = root.querySelector('[data-canvas="overview"]');

    // 裝置選擇
    this.elements.micSelect = root.querySelector('[data-select="microphone"]');
    this.elements.outputSelect = root.querySelector('[data-select="output"]');
    this.elements.refreshMicBtn = root.querySelector('[data-action="refresh-mic"]');
    this.elements.refreshOutputBtn = root.querySelector('[data-action="refresh-output"]');

    // 進階選項
    if (this.options.showAdvancedOptions) {
      this.elements.gainSlider = root.querySelector('[data-slider="gain"]');
      this.elements.gainValue = root.querySelector('[data-value="gain"]');
      this.elements.agcCheck = root.querySelector('[data-check="agc"]');
      this.elements.echoCancelCheck = root.querySelector('[data-check="echo-cancel"]');
      this.elements.noiseSuppressCheck = root.querySelector('[data-check="noise-suppress"]');
    }

    // 錄音資訊
    this.elements.recordingInfo = root.querySelector('[data-section="recording-info"]');
    this.elements.durationInfo = root.querySelector('[data-info="duration"]');
    this.elements.samplesInfo = root.querySelector('[data-info="samples"]');
    this.elements.samplerateInfo = root.querySelector('[data-info="samplerate"]');
    this.elements.filesizeInfo = root.querySelector('[data-info="filesize"]');

    // 狀態日誌
    if (this.options.showStatusLog) {
      this.elements.statusLog = root.querySelector('[data-log="status"]');
    }
  }

  /**
   * 初始化音訊引擎
   * @private
   */
  async _initializeAudioEngine() {
    const audioConfig = {
      sampleRate: 48000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      autoManageDevices: true,
      ...this.options.audioConfig
    };
    this.audioEngine = new AudioEngine(audioConfig);
    await this.audioEngine.initialize();
    this.deviceManager = this.audioEngine.deviceManager;
    this._log('音訊引擎初始化完成', 'info');
  }

  /**
   * 初始化波形渲染器
   * @private
   */
  async _initializeWaveformRenderer() {
    const waveformConfig = {
      liveCanvas: this.elements.liveCanvas,
      vuMeterCanvas: this.elements.vuCanvas,
      accumulatedCanvas: this.elements.accumulatedCanvas,
      overviewCanvas: this.elements.overviewCanvas,
      audioEngine: this.audioEngine,
      useWorker: false,
      showClipMarks: true,
      ...this.options.waveformConfig
    };
    this.waveformRenderer = new WaveformRenderer(waveformConfig);
    await this.waveformRenderer.initialize();
    this._log('波形渲染器初始化完成', 'info');
  }

  /**
   * 綁定所有事件
   * @private
   */
  _bindEvents() {
    // 錄音控制
    this.elements.recordBtn.addEventListener('click', () => this._handleRecord());
    this.elements.stopBtn.addEventListener('click', () => this._handleStop());

    // 播放控制
    this.elements.playBtn.addEventListener('click', () => this._handlePlay());
    this.elements.pauseBtn.addEventListener('click', () => this._handlePause());
    this.elements.downloadBtn.addEventListener('click', () => this._handleDownload());

    // 波形工具列
    this.elements.zoomInBtn.addEventListener('click', () => this._handleZoomIn());
    this.elements.zoomOutBtn.addEventListener('click', () => this._handleZoomOut());
    this.elements.zoomResetBtn.addEventListener('click', () => this._handleZoomReset());
    this.elements.panLeftBtn.addEventListener('click', () => this._handlePanLeft());
    this.elements.panRightBtn.addEventListener('click', () => this._handlePanRight());
    this.elements.autoScrollCheck.addEventListener('change', e => this._handleAutoScrollChange(e));

    // 裝置選擇
    this.elements.micSelect.addEventListener('change', e => this._handleMicChange(e));
    this.elements.outputSelect.addEventListener('change', e => this._handleOutputChange(e));
    this.elements.refreshMicBtn.addEventListener('click', () => this._refreshMicrophones());
    this.elements.refreshOutputBtn.addEventListener('click', () => this._refreshOutputDevices());

    // 進階選項
    if (this.options.showAdvancedOptions) {
      this.elements.gainSlider.addEventListener('input', e => this._handleGainChange(e));
      this.elements.agcCheck.addEventListener('change', e => this._handleAGCChange(e));
      this.elements.echoCancelCheck.addEventListener('change', e => this._handleEchoCancelChange(e));
      this.elements.noiseSuppressCheck.addEventListener('change', e => this._handleNoiseSuppressChange(e));
    }
  }

  /**
   * 初始化裝置列表
   * @private
   */
  async _initializeDevices() {
    if (!this.deviceManager) {
      this._log('❌ DeviceManager 尚未初始化', 'error');
      return;
    }
    await this._refreshMicrophones();
    await this._refreshOutputDevices();
  }

  /**
   * 重新整理麥克風列表
   * @private
   */
  async _refreshMicrophones() {
    if (!this.deviceManager) {
      this._log('❌ DeviceManager 尚未初始化', 'error');
      this.elements.micSelect.innerHTML = '<option>初始化失敗</option>';
      this.elements.micSelect.disabled = true;
      return;
    }
    try {
      this._log('🔍 正在列舉麥克風裝置...', 'info');
      const microphones = await this.deviceManager.enumerateMicrophones();
      this.elements.micSelect.innerHTML = '';
      if (microphones.length === 0) {
        this.elements.micSelect.innerHTML = '<option>未偵測到麥克風</option>';
        this.elements.micSelect.disabled = true;
        this._log('⚠️ 未偵測到麥克風裝置', 'warning');
        return;
      }
      microphones.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `麥克風 ${index + 1}`;
        this.elements.micSelect.appendChild(option);
      });

      // 恢復上次選擇
      const savedId = this.deviceManager.getSelectedMicrophoneId();
      if (savedId && this.deviceManager.isDeviceAvailable(savedId, 'microphone')) {
        this.elements.micSelect.value = savedId;
      } else if (microphones.length > 0) {
        this.deviceManager.selectMicrophone(microphones[0].deviceId, true);
        this.elements.micSelect.value = microphones[0].deviceId;
      }
      this.elements.micSelect.disabled = false;
      this._log(`✅ 找到 ${microphones.length} 個麥克風裝置`, 'success');
    } catch (error) {
      this._log(`❌ 列舉麥克風失敗: ${error.message}`, 'error');
      console.error('列舉麥克風詳細錯誤:', error);
      this.elements.micSelect.innerHTML = '<option>需要麥克風權限</option>';
      this.elements.micSelect.disabled = true;
    }
  }

  /**
   * 重新整理輸出裝置列表
   * @private
   */
  async _refreshOutputDevices() {
    if (!this.deviceManager) {
      this._log('❌ DeviceManager 尚未初始化', 'error');
      this.elements.outputSelect.innerHTML = '<option value="default">系統預設輸出</option>';
      this.elements.outputSelect.disabled = true;
      return;
    }
    if (!this.deviceManager.isSupported()) {
      this.elements.outputSelect.innerHTML = '<option value="default">系統預設輸出</option>';
      this.elements.outputSelect.disabled = true;
      this._log('ℹ️ 此瀏覽器不支援輸出裝置切換', 'info');
      return;
    }
    try {
      this._log('🔍 正在列舉輸出裝置...', 'info');
      const outputs = await this.deviceManager.enumerateOutputDevices();
      this.elements.outputSelect.innerHTML = '<option value="default">系統預設輸出</option>';
      if (outputs.length === 0) {
        this.elements.outputSelect.disabled = true;
        this._log('ℹ️ 未偵測到輸出裝置', 'info');
        return;
      }
      this.elements.outputSelect.disabled = false;
      outputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `揚聲器 ${index + 1}`;
        this.elements.outputSelect.appendChild(option);
      });

      // 恢復上次選擇
      const savedId = this.deviceManager.getSelectedOutputDeviceId();
      if (savedId && savedId !== 'default') {
        this.elements.outputSelect.value = savedId;
      }
      this._log(`✅ 找到 ${outputs.length} 個輸出裝置`, 'success');
    } catch (error) {
      this._log(`❌ 列舉輸出裝置失敗: ${error.message}`, 'error');
      console.error('列舉輸出裝置詳細錯誤:', error);
    }
  }

  /**
   * 處理錄音按鈕點擊
   * @private
   */
  async _handleRecord() {
    try {
      this._log('開始錄音...', 'info');
      await this.audioEngine.startRecording();
      this.elements.recordBtn.disabled = true;
      this.elements.stopBtn.disabled = false;

      // 停用波形工具列
      this.elements.zoomInBtn.disabled = true;
      this.elements.zoomOutBtn.disabled = true;
      this.elements.zoomResetBtn.disabled = true;
      this.elements.panLeftBtn.disabled = true;
      this.elements.panRightBtn.disabled = true;
      this._log('✓ 錄音已開始', 'success');
    } catch (error) {
      this._log(`❌ 錄音失敗: ${error.message}`, 'error');
      console.error('Recording Error:', error);
    }
  }

  /**
   * 處理停止按鈕點擊
   * @private
   */
  async _handleStop() {
    try {
      this._log('停止錄音...', 'info');
      const blob = await this.audioEngine.stopRecording();
      this.elements.recordBtn.disabled = false;
      this.elements.stopBtn.disabled = true;
      this.elements.playBtn.disabled = false;
      this.elements.downloadBtn.disabled = false;

      // 啟用波形工具列
      this.elements.zoomInBtn.disabled = false;
      this.elements.zoomOutBtn.disabled = false;
      this.elements.zoomResetBtn.disabled = false;
      this.elements.panLeftBtn.disabled = false;
      this.elements.panRightBtn.disabled = false;
      this._log(`✓ 錄音已停止 - ${(blob.size / 1024).toFixed(2)} KB`, 'success');

      // 更新錄音資訊
      this._updateRecordingInfo(blob);

      // 清理舊的音訊資源
      if (this.audioPlayer) {
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.audioPlayer = null;
      }
      if (this.recordedUrl) {
        URL.revokeObjectURL(this.recordedUrl);
      }

      // 保存新的 blob
      this.recordedBlob = blob;
      this.recordedUrl = URL.createObjectURL(blob);
    } catch (error) {
      this._log(`❌ 停止失敗: ${error.message}`, 'error');
      console.error('Stop Error:', error);
    }
  }

  /**
   * 處理播放按鈕點擊
   * @private
   */
  async _handlePlay() {
    try {
      if (!this.recordedUrl) {
        this._log('❌ 沒有可播放的錄音', 'error');
        return;
      }
      this._log('播放錄音...', 'info');

      // 每次播放都重新創建音訊播放器
      if (this.audioPlayer) {
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.audioPlayer = null;
      }
      this.audioPlayer = new Audio(this.recordedUrl);
      this.audioPlayer.addEventListener('ended', () => {
        this.elements.playBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this._log('✓ 播放完成', 'info');
      });

      // 設置輸出裝置
      if (this.deviceManager) {
        try {
          await this.deviceManager.setAudioOutputDevice(this.audioPlayer);
        } catch (err) {
          console.warn('設置輸出裝置失敗:', err);
        }
      }
      await this.audioPlayer.play();
      this.elements.playBtn.disabled = true;
      this.elements.pauseBtn.disabled = false;
      this._log('✓ 播放中', 'info');
    } catch (error) {
      this._log(`❌ 播放失敗: ${error.message}`, 'error');
      console.error('Play Error:', error);
    }
  }

  /**
   * 處理暫停按鈕點擊
   * @private
   */
  _handlePause() {
    try {
      if (!this.audioPlayer) {
        this._log('❌ 沒有正在播放的音訊', 'error');
        return;
      }
      this._log('暫停播放...', 'info');
      this.audioPlayer.pause();
      this.elements.playBtn.disabled = false;
      this.elements.pauseBtn.disabled = true;
      this._log('✓ 已暫停', 'info');
    } catch (error) {
      this._log(`❌ 暫停失敗: ${error.message}`, 'error');
      console.error('Pause Error:', error);
    }
  }

  /**
   * 處理下載按鈕點擊
   * @private
   */
  _handleDownload() {
    try {
      if (!this.recordedBlob) {
        this._log('❌ 沒有可下載的錄音', 'error');
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `voicebank-recording-${timestamp}.wav`;
      const a = document.createElement('a');
      a.href = this.recordedUrl;
      a.download = filename;
      a.click();
      this._log(`💾 已下載: ${filename}`, 'success');
    } catch (error) {
      this._log(`❌ 下載失敗: ${error.message}`, 'error');
      console.error('Download Error:', error);
    }
  }

  /**
   * 處理放大按鈕點擊
   * @private
   */
  _handleZoomIn() {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      this.waveformRenderer.accumulatedWaveform.zoomBySteps(1, 0.5);
      this._log('🔍 放大波形', 'info');
    }
  }

  /**
   * 處理縮小按鈕點擊
   * @private
   */
  _handleZoomOut() {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      this.waveformRenderer.accumulatedWaveform.zoomBySteps(-1, 0.5);
      this._log('🔍 縮小波形', 'info');
    }
  }

  /**
   * 處理重置視圖按鈕點擊
   * @private
   */
  _handleZoomReset() {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      this.waveformRenderer.accumulatedWaveform.setZoom(1);
      this.waveformRenderer.accumulatedWaveform.isAutoScroll = true;
      this.elements.autoScrollCheck.checked = true;
      this._log('🔄 重置視圖', 'info');
    }
  }

  /**
   * 處理向左平移按鈕點擊
   * @private
   */
  _handlePanLeft() {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      const info = this.waveformRenderer.accumulatedWaveform.getVisibleSamples();
      this.waveformRenderer.accumulatedWaveform.panBySamples(-Math.floor(info.visible * 0.2));
      this._log('◀ 向左移動', 'info');
    }
  }

  /**
   * 處理向右平移按鈕點擊
   * @private
   */
  _handlePanRight() {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      const info = this.waveformRenderer.accumulatedWaveform.getVisibleSamples();
      this.waveformRenderer.accumulatedWaveform.panBySamples(Math.floor(info.visible * 0.2));
      this._log('▶ 向右移動', 'info');
    }
  }

  /**
   * 處理自動捲動開關改變
   * @private
   */
  _handleAutoScrollChange(e) {
    if (this.waveformRenderer && this.waveformRenderer.accumulatedWaveform) {
      this.waveformRenderer.accumulatedWaveform.isAutoScroll = e.target.checked;
      this._log(e.target.checked ? '✓ 啟用自動捲動' : '✗ 停用自動捲動', 'info');
    }
  }

  /**
   * 處理麥克風選擇改變
   * @private
   */
  _handleMicChange(e) {
    const deviceId = e.target.value;
    const deviceLabel = e.target.options[e.target.selectedIndex].text;
    this.deviceManager.selectMicrophone(deviceId, true);
    this._log(`🎤 已選擇麥克風: ${deviceLabel}`, 'info');
  }

  /**
   * 處理輸出裝置選擇改變
   * @private
   */
  _handleOutputChange(e) {
    const deviceId = e.target.value;
    const deviceLabel = e.target.options[e.target.selectedIndex].text;
    this.deviceManager.selectOutputDevice(deviceId, true);
    this._log(`🔊 已選擇輸出裝置: ${deviceLabel}`, 'info');
  }

  /**
   * 處理麥克風增益改變
   * @private
   */
  _handleGainChange(e) {
    const gain = parseFloat(e.target.value);
    this.elements.gainValue.textContent = gain.toFixed(1) + 'x';
    if (this.audioEngine && this.audioEngine.setMicGain) {
      this.audioEngine.setMicGain(gain);
      this._log(`🎚️ 增益調整為 ${gain.toFixed(1)}x`, 'info');
    }
  }

  /**
   * 處理 AGC 開關改變
   * @private
   */
  _handleAGCChange(e) {
    this._log(`AGC ${e.target.checked ? '已啟用' : '已停用'}（將在下次錄音時生效）`, 'info');
    // Note: 需要重新開始錄音才會生效
  }

  /**
   * 處理回音消除開關改變
   * @private
   */
  _handleEchoCancelChange(e) {
    this._log(`回音消除 ${e.target.checked ? '已啟用' : '已停用'}（將在下次錄音時生效）`, 'info');
    // Note: 需要重新開始錄音才會生效
  }

  /**
   * 處理背景降噪開關改變
   * @private
   */
  _handleNoiseSuppressChange(e) {
    this._log(`背景降噪 ${e.target.checked ? '已啟用' : '已停用'}（將在下次錄音時生效）`, 'info');
    // Note: 需要重新開始錄音才會生效
  }

  /**
   * 更新錄音資訊
   * @private
   */
  _updateRecordingInfo(blob) {
    const duration = (this.audioEngine.recordStopTime - this.audioEngine.recordStartTime) / 1000;
    const samples = this.audioEngine.pcmTotalSamples || 0;
    const sampleRate = this.audioEngine.audioContext.sampleRate;
    this.elements.durationInfo.textContent = this._formatDuration(duration);
    this.elements.samplesInfo.textContent = samples.toLocaleString();
    this.elements.samplerateInfo.textContent = sampleRate.toLocaleString();
    this.elements.filesizeInfo.textContent = (blob.size / 1024).toFixed(2);
    this.elements.recordingInfo.style.display = 'block';
  }

  /**
   * 格式化時長
   * @private
   */
  _formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor(seconds % 1 * 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  /**
   * 獲取當前時間字串
   * @private
   */
  _getTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }

  /**
   * 記錄日誌
   * @private
   */
  _log(message, type = 'info') {
    if (!this.options.showStatusLog || !this.elements.statusLog) return;
    const entry = document.createElement('div');
    entry.className = 'vbr-log-entry';
    const time = document.createElement('span');
    time.className = 'vbr-log-time';
    time.textContent = `[${this._getTimeString()}]`;
    const text = document.createElement('span');
    text.className = `vbr-log-text vbr-log-${type}`;
    text.textContent = message;
    entry.appendChild(time);
    entry.appendChild(text);
    this.elements.statusLog.appendChild(entry);
    this.elements.statusLog.scrollTop = this.elements.statusLog.scrollHeight;
  }

  /**
   * 銷毀 UI 和所有資源
   */
  destroy() {
    // 停止錄音
    if (this.audioEngine && this.audioEngine.isRecording) {
      this.audioEngine.stopRecording();
    }

    // 停止播放
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = '';
      this.audioPlayer = null;
    }

    // 釋放 blob URL
    if (this.recordedUrl) {
      URL.revokeObjectURL(this.recordedUrl);
      this.recordedUrl = null;
    }

    // 銷毀波形渲染器
    if (this.waveformRenderer) {
      this.waveformRenderer.destroy();
      this.waveformRenderer = null;
    }

    // 銷毀音訊引擎
    if (this.audioEngine) {
      this.audioEngine.destroy();
      this.audioEngine = null;
    }

    // 清空 UI
    this.container.innerHTML = '';
    this.isInitialized = false;
    this._log('VoiceBank Recorder UI 已銷毀', 'info');
  }
}

/**
 * StorageAdapter - 儲存適配器基類
 * 定義統一的儲存介面，支援多種儲存後端
 */

class StorageAdapter {
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob 物件
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據（可選）
   * @returns {Promise<string>} 檔案 ID 或 URL
   */
  async save(blob, filename, metadata = {}) {
    throw new Error('save() must be implemented by subclass');
  }

  /**
   * 載入音訊檔案
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<Blob>} 音訊 Blob 物件
   */
  async load(id) {
    throw new Error('load() must be implemented by subclass');
  }

  /**
   * 刪除音訊檔案
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<boolean>} 是否成功刪除
   */
  async delete(id) {
    throw new Error('delete() must be implemented by subclass');
  }

  /**
   * 列出所有檔案
   * @returns {Promise<Array>} 檔案列表
   */
  async list() {
    throw new Error('list() must be implemented by subclass');
  }

  /**
   * 檢查檔案是否存在
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    try {
      await this.load(id);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 清空所有檔案（謹慎使用）
   * @returns {Promise<number>} 刪除的檔案數量
   */
  async clear() {
    const files = await this.list();
    let count = 0;
    for (const file of files) {
      try {
        await this.delete(file.id || file.filename);
        count++;
      } catch (error) {
        console.error('Failed to delete file:', file, error);
      }
    }
    return count;
  }
}

/**
 * IndexedDBAdapter - IndexedDB 儲存實現
 * 用於瀏覽器端本地儲存，無需伺服器
 */

class IndexedDBAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} dbName - 資料庫名稱
   * @param {string} storeName - 儲存區名稱
   * @param {number} version - 資料庫版本
   */
  constructor(dbName = 'VoiceBankDB', storeName = 'recordings', version = 1) {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
  }

  /**
   * 初始化資料庫
   * @returns {Promise<IDBDatabase>}
   */
  async initialize() {
    if (this.db) {
      return this.db;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = event => {
        const db = event.target.result;

        // 創建物件儲存區（如果不存在）
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true
          });

          // 創建索引
          store.createIndex('filename', 'filename', {
            unique: false
          });
          store.createIndex('timestamp', 'timestamp', {
            unique: false
          });
          store.createIndex('duration', 'duration', {
            unique: false
          });
        }
      };
    });
  }

  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案 ID
   */
  async save(blob, filename, metadata = {}) {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const record = {
        filename: filename,
        blob: blob,
        size: blob.size,
        type: blob.type,
        timestamp: Date.now(),
        metadata: metadata
      };
      const request = store.add(record);
      request.onsuccess = () => {
        resolve(String(request.result));
      };
      request.onerror = () => {
        reject(new Error(`Failed to save recording: ${request.error}`));
      };
      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error}`));
      };
    });
  }

  /**
   * 載入音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<Blob>}
   */
  async load(id) {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(Number(id));
      request.onsuccess = () => {
        const record = request.result;
        if (record && record.blob) {
          resolve(record.blob);
        } else {
          reject(new Error(`Recording not found: ${id}`));
        }
      };
      request.onerror = () => {
        reject(new Error(`Failed to load recording: ${request.error}`));
      };
    });
  }

  /**
   * 刪除音訊檔案
   * @param {string} id - 檔案 ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(Number(id));
      request.onsuccess = () => {
        resolve(true);
      };
      request.onerror = () => {
        reject(new Error(`Failed to delete recording: ${request.error}`));
      };
    });
  }

  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result.map(record => ({
          id: String(record.id),
          filename: record.filename,
          size: record.size,
          type: record.type,
          timestamp: record.timestamp,
          date: new Date(record.timestamp),
          metadata: record.metadata || {}
        }));
        resolve(records);
      };
      request.onerror = () => {
        reject(new Error(`Failed to list recordings: ${request.error}`));
      };
    });
  }

  /**
   * 根據檔名搜尋
   * @param {string} filename - 檔案名稱（支援部分匹配）
   * @returns {Promise<Array>}
   */
  async searchByFilename(filename) {
    const allRecords = await this.list();
    return allRecords.filter(record => record.filename.toLowerCase().includes(filename.toLowerCase()));
  }

  /**
   * 取得儲存空間使用情況
   * @returns {Promise<Object>}
   */
  async getStorageInfo() {
    const records = await this.list();
    const totalSize = records.reduce((sum, record) => sum + record.size, 0);
    return {
      count: records.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      records: records
    };
  }

  /**
   * 清空所有錄音
   * @returns {Promise<number>} 刪除的數量
   */
  async clear() {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // 先取得數量
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const count = countRequest.result;

        // 清空儲存區
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
          resolve(count);
        };
        clearRequest.onerror = () => {
          reject(new Error(`Failed to clear recordings: ${clearRequest.error}`));
        };
      };
      countRequest.onerror = () => {
        reject(new Error(`Failed to count recordings: ${countRequest.error}`));
      };
    });
  }

  /**
   * 取得瀏覽器儲存空間配額資訊（如果可用）
   * @returns {Promise<Object|null>}
   */
  async getStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage,
          quota: estimate.quota,
          usageMB: (estimate.usage / (1024 * 1024)).toFixed(2),
          quotaMB: (estimate.quota / (1024 * 1024)).toFixed(2),
          usagePercent: (estimate.usage / estimate.quota * 100).toFixed(2)
        };
      } catch (error) {
        console.warn('Failed to get storage estimate:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * 關閉資料庫連接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * ServerAdapter - 伺服器儲存適配器
 * 支援 PHP/Node.js 等後端儲存方案
 */

class ServerAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {Object} config - 配置選項
   * @param {string} config.baseURL - 基礎 URL
   * @param {string} config.saveEndpoint - 上傳端點
   * @param {string} config.loadEndpoint - 下載端點
   * @param {string} config.deleteEndpoint - 刪除端點
   * @param {string} config.listEndpoint - 列表端點（可選）
   */
  constructor(config = {}) {
    super();
    this.baseURL = config.baseURL || '';
    this.saveEndpoint = config.saveEndpoint || '/backend/save.php';
    this.loadEndpoint = config.loadEndpoint || '/public/uploads/';
    this.deleteEndpoint = config.deleteEndpoint || '/backend/delete.php';
    this.listEndpoint = config.listEndpoint || '/api/recordings';
    this.headers = config.headers || {};
  }

  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案名稱
   */
  async save(blob, filename, metadata = {}) {
    const formData = new FormData();
    formData.append('audio-blob', blob);
    formData.append('audio-filename', filename);
    if (metadata && Object.keys(metadata).length > 0) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    try {
      const response = await fetch(this.baseURL + this.saveEndpoint, {
        method: 'POST',
        body: formData,
        headers: this.headers
      });
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      const result = await response.text();

      // 檢查 PHP 端點的回應（通常是 'success'）
      if (result.toLowerCase().includes('success')) {
        return filename;
      } else {
        throw new Error(`Server error: ${result}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  }

  /**
   * 載入音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<Blob>}
   */
  async load(filename) {
    try {
      const url = this.baseURL + this.loadEndpoint + filename;
      const response = await fetch(url, {
        headers: this.headers
      });
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status} ${response.statusText}`);
      }
      return await response.blob();
    } catch (error) {
      console.error('Load error:', error);
      throw error;
    }
  }

  /**
   * 刪除音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<boolean>}
   */
  async delete(filename) {
    try {
      const response = await fetch(this.baseURL + this.deleteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify({
          filename
        })
      });
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
      }
      const result = await response.text();
      return result.toLowerCase().includes('success');
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  }

  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    try {
      const response = await fetch(this.baseURL + this.listEndpoint, {
        headers: this.headers
      });
      if (!response.ok) {
        throw new Error(`List failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('List error:', error);
      // 如果後端不支援 list 操作，返回空陣列
      return [];
    }
  }

  /**
   * 使用 XMLHttpRequest 上傳（帶進度回調）
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @param {Function} onProgress - 進度回調 (percent)
   * @returns {Promise<string>}
   */
  async saveWithProgress(blob, filename, metadata = {}, onProgress = null) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('audio-blob', blob);
      formData.append('audio-filename', filename);
      if (metadata && Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }
      const xhr = new XMLHttpRequest();

      // 進度事件
      if (onProgress) {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const percent = e.loaded / e.total * 100;
            onProgress(percent);
          }
        });
      }

      // 完成事件
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = xhr.responseText;
          if (result.toLowerCase().includes('success')) {
            resolve(filename);
          } else {
            reject(new Error(`Server error: ${result}`));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      // 錯誤事件
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      // 取消事件
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // 發送請求
      xhr.open('POST', this.baseURL + this.saveEndpoint);

      // 設定自定義 headers
      Object.keys(this.headers).forEach(key => {
        xhr.setRequestHeader(key, this.headers[key]);
      });
      xhr.send(formData);
    });
  }
}

/**
 * ElectronAdapter - Electron 檔案系統儲存適配器
 * 使用 Electron 的 IPC 通訊與主進程進行檔案操作
 */

class ElectronAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} savePath - 預設儲存路徑（相對於用戶文件目錄）
   */
  constructor(savePath = 'recordings') {
    super();
    this.savePath = savePath;

    // 檢查 Electron API 是否可用
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Electron API not available. Make sure preload script is properly configured.');
    }
    this.electronAPI = window.electronAPI;
  }

  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案路徑
   */
  async save(blob, filename, metadata = {}) {
    try {
      // 將 Blob 轉換為 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // 轉換為普通陣列（以便通過 IPC 傳遞）
      const buffer = Array.from(new Uint8Array(arrayBuffer));

      // 呼叫 Electron API
      const result = await this.electronAPI.saveRecording({
        filename,
        buffer,
        metadata: {
          ...metadata,
          size: blob.size,
          type: blob.type,
          timestamp: Date.now()
        }
      });
      if (result.success) {
        return result.id || result.path;
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (error) {
      console.error('Electron save error:', error);
      throw error;
    }
  }

  /**
   * 載入音訊檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<Blob>}
   */
  async load(filePath) {
    try {
      // 從 Electron 讀取檔案
      const buffer = await this.electronAPI.loadRecording(filePath);

      // 將 Buffer 轉換為 Blob
      const uint8Array = new Uint8Array(buffer);
      return new Blob([uint8Array], {
        type: 'audio/wav'
      });
    } catch (error) {
      console.error('Electron load error:', error);
      throw error;
    }
  }

  /**
   * 刪除音訊檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<boolean>}
   */
  async delete(filePath) {
    try {
      const result = await this.electronAPI.deleteRecording(filePath);
      return result.success;
    } catch (error) {
      console.error('Electron delete error:', error);
      throw error;
    }
  }

  /**
   * 列出所有檔案
   * @param {string} directory - 目錄路徑（可選）
   * @returns {Promise<Array>}
   */
  async list(directory = null) {
    try {
      const recordings = await this.electronAPI.listRecordings(directory);
      return recordings || [];
    } catch (error) {
      console.error('Electron list error:', error);
      return [];
    }
  }

  /**
   * 開啟檔案選擇對話框
   * @returns {Promise<string|null>} 選擇的檔案路徑
   */
  async openFile() {
    try {
      if (this.electronAPI.openFile) {
        return await this.electronAPI.openFile();
      }
      throw new Error('openFile API not available');
    } catch (error) {
      console.error('Electron openFile error:', error);
      return null;
    }
  }

  /**
   * 開啟另存為對話框
   * @param {Blob} blob - 要儲存的 Blob
   * @param {string} defaultFilename - 預設檔案名稱
   * @returns {Promise<string|null>} 儲存的檔案路徑
   */
  async saveAs(blob, defaultFilename = 'recording.wav') {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Array.from(new Uint8Array(arrayBuffer));
      if (this.electronAPI.saveAs) {
        const result = await this.electronAPI.saveAs({
          filename: defaultFilename,
          buffer
        });
        return result.success ? result.path : null;
      }

      // 如果沒有 saveAs API，使用預設的 save
      return await this.save(blob, defaultFilename);
    } catch (error) {
      console.error('Electron saveAs error:', error);
      return null;
    }
  }

  /**
   * 在檔案管理器中顯示檔案
   * @param {string} filePath - 檔案路徑
   * @returns {Promise<boolean>}
   */
  async showInFolder(filePath) {
    try {
      if (this.electronAPI.showInFolder) {
        await this.electronAPI.showInFolder(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Electron showInFolder error:', error);
      return false;
    }
  }
}

/**
 * CapacitorAdapter - Capacitor 檔案系統儲存適配器
 * 使用 Capacitor Filesystem Plugin 在移動裝置上儲存檔案
 */

class CapacitorAdapter extends StorageAdapter {
  /**
   * 建構函數
   * @param {string} directory - 儲存目錄名稱
   */
  constructor(directory = 'recordings') {
    super();
    this.directory = directory;

    // 檢查 Capacitor 是否可用
    if (typeof window === 'undefined' || !window.Capacitor) {
      throw new Error('Capacitor not available. Make sure Capacitor is properly initialized.');
    }
    this.Capacitor = window.Capacitor;
    this.initialized = false;
  }

  /**
   * 初始化（確保目錄存在）
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;

      // 嘗試讀取目錄，如果不存在則創建
      try {
        await Filesystem.readdir({
          path: this.directory,
          directory: Directory.Documents
        });
      } catch (e) {
        // 目錄不存在，創建它
        await Filesystem.mkdir({
          path: this.directory,
          directory: Directory.Documents,
          recursive: true
        });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Capacitor initialization error:', error);
      throw error;
    }
  }

  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據
   * @returns {Promise<string>} 檔案名稱
   */
  async save(blob, filename, metadata = {}) {
    await this.initialize();
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;

      // 轉換 Blob 為 base64
      const base64Data = await this.blobToBase64(blob);

      // 儲存音訊檔案
      await Filesystem.writeFile({
        path: `${this.directory}/${filename}`,
        data: base64Data,
        directory: Directory.Documents
      });

      // 儲存元數據
      if (metadata && Object.keys(metadata).length > 0) {
        const metadataWithDefaults = {
          ...metadata,
          size: blob.size,
          type: blob.type,
          timestamp: Date.now()
        };
        await Filesystem.writeFile({
          path: `${this.directory}/${filename}.meta.json`,
          data: JSON.stringify(metadataWithDefaults),
          directory: Directory.Documents,
          encoding: 'utf8'
        });
      }
      return filename;
    } catch (error) {
      console.error('Capacitor save error:', error);
      throw error;
    }
  }

  /**
   * 載入音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<Blob>}
   */
  async load(filename) {
    await this.initialize();
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;
      const result = await Filesystem.readFile({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });

      // 將 base64 轉換為 Blob
      return this.base64ToBlob(result.data, 'audio/wav');
    } catch (error) {
      console.error('Capacitor load error:', error);
      throw error;
    }
  }

  /**
   * 刪除音訊檔案
   * @param {string} filename - 檔案名稱
   * @returns {Promise<boolean>}
   */
  async delete(filename) {
    await this.initialize();
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;

      // 刪除音訊檔案
      await Filesystem.deleteFile({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });

      // 嘗試刪除元數據（如果存在）
      try {
        await Filesystem.deleteFile({
          path: `${this.directory}/${filename}.meta.json`,
          directory: Directory.Documents
        });
      } catch (e) {
        // 元數據可能不存在，忽略錯誤
      }
      return true;
    } catch (error) {
      console.error('Capacitor delete error:', error);
      throw error;
    }
  }

  /**
   * 列出所有檔案
   * @returns {Promise<Array>}
   */
  async list() {
    await this.initialize();
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;
      const result = await Filesystem.readdir({
        path: this.directory,
        directory: Directory.Documents
      });

      // 過濾掉元數據檔案，只保留音訊檔案
      const audioFiles = result.files.filter(f => !f.endsWith('.meta.json'));

      // 為每個檔案載入元數據
      const recordings = await Promise.all(audioFiles.map(async filename => {
        let metadata = {};
        try {
          const metaResult = await Filesystem.readFile({
            path: `${this.directory}/${filename}.meta.json`,
            directory: Directory.Documents,
            encoding: 'utf8'
          });
          metadata = JSON.parse(metaResult.data);
        } catch (e) {
          // 沒有元數據
        }
        return {
          id: filename,
          filename: filename,
          metadata: metadata,
          timestamp: metadata.timestamp || 0,
          date: metadata.timestamp ? new Date(metadata.timestamp) : null,
          size: metadata.size || 0,
          type: metadata.type || 'audio/wav'
        };
      }));

      // 按時間排序（最新的在前）
      recordings.sort((a, b) => b.timestamp - a.timestamp);
      return recordings;
    } catch (error) {
      console.error('Capacitor list error:', error);
      return [];
    }
  }

  /**
   * 取得檔案的 URI（用於播放）
   * @param {string} filename - 檔案名稱
   * @returns {Promise<string>} 檔案 URI
   */
  async getUri(filename) {
    await this.initialize();
    try {
      const {
        Filesystem,
        Directory
      } = this.Capacitor.Plugins;
      const result = await Filesystem.getUri({
        path: `${this.directory}/${filename}`,
        directory: Directory.Documents
      });
      return result.uri;
    } catch (error) {
      console.error('Capacitor getUri error:', error);
      throw error;
    }
  }

  /**
   * Blob 轉 base64
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // 移除 data:audio/wav;base64, 前綴
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * base64 轉 Blob
   * @param {string} base64
   * @param {string} mimeType
   * @returns {Blob}
   */
  base64ToBlob(base64, mimeType = 'audio/wav') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], {
      type: mimeType
    });
  }

  /**
   * 取得儲存空間資訊
   * @returns {Promise<Object>}
   */
  async getStorageInfo() {
    const recordings = await this.list();
    const totalSize = recordings.reduce((sum, r) => sum + (r.size || 0), 0);
    return {
      count: recordings.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      recordings: recordings
    };
  }
}

/**
 * Storage Module - 儲存模組統一入口
 * 匯出所有儲存適配器
 */


/**
 * StorageFactory - 儲存適配器工廠
 * 根據配置自動創建適當的儲存適配器
 */
class StorageFactory {
  /**
   * 創建儲存適配器
   * @param {Object} config - 配置選項
   * @param {string} config.type - 儲存類型 ('browser'|'electron'|'capacitor'|'server'|'auto')
   * @param {Object} config.options - 適配器特定選項
   * @returns {StorageAdapter}
   */
  static create(config = {}) {
    const type = config.type || 'auto';
    const options = config.options || {};

    // 自動偵測
    if (type === 'auto') {
      return this.createAuto(options);
    }

    // 根據類型創建
    switch (type.toLowerCase()) {
      case 'browser':
      case 'indexeddb':
        const {
          IndexedDBAdapter
        } = require('./IndexedDBAdapter.js');
        return new IndexedDBAdapter(options.dbName, options.storeName, options.version);
      case 'electron':
        const {
          ElectronAdapter
        } = require('./ElectronAdapter.js');
        return new ElectronAdapter(options.savePath);
      case 'capacitor':
        const {
          CapacitorAdapter
        } = require('./CapacitorAdapter.js');
        return new CapacitorAdapter(options.directory);
      case 'server':
      case 'php':
      case 'nodejs':
        const {
          ServerAdapter
        } = require('./ServerAdapter.js');
        return new ServerAdapter(options);
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }

  /**
   * 自動創建適配器（根據環境）
   * @param {Object} options - 選項
   * @returns {StorageAdapter}
   */
  static createAuto(options = {}) {
    // 檢查 Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      const {
        ElectronAdapter
      } = require('./ElectronAdapter.js');
      return new ElectronAdapter(options.savePath);
    }

    // 檢查 Capacitor
    if (typeof window !== 'undefined' && window.Capacitor) {
      const {
        CapacitorAdapter
      } = require('./CapacitorAdapter.js');
      return new CapacitorAdapter(options.directory);
    }

    // 預設使用 IndexedDB（瀏覽器）
    const {
      IndexedDBAdapter
    } = require('./IndexedDBAdapter.js');
    return new IndexedDBAdapter(options.dbName, options.storeName, options.version);
  }
}

/**
 * PlatformDetector - 平台偵測工具
 * 自動偵測當前運行環境（Browser/Electron/Capacitor）
 */

class PlatformDetector {
  /**
   * 偵測當前平台
   * @returns {string} 'browser' | 'electron' | 'capacitor'
   */
  static detect() {
    // 檢查是否為 Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      return 'electron';
    }

    // 檢查是否為 Electron（另一種方式）
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      return 'electron';
    }

    // 檢查是否為 Capacitor
    if (typeof window !== 'undefined' && window.Capacitor) {
      return 'capacitor';
    }

    // 預設為瀏覽器
    return 'browser';
  }

  /**
   * 檢查是否為 Electron 環境
   * @returns {boolean}
   */
  static isElectron() {
    return this.detect() === 'electron';
  }

  /**
   * 檢查是否為 Capacitor 環境
   * @returns {boolean}
   */
  static isCapacitor() {
    return this.detect() === 'capacitor';
  }

  /**
   * 檢查是否為瀏覽器環境
   * @returns {boolean}
   */
  static isBrowser() {
    return this.detect() === 'browser';
  }

  /**
   * 檢查是否為移動裝置
   * @returns {boolean}
   */
  static isMobile() {
    if (typeof window === 'undefined' || !window.navigator) {
      return false;
    }
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
  }

  /**
   * 檢查是否支援 AudioWorklet
   * @returns {boolean}
   */
  static supportsAudioWorklet() {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return false;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    return 'audioWorklet' in AudioContextClass.prototype;
  }

  /**
   * 檢查是否支援 OffscreenCanvas
   * @returns {boolean}
   */
  static supportsOffscreenCanvas() {
    return typeof OffscreenCanvas !== 'undefined';
  }

  /**
   * 取得平台資訊
   * @returns {Object}
   */
  static getInfo() {
    return {
      platform: this.detect(),
      isElectron: this.isElectron(),
      isCapacitor: this.isCapacitor(),
      isBrowser: this.isBrowser(),
      isMobile: this.isMobile(),
      supportsAudioWorklet: this.supportsAudioWorklet(),
      supportsOffscreenCanvas: this.supportsOffscreenCanvas(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
  }
}

/**
 * VoiceBank Recorder - 主入口點
 * 跨平台音訊錄音庫
 * 
 * @version 1.0.0
 * @author VoiceBank Team
 * @license MIT
 */


/**
 * VoiceBankRecorder - 主類別
 * 提供統一的 API 介面
 */
class VoiceBankRecorder {
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
        onError: error => console.error('VoiceBankRecorder error:', error)
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
    const result = {
      ...target
    };
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
    const {
      StorageFactory
    } = require('./storage/index.js');
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

/**
 * 版本資訊
 */
const VERSION = '1.0.0';

/**
 * 建置資訊
 */
const BUILD_INFO = {
  version: VERSION,
  date: new Date().toISOString(),
  name: 'VoiceBank Recorder'
};

export { AudioEngine, BUILD_INFO, CapacitorAdapter, DeviceManager, ElectronAdapter, IndexedDBAdapter, PlatformDetector, ServerAdapter, StorageAdapter, StorageFactory, VERSION, VoiceBankRecorder, VoiceBankRecorderUI, WaveformRenderer, VoiceBankRecorder as default };
//# sourceMappingURL=voicebank-recorder.esm.js.map
