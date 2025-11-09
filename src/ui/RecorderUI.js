/**
 * RecorderUI.js
 * VoiceBank Recorder 主 UI 控制器
 * 
 * 職責：
 * - 管理所有 UI 元素和狀態
 * - 協調 AudioEngine 和 WaveformRenderer
 * - 處理用戶交互事件
 * - 更新 UI 顯示
 * 
 * @module RecorderUI
 * @requires AudioEngine
 * @requires WaveformRenderer
 */

/**
 * RecorderUI 類 - 主 UI 控制器
 */
export class RecorderUI {
  /**
   * 建構函數
   * @param {string|HTMLElement} container - 容器選擇器或元素
   * @param {Object} options - 配置選項
   * @param {AudioEngine} options.audioEngine - 音訊引擎實例
   * @param {WaveformRenderer} options.waveformRenderer - 波形渲染器實例
   * @param {Object} options.callbacks - 回調函數
   */
  constructor(container, options = {}) {
    // 容器元素
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!this.container) {
      throw new Error('Container element not found');
    }
    
    // 核心模組引用
    this.audioEngine = options.audioEngine;
    this.waveformRenderer = options.waveformRenderer;
    
    // 配置選項
    this.options = {
      layout: options.layout || 'auto', // 'horizontal', 'vertical', 'auto'
      theme: options.theme || 'light',  // 'light', 'dark'
      showOverview: options.showOverview !== false,
      ...options
    };
    
    // 回調函數
    this.callbacks = {
      onRecordStart: options.onRecordStart || (() => {}),
      onRecordStop: options.onRecordStop || (() => {}),
      onPlayStart: options.onPlayStart || (() => {}),
      onPlayStop: options.onPlayStop || (() => {}),
      onError: options.onError || ((error) => console.error('UI Error:', error)),
      ...options.callbacks
    };
    
    // UI 元素引用（初始化後填充）
    this.elements = {};
    
    // 狀態
    this.state = {
      isRecording: false,
      isPlaying: false,
      isPaused: false,
      hasRecording: false,
      duration: 0,
      sampleCount: 0
    };
    
