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
export class WaveformRenderer {
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
        this.audioEngine.on('data-available', (data) => {
            if (data.pcmData && this.accumulatedWaveform) {
                this.appendPCM(data.pcmData);
            }
        });
    }
    
    /**
     * 初始化所有波形組件
     */
    async initialize() {
        const { liveCanvas, vuMeterCanvas, accumulatedCanvas, overviewCanvas } = this.options;
        
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
export class LiveWaveform {
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
            contextReady = audioContext.resume().catch(function(err) {
                console.warn('Unable to resume AudioContext:', err);
            });
        }

        // 等待 AudioContext 就緒後再連接麥克風
        contextReady.then(function() {
            // 為避免重複連線先清除舊的 source
            if (self.mediaStreamSource) {
                self.mediaStreamSource.disconnect();
            }

            // 連接麥克風
            self.mediaStreamSource = audioContext.createMediaStreamSource(stream);
            if (preGainNode) {
                try { 
                    self.mediaStreamSource.connect(preGainNode); 
                } catch(e) { 
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
                const y = (v * this.height / 2) + (this.height / 2);

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
                const x = (v * this.width / 2) + (this.width / 2);

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
export class VUMeter {
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
        if (!this.analyser) return { rmsDb: this.minDb, peakDb: this.minDb };
        
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
            if (v > 1) v = 1;
            else if (v < -1) v = -1;
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
        
        return { rmsDb, peakDb };
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
                ctx.fillStyle = (db === 0) ? '#ffffff' : (db === -10 ? '#ffeb3b' : '#cbd5e0');
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
        if (this.lastClipTime && (now - this.lastClipTime) < this.clipHoldMillis) {
            ctx.save();
            ctx.fillStyle = '#B00020';
            const badgeW = 42, badgeH = 18;
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
export class AccumulatedWaveform {
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
                this._worker.onmessage = function(ev) {
                    const msg = ev.data;
                    if (!msg) return;
                    if (msg.type === 'detailUpdate') {
                        self.lastDetail = msg.detail;
                        self.lastDensity = msg.density;
                    }
                };
            } catch(e) {
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
            } catch(e) {
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
        this.canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStartX = e.offsetX;
            dragStartViewStart = this.viewStart;
            this.isAutoScroll = false;
            this.canvas.style.cursor = 'grabbing';
        });
        
        // 滑鼠移動（拖曳）
        this.canvas.addEventListener('mousemove', (e) => {
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
        this.canvas.addEventListener('wheel', (e) => {
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
        this.canvas.addEventListener('click', (e) => {
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
            this._worker.postMessage({ type: 'reset' });
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
            console.log('📈 AccumulatedWaveform.append():', total, '樣本 →', 
                        Math.floor(total / factor), '區塊');
            this._lastAppendLog = now;
        }
        
        // 改進的演算法：DC Offset Removal（移除直流偏移）
        // 先計算區塊平均值，再以此為中心計算 min/max
        // 這樣可以讓波形更對稱、細緻
        for (let i = 0; i < total; i += factor) {
            let blockSum = 0;
            let blockCount = 0;

            // 第一階段：計算區塊平均值（DC offset）
            for (let j = 0; j < factor && (i + j) < total; j++) {
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
            let blockMax = -1.0;

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
        const { start, end, visible } = info;
        
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
            const x = ((i - start) / visible) * this.width;
            const y = centerY - (this.sampleMax[i] * centerY * 0.95);
            
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
            const x = ((i - start) / visible) * this.width;
            const y = centerY - (this.sampleMin[i] * centerY * 0.95);
            
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
        if (total === 0) return { start: 0, end: 0, visible: 0 };
        
        const minVis = this._getMinVisibleSamples(total);
        let visible = Math.max(minVis, Math.round(total / this.zoomFactor));
        if (visible > total) visible = total;
        
        let start = this.viewStart;
        if (start + visible > total) start = total - visible;
        if (start < 0) start = 0;
        
        const end = Math.min(total, start + visible);
        return { start, end, visible };
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
            return { min: 0, max: 0 };
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
export class OverviewWaveform {
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
        let dragStartX = 0;
        let dragStartViewStart = 0;
        let dragClickedSample = 0; // 記錄點擊位置對應的絕對樣本位置
        let dragVisibleSamples = 0; // 記錄拖曳開始時的可視範圍大小
        
        // 滑鼠按下 - 點擊或開始拖曳
        this.canvas.addEventListener('mousedown', (e) => {
            const acc = this.accumulatedWaveform;
            if (!acc || acc.sampleCount === 0) return;
            
            isDragging = true;
            dragStartX = e.offsetX;
            dragStartViewStart = acc.viewStart;
            
            // 記錄拖曳開始時的狀態
            const total = acc.sampleCount;
            const info = acc.getVisibleSamples();
            dragVisibleSamples = info.visible;
            
            // 計算點擊位置在可視範圍指示器內的偏移
            // 使用與繪製時相同的座標映射邏輯
            const viewStartX = Math.floor((info.start / total) * this.width);
            const offsetInView = e.offsetX - viewStartX;
            dragClickedSample = offsetInView; // 記錄在可視範圍內的像素偏移
            
            this.canvas.style.cursor = 'grabbing';
        });
        
        // 滑鼠移動 - 拖曳更新
        this.canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const acc = this.accumulatedWaveform;
            if (!acc || acc.sampleCount === 0) return;
            
            const total = acc.sampleCount;
            
            // 計算新的可視範圍起始位置（像素）
            // 保持滑鼠在可視範圍內的相對位置不變
            const targetViewStartX = e.offsetX - dragClickedSample;
            
            // 像素 → 樣本（使用反向映射）
            const newViewStart = Math.floor((targetViewStartX / this.width) * total);
            
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
            this._workerRef.postMessage({ type: 'clearOverview' });
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
            const yMin = Math.floor(centerY - (sample.max * centerY * 0.9));
            const yMax = Math.floor(centerY - (sample.min * centerY * 0.9));
            
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
        const viewStartX = Math.floor((info.start / total) * this.width);
        const viewEndX = Math.floor((info.end / total) * this.width);
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

// 導出所有類別
export default WaveformRenderer;
