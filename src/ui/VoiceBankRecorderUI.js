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

import { AudioEngine } from '../core/AudioEngine.js';
import { WaveformRenderer } from '../core/WaveformRenderer.js';
import { DeviceManager } from '../core/DeviceManager.js';

/**
 * VoiceBankRecorderUI - 完整的錄音器 UI 組件
 */
export class VoiceBankRecorderUI {
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
        this.elements.autoScrollCheck.addEventListener('change', (e) => this._handleAutoScrollChange(e));
        
        // 裝置選擇
        this.elements.micSelect.addEventListener('change', (e) => this._handleMicChange(e));
        this.elements.outputSelect.addEventListener('change', (e) => this._handleOutputChange(e));
        this.elements.refreshMicBtn.addEventListener('click', () => this._refreshMicrophones());
        this.elements.refreshOutputBtn.addEventListener('click', () => this._refreshOutputDevices());
        
        // 進階選項
        if (this.options.showAdvancedOptions) {
            this.elements.gainSlider.addEventListener('input', (e) => this._handleGainChange(e));
            this.elements.agcCheck.addEventListener('change', (e) => this._handleAGCChange(e));
            this.elements.echoCancelCheck.addEventListener('change', (e) => this._handleEchoCancelChange(e));
            this.elements.noiseSuppressCheck.addEventListener('change', (e) => this._handleNoiseSuppressChange(e));
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
        const ms = Math.floor((seconds % 1) * 1000);
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
