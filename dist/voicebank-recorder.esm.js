/*!
 * voicebank-recorder v1.0.0
 * 跨平台音訊錄音庫，支援 Browser/Electron/Capacitor
 * 
 * @license MIT
 * @author VoiceBank Team
 * @repository https://github.com/cychiang-ntpu/simple-recordrtc-example.git
 */

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
      preferWorklet: options.preferWorklet !== undefined ? options.preferWorklet : true
    };

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
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: this.config.sampleRate
      });

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

      // 獲取麥克風
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
    const constraints = {
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
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);

      // iOS 自動增益調整
      this._applyIOSMicGainAdjustment();

      // 連接麥克風到前級增益節點
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      source.connect(this.preGainNode);
      this._emit('microphone-captured', {
        deviceId: this.config.deviceId,
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

export { AudioEngine, BUILD_INFO, CapacitorAdapter, ElectronAdapter, IndexedDBAdapter, PlatformDetector, ServerAdapter, StorageAdapter, StorageFactory, VERSION, VoiceBankRecorder, VoiceBankRecorder as default };
//# sourceMappingURL=voicebank-recorder.esm.js.map