    // 子控制器（可選）
    this.controlPanel = null;
    this.playbackController = null;
    this.layoutManager = null;
  }
  
  /**
   * 初始化 UI
   */
  async initialize() {
    try {
      // 1. 渲染 UI 結構
      this.renderUI();
      
      // 2. 獲取 DOM 元素引用
      this.cacheElements();
      
      // 3. 綁定事件處理器
      this.bindEvents();
      
      // 4. 初始化子控制器（如果需要）
      this.initializeSubControllers();
      
      // 5. 應用初始設定
      this.applyInitialSettings();
      
      // 6. 連接核心模組事件
      this.connectCoreModules();
      
      console.log('✅ RecorderUI initialized');
    } catch (error) {
      this.callbacks.onError(error);
      throw error;
    }
  }
  
  /**
   * 渲染 UI 結構
   * 注意：這是簡化版，實際應該從 public/index.html 提取完整 HTML
   */
  renderUI() {
    this.container.innerHTML = `
      <div class="voicebank-recorder" data-layout="${this.options.layout}" data-theme="${this.options.theme}">
        <!-- 控制面板 -->
        <div class="recorder-controls">
          <button id="vbr-btn-record" class="btn-record">
            <span class="icon">●</span>
            <span class="label">開始錄音</span>
          </button>
          
          <div class="recording-info">
            <span id="vbr-recording-duration">00:00.0</span>
            <span id="vbr-sample-count">0 samples</span>
          </div>
        </div>
        
        <!-- 波形容器 -->
        <div class="waveform-wrapper" id="vbr-waveform-wrapper">
          <!-- 即時波形 -->
          <div class="waveform-section">
            <label>即時波形</label>
            <canvas id="vbr-live-waveform" width="800" height="120"></canvas>
          </div>
          
          <!-- VU Meter -->
          <div class="waveform-section">
            <label>音量表</label>
            <canvas id="vbr-vu-meter" width="800" height="50"></canvas>
          </div>
          
          <!-- 累積波形 -->
          <div class="waveform-section">
            <label>累積波形</label>
            <canvas id="vbr-accumulated-waveform" width="800" height="200"></canvas>
          </div>
          
          <!-- 概覽波形 -->
          ${this.options.showOverview ? `
          <div class="waveform-section">
            <label>概覽波形</label>
            <canvas id="vbr-overview-waveform" width="800" height="80"></canvas>
          </div>
          ` : ''}
        </div>
        
        <!-- 播放控制 -->
        <div class="playback-controls">
          <button id="vbr-btn-play" class="btn-play" disabled>
            <span class="icon">▶</span>
            <span class="label">播放</span>
          </button>
          <button id="vbr-btn-pause" class="btn-pause" disabled>
            <span class="icon">⏸</span>
            <span class="label">暫停</span>
          </button>
          <button id="vbr-btn-stop" class="btn-stop" disabled>
            <span class="icon">⏹</span>
            <span class="label">停止</span>
          </button>
        </div>
        
        <!-- 工具列 -->
        <div class="toolbar">
          <button id="vbr-btn-save" class="btn-save" disabled>
            <span class="icon">💾</span>
            <span class="label">儲存</span>
          </button>
          <button id="vbr-btn-clear" class="btn-clear" disabled>
            <span class="icon">🗑️</span>
            <span class="label">清除</span>
          </button>
          <button id="vbr-btn-layout-toggle" class="btn-layout-toggle">
            <span class="icon">🔄</span>
            <span class="label">切換佈局</span>
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * 緩存 DOM 元素引用
   */
  cacheElements() {
    this.elements = {
      // 按鈕
      btnRecord: document.getElementById('vbr-btn-record'),
      btnPlay: document.getElementById('vbr-btn-play'),
      btnPause: document.getElementById('vbr-btn-pause'),
      btnStop: document.getElementById('vbr-btn-stop'),
      btnSave: document.getElementById('vbr-btn-save'),
      btnClear: document.getElementById('vbr-btn-clear'),
      btnLayoutToggle: document.getElementById('vbr-btn-layout-toggle'),
      
      // 顯示元素
      recordingDuration: document.getElementById('vbr-recording-duration'),
      sampleCount: document.getElementById('vbr-sample-count'),
      waveformWrapper: document.getElementById('vbr-waveform-wrapper'),
      
      // Canvas 元素
      liveCanvas: document.getElementById('vbr-live-waveform'),
      vuMeterCanvas: document.getElementById('vbr-vu-meter'),
      accumulatedCanvas: document.getElementById('vbr-accumulated-waveform'),
      overviewCanvas: document.getElementById('vbr-overview-waveform')
    };
  }
  
  /**
   * 綁定事件處理器
   */
  bindEvents() {
    // 錄音按鈕
    if (this.elements.btnRecord) {
      this.elements.btnRecord.addEventListener('click', () => {
        this.handleRecordToggle();
      });
    }
    
    // 播放控制按鈕
    if (this.elements.btnPlay) {
      this.elements.btnPlay.addEventListener('click', () => {
        this.handlePlay();
      });
    }
    
    if (this.elements.btnPause) {
      this.elements.btnPause.addEventListener('click', () => {
        this.handlePause();
      });
    }
    
    if (this.elements.btnStop) {
      this.elements.btnStop.addEventListener('click', () => {
        this.handleStop();
      });
    }
    
    // 工具按鈕
    if (this.elements.btnSave) {
      this.elements.btnSave.addEventListener('click', () => {
        this.handleSave();
      });
    }
    
    if (this.elements.btnClear) {
      this.elements.btnClear.addEventListener('click', () => {
        this.handleClear();
      });
    }
    
    if (this.elements.btnLayoutToggle) {
      this.elements.btnLayoutToggle.addEventListener('click', () => {
        this.handleLayoutToggle();
      });
    }
    
    // 視窗大小變更
    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }
  
  /**
   * 初始化子控制器（可選）
   */
  initializeSubControllers() {
    // 這裡可以初始化其他 UI 子控制器
    // 例如：this.controlPanel = new ControlPanel(this);
    // 目前先保持簡單
  }
  
  /**
   * 應用初始設定
   */
  applyInitialSettings() {
    // 應用佈局
    this.applyLayout(this.options.layout);
    
    // 應用主題
    this.applyTheme(this.options.theme);
    
    // 初始化按鈕狀態
    this.updateButtonStates();
  }
  
  /**
   * 連接核心模組事件
   */
  connectCoreModules() {
    if (!this.audioEngine || !this.waveformRenderer) {
      console.warn('Core modules not provided, UI will have limited functionality');
      return;
    }
    
    // AudioEngine 事件
    this.audioEngine.on('recording-start', () => {
      this.onRecordingStart();
    });
    
    this.audioEngine.on('recording-stop', (data) => {
      this.onRecordingStop(data);
    });
    
    this.audioEngine.on('data-available', (data) => {
      this.onDataAvailable(data);
    });
    
    this.audioEngine.on('error', (error) => {
      this.onAudioError(error);
    });
  }
  
  // ==================== 事件處理器 ====================
  
  /**
   * 處理錄音按鈕切換
   */
  async handleRecordToggle() {
    try {
      if (this.state.isRecording) {
        // 停止錄音
        await this.audioEngine.stopRecording();
      } else {
        // 開始錄音
        await this.audioEngine.startRecording();
      }
    } catch (error) {
      this.callbacks.onError(error);
      this.showError('錄音操作失敗：' + error.message);
    }
  }
  
  /**
   * 處理播放
   */
  async handlePlay() {
    try {
      // TODO: 實現播放邏輯
      console.log('Play recording');
      this.callbacks.onPlayStart();
    } catch (error) {
      this.callbacks.onError(error);
    }
  }
  
  /**
   * 處理暫停
   */
  async handlePause() {
    try {
      // TODO: 實現暫停邏輯
      console.log('Pause playback');
    } catch (error) {
      this.callbacks.onError(error);
    }
  }
  
  /**
   * 處理停止
   */
  async handleStop() {
    try {
      // TODO: 實現停止邏輯
      console.log('Stop playback');
      this.callbacks.onPlayStop();
    } catch (error) {
      this.callbacks.onError(error);
    }
  }
  
  /**
   * 處理儲存
   */
  async handleSave() {
    try {
      // TODO: 實現儲存邏輯
      console.log('Save recording');
    } catch (error) {
      this.callbacks.onError(error);
    }
  }
  
  /**
   * 處理清除
   */
  async handleClear() {
    if (!confirm('確定要清除當前錄音嗎？')) {
      return;
    }
    
    try {
      // 清除波形
      if (this.waveformRenderer) {
        this.waveformRenderer.reset();
      }
      
      // 重置狀態
      this.state.hasRecording = false;
      this.state.duration = 0;
      this.state.sampleCount = 0;
      
      // 更新顯示
      this.updateDurationDisplay();
      this.updateButtonStates();
      
      console.log('Recording cleared');
    } catch (error) {
      this.callbacks.onError(error);
    }
  }
  
  /**
   * 處理佈局切換
   */
  handleLayoutToggle() {
    const currentLayout = this.container.dataset.layout;
    const newLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
    this.applyLayout(newLayout);
  }
  
  /**
   * 處理視窗大小變更
   */
  handleResize() {
    // 調整 Canvas 尺寸
    if (this.waveformRenderer) {
      this.waveformRenderer.resize();
    }
  }
  
  // ==================== 核心模組事件回調 ====================
  
  /**
   * 錄音開始回調
   */
  onRecordingStart() {
    this.state.isRecording = true;
    this.state.hasRecording = true;
    
    // 更新 UI
    this.setRecordingState(true);
    this.updateButtonStates();
    
    // 啟動波形顯示
    if (this.waveformRenderer) {
      // WaveformRenderer 會自動從 AudioEngine 獲取數據
    }
    
    // 回調
    this.callbacks.onRecordStart();
    
    console.log('🎙️ Recording started');
  }
  
  /**
   * 錄音停止回調
   */
  onRecordingStop(data) {
    this.state.isRecording = false;
    
    // 更新 UI
    this.setRecordingState(false);
    this.updateButtonStates();
    
    // 回調
    this.callbacks.onRecordStop(data);
    
    console.log('⏹️ Recording stopped', data);
  }
  
  /**
   * 數據可用回調
   */
  onDataAvailable(data) {
    // 更新時長和樣本數
    if (data.duration !== undefined) {
      this.state.duration = data.duration;
    }
    if (data.sampleCount !== undefined) {
      this.state.sampleCount = data.sampleCount;
    }
    
    // 更新顯示
    this.updateDurationDisplay();
  }
  
  /**
   * 音訊錯誤回調
   */
  onAudioError(error) {
    this.showError('音訊錯誤：' + error.message);
    this.callbacks.onError(error);
  }
  
  // ==================== UI 更新方法 ====================
  
  /**
   * 設定錄音狀態
   * @param {boolean} isRecording - 是否正在錄音
   */
  setRecordingState(isRecording) {
    const btn = this.elements.btnRecord;
    if (!btn) return;
    
    if (isRecording) {
      btn.classList.add('recording');
      btn.querySelector('.icon').textContent = '⏹';
      btn.querySelector('.label').textContent = '停止錄音';
    } else {
      btn.classList.remove('recording');
      btn.querySelector('.icon').textContent = '●';
      btn.querySelector('.label').textContent = '開始錄音';
    }
  }
  
  /**
   * 更新按鈕狀態
   */
  updateButtonStates() {
    const { isRecording, isPlaying, isPaused, hasRecording } = this.state;
    
    // 錄音按鈕：播放時禁用
    if (this.elements.btnRecord) {
      this.elements.btnRecord.disabled = isPlaying;
    }
    
    // 播放控制按鈕：沒有錄音時禁用
    if (this.elements.btnPlay) {
      this.elements.btnPlay.disabled = !hasRecording || isRecording || isPlaying;
    }
    
    if (this.elements.btnPause) {
      this.elements.btnPause.disabled = !isPlaying || isPaused;
    }
    
    if (this.elements.btnStop) {
      this.elements.btnStop.disabled = !isPlaying && !isPaused;
    }
    
    // 工具按鈕
    if (this.elements.btnSave) {
      this.elements.btnSave.disabled = !hasRecording || isRecording;
    }
    
    if (this.elements.btnClear) {
      this.elements.btnClear.disabled = !hasRecording || isRecording;
    }
  }
  
  /**
   * 更新時長顯示
   */
  updateDurationDisplay() {
    if (this.elements.recordingDuration) {
      this.elements.recordingDuration.textContent = this.formatDuration(this.state.duration);
    }
    
    if (this.elements.sampleCount) {
      this.elements.sampleCount.textContent = `${this.state.sampleCount.toLocaleString()} samples`;
    }
  }
  
  /**
   * 格式化時長
   * @param {number} seconds - 秒數
   * @returns {string} 格式化後的時長 (MM:SS.S)
   */
  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decimal = Math.floor((seconds % 1) * 10);
    
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${decimal}`;
  }
  
  /**
   * 應用佈局
   * @param {string} layout - 'horizontal', 'vertical', 'auto'
   */
  applyLayout(layout) {
    if (layout === 'auto') {
      // 自動偵測
      layout = window.innerWidth > window.innerHeight ? 'horizontal' : 'vertical';
    }
    
    this.container.dataset.layout = layout;
    this.options.layout = layout;
    
    // 通知 WaveformRenderer
    if (this.waveformRenderer) {
      this.waveformRenderer.setVerticalMode(layout === 'vertical');
    }
    
    console.log(`📐 Layout changed to: ${layout}`);
  }
  
  /**
   * 應用主題
   * @param {string} theme - 'light', 'dark'
   */
  applyTheme(theme) {
    this.container.dataset.theme = theme;
    this.options.theme = theme;
    
    console.log(`🎨 Theme changed to: ${theme}`);
  }
  
  /**
   * 顯示錯誤訊息
   * @param {string} message - 錯誤訊息
   */
  showError(message) {
    // 簡單的錯誤顯示（可以擴展為更好的 UI）
    alert('錯誤：' + message);
  }
  
  /**
   * 顯示通知
   * @param {string} message - 通知訊息
   * @param {number} duration - 持續時間（毫秒）
   */
  showNotice(message, duration = 3000) {
    // 簡單的通知顯示（可以擴展為更好的 UI）
    console.log('📢 Notice:', message);
  }
  
  // ==================== 公開 API ====================
  
  /**
   * 取得當前狀態
   * @returns {Object} 狀態物件
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * 設定選項
   * @param {Object} options - 選項物件
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
    
    // 應用變更
    if (options.layout) {
      this.applyLayout(options.layout);
    }
    if (options.theme) {
      this.applyTheme(options.theme);
    }
  }
  
  /**
   * 銷毀 UI
   */
  destroy() {
    // 移除事件監聽器
    // （簡化版，實際應該記錄所有監聽器並逐一移除）
    
    // 清空容器
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    // 清空引用
    this.elements = {};
    this.audioEngine = null;
    this.waveformRenderer = null;
    
    console.log('🗑️ RecorderUI destroyed');
  }
}

export default RecorderUI;
