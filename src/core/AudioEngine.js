import DeviceManager from './DeviceManager.js';

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

export class AudioEngine {
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
            this.workletSupported = !!(
                this.audioContext.audioWorklet && 
                window.AudioWorkletNode
            );

            // 載入 AudioWorklet 模組（如果支援且偏好使用）
            if (this.workletSupported && this.config.preferWorklet) {
                try {
                    await this.audioContext.audioWorklet.addModule(this.config.workletPath);
                    this.workletLoaded = true;
                    this._emit('worklet-loaded', { path: this.config.workletPath });
                } catch (error) {
                    console.warn('載入 AudioWorklet 模組失敗，將回退到 RecordRTC:', error);
                    this.workletLoaded = false;
                    this._emit('worklet-load-failed', { error });
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
            this._emit('error', { stage: 'initialize', error });
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
            this._emit('error', { stage: 'start-recording', error });
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
            this._emit('error', { stage: 'stop-recording', error });
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
            this._emit('recording-paused', { timestamp: Date.now() });
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
            this._emit('recording-resumed', { timestamp: Date.now() });
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

        this._emit('mic-gain-changed', { gain });
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
                constraints.audio.deviceId = { exact: this.config.deviceId };
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

            const usedDeviceId = this.deviceManager ? 
                this.deviceManager.getSelectedMicrophoneId() : 
                this.config.deviceId;
            
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

                this._emit('microphone-captured-fallback', { constraints });
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
                    this._emit('ios-gain-adjusted', { gain: 3.5 });
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
            this.pcmCollectorNode = new AudioWorkletNode(
                this.audioContext,
                'pcm-collector-processor'
            );

            // 監聽 PCM 數據
            this.pcmCollectorNode.port.onmessage = (event) => {
                const { type, pcmData } = event.data;

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
            const wavBuffer = this._buildWavFromFloat32Mono(
                merged,
                this.audioContext.sampleRate
            );

            const blob = new Blob([wavBuffer], { type: 'audio/wav' });

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
                    ondataavailable: (blob) => {
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
        view.setUint16(20, 1, true);  // audio format (PCM)
        view.setUint16(22, 1, true);  // number of channels
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true); // byte rate
        view.setUint16(32, 2, true);  // block align
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

export default AudioEngine;
