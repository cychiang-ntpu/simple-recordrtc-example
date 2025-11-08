/*=================================================================
 * 全域變數宣告區域
 * 定義應用程式中需要的主要變數和狀態
 *================================================================*/

// DOM 元素引用
var audio = document.getElementById('playback-audio') || document.querySelector('audio'); // 主播放元素（若頁面無則於首次需求時動態建立）
if (!audio) {
    audio = document.createElement('audio');
    audio.setAttribute('preload','none');
    audio.setAttribute('playsinline','');
    audio.style.display = 'none'; // 不干擾版面
    document.body.appendChild(audio);
}
var downloadButton = document.getElementById('btn-download-recording');     // 下載按鈕
var btnPlay = document.getElementById('btn-play');             // 播放
var btnPause = document.getElementById('btn-pause');           // 暫停
var btnStopPlayback = document.getElementById('btn-stop-playback'); // 停止播放
var btnClearSelection = document.getElementById('btn-clear-selection'); // 取消選取
var btnJumpStart = document.getElementById('btn-jump-start'); // 回到開始
var displayModeRadios = document.querySelectorAll('input[name="display-mode"]'); // 顯示模式切換
var micSelect = document.getElementById('mic-select'); // 麥克風選擇器
var btnRefreshMics = document.getElementById('btn-refresh-mics'); // 重新整理裝置
var spkSelect = document.getElementById('spk-select'); // 輸出裝置選擇器
var btnRefreshSpks = document.getElementById('btn-refresh-outputs'); // 重新整理輸出裝置

// 簡單方向管理器（先掛鉤 UI，之後再逐步導入渲染）
var orientationManager = {
    mode: 'horizontal',
    setMode: function(m){
        if(m !== 'horizontal' && m !== 'vertical') return;
        if(this.mode === m) return;
        this.mode = m;
        applyDisplayMode();
        // 切換模式時調整提示文字
        updateModeHints();
        // 新需求：水平模式也隱藏 live，不再自動恢復
    },
    isVertical: function(){ return this.mode === 'vertical'; }
};

// 視窗尺寸變動時，垂直模式需同步更新 canvas 寬高
window.addEventListener('resize', function(){
    if (orientationManager && orientationManager.isVertical && orientationManager.isVertical()) {
        applyDisplayMode();
    }
});

function applyDisplayMode(){
    var wrapper = document.getElementById('waveform-wrapper');
    if(!wrapper) return;
    wrapper.classList.remove('mode-horizontal','mode-vertical');
    wrapper.classList.add('mode-' + orientationManager.mode);
    // 動態調整三個 canvas 尺寸（依模式）
    var overviewCanvas = document.getElementById('overview-waveform');
    var accumCanvas = document.getElementById('accumulated-waveform');
    var liveCanvas = document.getElementById('waveform');
    var vuCanvas = document.getElementById('vu-meter');

    function doResizePass(){
        var dpr = window.devicePixelRatio || 1;
        var targetAccumW, targetAccumH, targetOverviewW, targetOverviewH;
        
        if(orientationManager.isVertical()){
            var targetH = Math.round(window.innerHeight * 0.80); // 80vh 高度
            // 計算目標尺寸（先取得 CSS 寬度）
            if (accumCanvas) {
                var cssWAccum = accumCanvas.clientWidth || 240;
                targetAccumW = Math.round(cssWAccum * dpr);
                targetAccumH = Math.round(targetH * dpr);
            }
            if (overviewCanvas) {
                var cssWOverview = overviewCanvas.clientWidth || 240;
                targetOverviewW = Math.round(cssWOverview * dpr);
                targetOverviewH = Math.round(targetH * dpr);
            }
            
            // 嘗試直接調整 canvas（如果沒有轉移控制權）
            if (accumCanvas) {
                try {
                    accumCanvas.width = targetAccumW;
                    accumCanvas.height = targetAccumH;
                    accumCanvas.style.height = '100%';
                } catch(e) {
                    // Canvas 已轉移控制權，稍後通知 Worker
                }
            }
            if (overviewCanvas) {
                try {
                    overviewCanvas.width = targetOverviewW;
                    overviewCanvas.height = targetOverviewH;
                    overviewCanvas.style.height = '100%';
                } catch(e) {
                    // Canvas 已轉移控制權，稍後通知 Worker
                }
            }
            
            if (liveWaveform && typeof liveWaveform.stop === 'function') {
                try { liveWaveform.stop(); } catch(e){}
            }
        } else {
            // 水平模式
            targetAccumW = 750;
            targetAccumH = 150;
            targetOverviewW = 750;
            targetOverviewH = 90;
            
            try {
                if(overviewCanvas){ 
                    overviewCanvas.width = targetOverviewW; 
                    overviewCanvas.height = targetOverviewH; 
                }
            } catch(e) {
                // Canvas 已轉移控制權，稍後通知 Worker
            }
            try {
                if(accumCanvas){ 
                    accumCanvas.width = targetAccumW; 
                    accumCanvas.height = targetAccumH; 
                }
            } catch(e) {
                // Canvas 已轉移控制權，稍後通知 Worker
            }
            if(liveWaveform && typeof liveWaveform.stop === 'function') {
                try { liveWaveform.stop(); } catch(e){}
            }
        }

        // 同步 AccumulatedWaveform / OverviewWaveform 內部尺寸與 Worker 畫布
        try {
            if (accumulatedWaveform) {
                // 使用實際的 canvas 尺寸（可能是剛設定的，或是既有的）
                if (accumCanvas) {
                    var actualW = accumCanvas.width || targetAccumW;
                    var actualH = accumCanvas.height || targetAccumH;
                    accumulatedWaveform.width = actualW;
                    accumulatedWaveform.height = actualH;
                    
                    // 若使用 worker，通知其調整 offscreen 尺寸
                    if (accumulatedWaveform._useWorker && accumulatedWaveform._worker) {
                        accumulatedWaveform._worker.postMessage({
                            type: 'resizeCanvas',
                            width: actualW,
                            height: actualH
                        });
                    }
                }
                accumulatedWaveform.draw();
            }
            if (overviewWaveform && overviewCanvas) {
                var actualOverviewW = overviewCanvas.width || targetOverviewW;
                var actualOverviewH = overviewCanvas.height || targetOverviewH;
                overviewWaveform.width = actualOverviewW;
                overviewWaveform.height = actualOverviewH;
                
                // 若 Overview 也使用 Worker（透過 AccumulatedWaveform 的 Worker），通知調整
                if (overviewWaveform._useWorker && overviewWaveform._workerRef) {
                    overviewWaveform._workerRef.postMessage({
                        type: 'resizeOverview',
                        width: actualOverviewW,
                        height: actualOverviewH
                    });
                }
                overviewWaveform.draw();
            }
        } catch(e){
            console.warn('同步 waveform 尺寸時發生錯誤:', e);
        }
    }

    // 第一輪：先嘗試立即調整；為避免剛切換 class 尚未完成排版，再排一個 rAF 二次調整
    doResizePass();
    requestAnimationFrame(doResizePass);

    // 更新各 waveform 物件內部寬高參考並重繪
    // （邏輯已併入 doResizePass）
    if(liveWaveform){
        // 任何模式均不重繪（水平模式新需求亦隱藏 live）
    }

    // 套用 Overview 顯示偏好（可能在模式切換後需重新調整佈局）
    applyOverviewVisibility();

    // 調整 VU Meter 畫布像素尺寸以符合當前 CSS 尺寸與 DPR
    if (vuCanvas) {
        try {
            var dprVU = window.devicePixelRatio || 1;
            var cssVW = vuCanvas.clientWidth || 300;
            var cssVH = vuCanvas.clientHeight || 24;
            vuCanvas.width = Math.round(cssVW * dprVU);
            vuCanvas.height = Math.round(cssVH * dprVU);
        } catch(e) {
            // Canvas 已轉移控制權，無法調整大小
        }
        if (vuMeter && typeof vuMeter.resize === 'function') {
            vuMeter.resize();
            if (typeof vuMeter.draw === 'function') {
                vuMeter.draw(vuMeter.levelDb || -60);
            }
        }
    }

    // 根據模式切換 body 樣式（供 CSS 控制快速按鈕顯示）
    try {
        var body = document.body;
        if (orientationManager.isVertical()) body.classList.add('is-vertical');
        else body.classList.remove('is-vertical');
    } catch(e){}

    // 重新定位並同步迷你音量條尺寸
    try {
        placeMiniLevel();
        syncMiniLevelWidth();
    } catch(e){}
}

// 動態顯示不同模式的使用提示
function updateModeHints(){
    var hintSpan = document.querySelector('#accumulated-toolbar .hint');
    if(!hintSpan) return;
    if(orientationManager.isVertical()){
        hintSpan.textContent = '垂直模式：左側總覽拖曳可選取範圍；右側細節區可平移/長按建立選取並拖曳綠色圓點調整。';
    } else {
        hintSpan.innerHTML = '電腦：拖曳平移 | Shift+拖曳選取/拉伸 | Ctrl+滾輪縮放<br>手機：拖曳平移 | 長按選取 | 拖曳綠色圓點調整';
    }
}

// 初次載入根據視窗比例自動套用垂直模式（高>寬且比值>1.1）
function autoDetectInitialOrientation(){
    try {
        var h = window.innerHeight, w = window.innerWidth;
        if (h > w && (h / w) > 1.1) {
            orientationManager.mode = 'vertical';
            applyDisplayMode();
            updateModeHints();
        } else {
            updateModeHints();
        }
    } catch(e){ updateModeHints(); }
}
autoDetectInitialOrientation();

// Debounce 計時器
var resizeDebounceTimer = null;
var orientationDebounceTimer = null;

// 監聽 resize / orientationchange 自動判斷（若使用者未暫停自動）
var autoOrientationEnabled = true;
window.addEventListener('resize', function(){
    if(!autoOrientationEnabled) return; // 使用者停用自動偵測
    
    // Debounce: 等待 150ms 後才執行，避免頻繁觸發
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(function(){
        try {
            var h = window.innerHeight, w = window.innerWidth;
            var wantVertical = (h > w) && ((h / w) > 1.1);
            var targetMode = wantVertical ? 'vertical' : 'horizontal';
            if (orientationManager.mode !== targetMode) {
                orientationManager.setMode(targetMode);
                showToast('自動切換為 ' + (targetMode === 'vertical' ? '垂直模式' : '水平模式'));
            }
            // 視窗尺寸改變時，同步迷你音量條寬度
            syncMiniLevelWidth();
        } catch(e){
            showError('處理視窗大小變更時發生錯誤', e);
        }
    }, 150);
});

window.addEventListener('orientationchange', function(){
    // orientationchange 在部分桌面環境不觸發；行動裝置補強
    if(!autoOrientationEnabled) return;
    
    // Debounce: 等待 200ms 讓裝置完成旋轉
    clearTimeout(orientationDebounceTimer);
    orientationDebounceTimer = setTimeout(function(){
        try {
            var h = window.innerHeight, w = window.innerWidth;
            var wantVertical = (h > w) && ((h / w) > 1.1);
            var targetMode = wantVertical ? 'vertical' : 'horizontal';
            if (orientationManager.mode !== targetMode) {
                orientationManager.setMode(targetMode);
                showToast('自動切換為 ' + (targetMode === 'vertical' ? '垂直模式' : '水平模式'));
            }
            syncMiniLevelWidth();
        } catch(e){
            showError('處理螢幕旋轉時發生錯誤', e);
        }
    }, 200);
});

// 快速按鈕行為
var btnBackHorizontal = document.getElementById('btn-back-horizontal');
var btnRestoreAuto = document.getElementById('btn-restore-auto');
if (btnBackHorizontal) {
    btnBackHorizontal.addEventListener('click', function(){
        autoOrientationEnabled = false; // 暫停自動
        orientationManager.setMode('horizontal');
        showToast('已切換回水平模式（自動偵測暫停）');
    });
}
if (btnRestoreAuto) {
    btnRestoreAuto.addEventListener('click', function(){
        autoOrientationEnabled = true;
        showToast('恢復自動偵測模式');
        // 立即觸發一次判斷
        var h = window.innerHeight, w = window.innerWidth;
        var wantVertical = (h > w) && ((h / w) > 1.1);
        orientationManager.setMode(wantVertical ? 'vertical' : 'horizontal');
    });
}

if (displayModeRadios && displayModeRadios.length) {
    displayModeRadios.forEach(function(radio){
        radio.addEventListener('change', function(){
            orientationManager.setMode(this.value);
        });
    });
}

// 初始化 VU Meter（若畫布存在），並綁定 analyser
(function initVUMeter(){
    var vuCanvas = document.getElementById('vu-meter');
    if (vuCanvas) {
        vuMeter = new VUMeter(vuCanvas, analyser);
        // 嘗試啟動動畫循環；若 analyser 尚未就緒，之後也會更新
        if (vuMeter && typeof vuMeter.start === 'function') {
            vuMeter.start();
        }
    }
})();

// 將迷你音量條移動到波形容器並根據模式擺放
function placeMiniLevel(){
    var mini = document.querySelector('.mini-level');
    var wrapper = document.getElementById('waveform-wrapper');
    if (!mini || !wrapper) return;

    // 清除舊的限制以便同步寬度
    try {
        mini.style.maxWidth = '';
        mini.style.width = '';
        mini.style.margin = '6px auto';
    } catch(e){}

    // 如已有 row 容器，先移除
    var oldRow = document.getElementById('mini-level-row');
    if (oldRow && oldRow.parentElement === wrapper) {
        try { wrapper.removeChild(oldRow); } catch(e){}
    }

    if (orientationManager && orientationManager.isVertical && orientationManager.isVertical()) {
        // 垂直模式：置於兩欄下方，佔滿欄位寬度
        var row = document.createElement('div');
        row.id = 'mini-level-row';
        row.className = 'mini-level-row';
        row.appendChild(mini);
        wrapper.appendChild(row);
    } else {
        // 水平模式：置於最上方（在累積/總覽之前）
        if (wrapper.firstChild !== mini) {
            wrapper.insertBefore(mini, wrapper.firstChild);
        }
    }
}

// 同步迷你音量條寬度為累積波形的可見寬度
function syncMiniLevelWidth(){
    var mini = document.querySelector('.mini-level');
    if (!mini) return;
    var ref = document.getElementById('accumulated-waveform') || document.getElementById('overview-waveform');
    if (!ref) return;
    // 讀取目前 CSS 寬度（含 RWD）
    var w = ref.clientWidth || 0;
    if (w > 0) {
        mini.style.width = w + 'px';
        mini.style.margin = '6px auto';
    }
}

// 調整：在播放暫停/停止後若仍有 analyser 需持續刷新 VU（避免 playback 後停住）
function ensureVUMeterRunning(){
    if (vuMeter && typeof vuMeter.start === 'function' && !vuMeter.animationId){
        vuMeter.start();
    }
}

// 錄音狀態控制變數
var is_ready_to_record = true;   // 是否準備好錄音
var is_recording = false;        // 是否正在錄音
var is_recorded = false;         // 是否已完成錄音

// Web Audio API 相關物件
var audioContext = null; // 音頻上下文（延遲初始化）
var analyser = null;     // 音頻分析器（延遲初始化）
var analyserSilencer = null; // 用於避免回授的靜音輸出節點
var preGainNode = null;      // 前級增益節點（AGC 關閉時可放大）
var mediaDest = null;        // MediaStreamDestination（供 RecordRTC 使用的處理後串流）
var micGainUserFactor = 1.0; // 使用者設定的前級增益倍率（預設 1.0x）
var defaultWindowSeconds = parseFloat(localStorage.getItem('defaultWindowSeconds') || '1.0'); // 使用者設定的預設視窗秒數
var currentMicStream = null; // 目前的麥克風 MediaStream（便於停止）
// AudioWorklet PCM 收集
var workletSupported = false;
var workletLoaded = false;
var pcmCollectorNode = null; // AudioWorkletNode
var pcmChunks = [];          // 收到的 Float32Array 片段
var pcmTotalSamples = 0;     // 累積樣本數（單聲道）
var usingWorklet = false;    // 目前是否使用 Worklet 錄製
// 掉樣估計：以牆鐘時間推估期望樣本數
var recordWallStartMs = 0;
var recordWallStopMs = 0;
// 提供視覺化高倍放大時取原始樣本的輔助函式
function getPcmWindow(start, count){
    if (!usingWorklet || !pcmChunks.length) return null;
    if (start < 0) start = 0;
    var total = pcmTotalSamples;
    if (start >= total) return new Float32Array(0);
    var end = Math.min(total, start + count);
    var out = new Float32Array(end - start);
    var offset = 0;
    var passed = 0;
    for (var i=0;i<pcmChunks.length && passed < end;i++){
        var chunk = pcmChunks[i];
        if (!chunk || !chunk.length) continue;
        var cLen = chunk.length;
        var cStart = passed;
        var cEnd = passed + cLen;
        if (cEnd <= start) {
            passed = cEnd; continue;
        }
        var segStart = Math.max(start, cStart);
        var segEnd = Math.min(end, cEnd);
        if (segEnd > segStart) {
            var localStart = segStart - cStart;
            var slice = chunk.subarray(localStart, localStart + (segEnd - segStart));
            out.set(slice, offset);
            offset += slice.length;
        }
        passed = cEnd;
        if (segEnd >= end) break;
    }
    return out;
}

// 即時/累積波形顯示變數
var liveWaveform = null;          // 即時波形顯示器實例
var accumulatedWaveform = null;   // 累積波形顯示器實例
var overviewWaveform = null;      // 全局波形顯示器實例
var latestRecordingBlob = null;   // 最近一次錄音的 Blob
var latestRecordingUrl = null;    // 最近一次錄音的 Object URL
var accumulatedControlsBound = false; // 是否已綁定累積波形互動
var vuMeter = null;               // VU Meter 實例
var showOverview = (localStorage.getItem('showOverview') !== 'false'); // Overview 顯示偏好（預設 true）
var themePref = localStorage.getItem('theme') || 'light'; // 主題偏好
var autoGainProtect = (localStorage.getItem('autoGainProtect') !== 'false'); // 自動降增益保護（預設開啟）
var showClipMarks = (localStorage.getItem('showClipMarks') !== 'false'); // 顯示削波標記（預設開啟）
var rawZoomPref = (localStorage.getItem('rawZoomMode') === 'true'); // 以原始樣本縮放（預設關閉）
var dynamicDetailPref = (localStorage.getItem('dynamicDetailEnabled') !== 'false'); // 動態細緻度（預設開啟）
// 測試音功能已移除
// 規格面板更新相關
var lastSpecs = {}; // 保存最近一次顯示的規格
var preferredMicKey = 'preferredMicDeviceId';
var selectedMicDeviceId = localStorage.getItem(preferredMicKey) || '';
var preferredOutKey = 'preferredOutputDeviceId';
var selectedOutDeviceId = localStorage.getItem(preferredOutKey) || 'default';
var lastAudioConstraintsUsed = null; // 供規格面板顯示

// 輕量提示訊息（使用頁腳 #send-message）
var __noticeTimer = null;
function showNotice(msg, duration){
    var el = document.getElementById('send-message');
    if(!el) return;
    el.textContent = msg;
    if (__noticeTimer) { clearTimeout(__noticeTimer); }
    __noticeTimer = setTimeout(function(){
        try { el.textContent = ''; } catch(e){}
    }, duration || 2200);
}

// 更進階：浮動 Toast（不影響 footer）
function showToast(message, opts){
    opts = opts || {};
    var ttl = opts.duration || 2500;
    var container = document.getElementById('toast-container');
    if(!container){ return showNotice(message, ttl); }
    var item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);
    setTimeout(function(){ item.classList.add('out'); }, ttl - 400);
    setTimeout(function(){ try { container.removeChild(item); } catch(e){} }, ttl);
}

// 統一錯誤處理：顯示錯誤訊息並記錄至 Console
function showError(message, error){
    console.error('[Error]', message, error || '');
    showToast('⚠️ ' + message, {duration: 3500});
}

// 記憶體限制常數
var MAX_RECORDING_BYTES = 50 * 1024 * 1024; // 50MB
var MAX_RECORDING_SECONDS = 10 * 60;        // 10 分鐘

// 檢查錄音記憶體用量
function checkRecordingMemoryLimit(){
    if (!usingWorklet || !isCurrentlyRecording) return true;
    
    var bytesUsed = pcmTotalSamples * 4; // Float32 = 4 bytes per sample
    var recordingSeconds = (performance.now() - recordWallStartMs) / 1000;
    
    if (bytesUsed > MAX_RECORDING_BYTES) {
        showError('錄音資料已達 50MB 上限，自動停止錄音');
        setTimeout(stopRecording, 100);
        return false;
    }
    
    if (recordingSeconds > MAX_RECORDING_SECONDS) {
        showError('錄音時間已達 10 分鐘上限，自動停止錄音');
        setTimeout(stopRecording, 100);
        return false;
    }
    
    return true;
}

// 主題套用
function applyTheme(){
    try {
        var root = document.documentElement;
        if (themePref === 'dark') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme');
    } catch(e){}
}

// Overview 顯示/隱藏
function applyOverviewVisibility(){
    var wrapper = document.getElementById('waveform-wrapper');
    if(!wrapper) return;
    if(showOverview) wrapper.classList.remove('no-overview'); else wrapper.classList.add('no-overview');
}

// 迷你音量條更新（RMS/Peak 來源）
function updateMiniLevelBar(rmsDb, peakDb){
    try {
        var bar = document.getElementById('mini-level-bar');
        if (!bar) return;
        var minDb = -90, maxDb = 0;
        if (!isFinite(rmsDb)) rmsDb = minDb;
        var norm = (rmsDb - minDb) / (maxDb - minDb);
        if (norm < 0) norm = 0; if (norm > 1) norm = 1;
        var pct = Math.max(norm * 100, 2); // 設定 2% 的最小可見寬度
        bar.style.width = pct.toFixed(1) + '%';
        var tip = 'RMS ' + (rmsDb <= minDb ? '-∞' : rmsDb.toFixed(1)) + ' dBFS';
        if (isFinite(peakDb)) tip += ' | Peak ' + (peakDb <= minDb ? '-∞' : peakDb.toFixed(1)) + ' dBFS';
        bar.title = tip;
    } catch(e) {}
}

function detectEnvironment() {
    var ua = navigator.userAgent || '';
    var isElectron = !!(window && window.process && window.process.type);
    var isCapacitor = !!(window && window.Capacitor);
    var platform = 'Browser';
    if (isElectron) platform = 'Electron App';
    else if (isCapacitor) platform = 'Capacitor (Mobile App)';
    var os = '-';
    try {
        if (/windows/i.test(ua)) os = 'Windows';
        else if (/mac os x/i.test(ua)) os = 'macOS';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
        else if (/linux/i.test(ua)) os = 'Linux';
    } catch(e){}
    return platform + ' / ' + os;
}

function formatOrNA(v) {
    if (v === undefined || v === null || v === '') return '(未提供)';
    return v;
}

function gatherAndRenderSpecs() {
    var envEl = document.getElementById('spec-env');
    var inputEl = document.getElementById('spec-input');
    var ctxEl = document.getElementById('spec-context');
    var recEl = document.getElementById('spec-recorder');
    var outEl = document.getElementById('spec-output');
    var decEl = document.getElementById('spec-decimation');
    var dropEl = document.getElementById('spec-dropout');
    var visRawEl = document.getElementById('spec-visible-raw');
    var detailEl = document.getElementById('spec-detail');
    if (!envEl) return; // 若面板不存在則略過

    var specs = {};
    // 環境
    specs.environment = detectEnvironment();

    // AudioContext 規格
    if (audioContext) {
        var baseLatency = (audioContext.baseLatency !== undefined) ? (' baseLatency=' + audioContext.baseLatency.toFixed ? audioContext.baseLatency.toFixed(3)+'s' : audioContext.baseLatency) : '';
            specs.audioContext = 'sampleRate=' + audioContext.sampleRate + ' state=' + audioContext.state + baseLatency + ' latency=' + (audioContext.baseLatency || 0).toFixed(3) + 's';
    } else {
        specs.audioContext = '尚未初始化';
    }

    // MediaTrack 規格（若正在錄音且存在麥克風）
    if (isCurrentlyRecording && recorder && recorder.microphone) {
        var tracks = recorder.microphone.getAudioTracks ? recorder.microphone.getAudioTracks() : [];
        if (tracks && tracks.length) {
            var settings = tracks[0].getSettings ? tracks[0].getSettings() : {};
            var label = tracks[0].label || '';
            var parts = [];
            if (label) parts.push('device=' + label);
            if (settings.sampleRate) parts.push('sampleRate=' + settings.sampleRate);
            if (settings.channelCount) parts.push('channelCount=' + settings.channelCount);
            if (settings.sampleSize) parts.push('sampleSize=' + settings.sampleSize + 'bit');
            if (settings.latency) parts.push('latency=' + settings.latency + 's');
            if (settings.echoCancellation !== undefined) parts.push('AEC=' + settings.echoCancellation);
            if (settings.noiseSuppression !== undefined) parts.push('NS=' + settings.noiseSuppression);
            if (settings.autoGainControl !== undefined) parts.push('AGC=' + settings.autoGainControl);
            var baseInput = parts.length ? parts.join(', ') : '（無可用設定）';
            if (lastAudioConstraintsUsed) {
                try {
                    var c = JSON.parse(JSON.stringify(lastAudioConstraintsUsed));
                    // deviceId 統一顯示為字串或 exact 值
                    if (c.deviceId && typeof c.deviceId === 'object' && c.deviceId.exact) {
                        c.deviceId = c.deviceId.exact;
                    }
                    baseInput += ' | constraints=' + JSON.stringify(c);
                } catch(e) {}
            }
            specs.input = baseInput;
        } else {
            specs.input = '無音訊 track';
        }
    } else {
        specs.input = '尚未開始錄音';
    }

    // RecordRTC/StereoAudioRecorder 規格
    if (usingWorklet) {
        specs.recorder = 'AudioWorklet mono float32 → WAV (samples=' + pcmTotalSamples + ')';
    } else if (recorder) {
        try {
            var internal = recorder.getInternalRecorder ? recorder.getInternalRecorder() : null;
            if (internal) {
                var recParts = [];
                recParts.push('channels=' + internal.numberOfAudioChannels);
                if (internal.sampleRate) recParts.push('sampleRate=' + internal.sampleRate + (internal.desiredSampRate ? ('->'+internal.desiredSampRate) : ''));
                if (internal.bufferSize) recParts.push('bufferSize=' + internal.bufferSize);
                recParts.push('format=WAV PCM 16-bit');
                if (preGainNode) {
                    var agcOn = false; try { var agcEl = document.getElementById('agc-toggle'); agcOn = !!(agcEl && agcEl.checked); } catch(e){}
                    recParts.push('preGain=' + (preGainNode.gain && preGainNode.gain.value ? preGainNode.gain.value.toFixed(2) : '1.00') + (agcOn ? ' (AGC on)' : ''));
                }
                specs.recorder = recParts.join(', ');
            } else {
                specs.recorder = '內部錄音器尚未就緒';
            }
        } catch(e) {
            specs.recorder = '取得失敗: ' + e.message;
        }
    } else if (!usingWorklet) {
        specs.recorder = '未建立';
    }

    // WAV 輸出（錄音完成後）
    if (latestRecordingBlob) {
        var sizeKB = (latestRecordingBlob.size / 1024).toFixed(1) + 'KB';
        var durationSec = '-';
        try {
            if (accumulatedWaveform && accumulatedWaveform.sampleCount && audioContext && audioContext.sampleRate) {
                var frames = (accumulatedWaveform.sampleCount * (accumulatedWaveform.decimationFactor || 1));
                durationSec = (frames / audioContext.sampleRate).toFixed(2) + 's';
            }
        } catch(e){}
        specs.output = 'type=' + latestRecordingBlob.type + ', size=' + sizeKB + ', duration=' + durationSec;
    } else {
        specs.output = isCurrentlyRecording ? '錄音進行中...' : '尚未產生';
    }

    // Decimation 規格
    if (accumulatedWaveform) {
        specs.decimation = 'targetRate=' + accumulatedWaveform.targetSampleRate + ', sourceRate=' + accumulatedWaveform.sourceSampleRate + ', factor=' + accumulatedWaveform.decimationFactor;
    } else {
        specs.decimation = '尚未建立累積波形';
    }

    // Clipping 規格
    try {
        var cs = window.__lastClipStats;
        if (cs && cs.maxAbs) {
            var pct = cs.totalSamples ? ((cs.clippedSamples/ cs.totalSamples)*100).toFixed(3) : '0';
            var maxDb = 20*Math.log10(cs.maxAbs);
            specs.clipping = 'maxAbs=' + cs.maxAbs.toFixed(4) + ' (' + (maxDb>-90?maxDb.toFixed(1):'-∞') + ' dBFS), clipped=' + cs.clippedSamples + (cs.clippedSamples?(' ('+pct+'%)'):'');
        } else {
            specs.clipping = '(未偵測)';
        }
    } catch(e){ specs.clipping='(錯誤)'; }

    // 掉樣估計（以牆鐘 vs. 收集之樣本數）
    try {
        if (audioContext) {
            var sr = audioContext.sampleRate || 48000;
            var tNow = performance.now();
            var tStart = recordWallStartMs || 0;
            var tEnd = isCurrentlyRecording ? tNow : (recordWallStopMs || tNow);
            var elapsedSec = tStart > 0 ? Math.max(0, (tEnd - tStart) / 1000) : 0;
            var expected = Math.round(sr * elapsedSec);
            var actual = 0;
            if (usingWorklet) actual = pcmTotalSamples;
            else if (accumulatedWaveform && accumulatedWaveform.sampleCount) {
                actual = Math.round(accumulatedWaveform.sampleCount * Math.max(1, accumulatedWaveform.decimationFactor||1));
            }
            var diff = Math.max(0, expected - actual);
            var pct = expected > 0 ? (diff / expected * 100) : 0;
            specs.dropout = (expected>0)
                ? ('expected=' + expected + ', actual=' + actual + ', diff=' + diff + ' (' + pct.toFixed(2) + '%)')
                : '(尚無資料)';
        } else {
            specs.dropout = '(AudioContext 未就緒)';
        }
    } catch(e){ specs.dropout = '(錯誤)'; }

    // 可視 Raw 樣本數
    try {
        if (accumulatedWaveform && accumulatedWaveform.sampleCount) {
            var dec = Math.max(1, accumulatedWaveform.decimationFactor || 1);
            var visDec = accumulatedWaveform.getVisibleSamples();
            var estRaw = visDec * dec;
            if (usingWorklet && pcmTotalSamples > 0) {
                var rawStart;
                var exact;
                if (accumulatedWaveform.rawZoomMode) {
                    rawStart = Math.max(0, Math.floor(accumulatedWaveform.rawViewStart));
                    exact = Math.max(0, Math.min(Math.floor(accumulatedWaveform.rawVisibleRaw), pcmTotalSamples - rawStart));
                } else {
                    rawStart = Math.max(0, Math.floor(accumulatedWaveform.viewStart * dec));
                    exact = Math.max(0, Math.min(estRaw, pcmTotalSamples - rawStart));
                }
                specs.visibleRaw = exact + ' (from ' + rawStart + ')';
            } else {
                specs.visibleRaw = '≈ ' + estRaw + ' (est)';
            }
        } else {
            specs.visibleRaw = '(尚無資料)';
        }
    } catch(e){ specs.visibleRaw = '(錯誤)'; }

    // 動態細緻度（由 worker 回報）
    try {
        if (accumulatedWaveform && typeof accumulatedWaveform.lastDetail === 'number') {
            var dens = (typeof accumulatedWaveform.lastDensity === 'number') ? accumulatedWaveform.lastDensity : NaN;
            var txt = 'detail=' + accumulatedWaveform.lastDetail.toFixed(2);
            if (isFinite(dens)) txt += ', density=' + dens.toFixed(2) + ' sppx';
            specs.detail = txt;
        } else {
            specs.detail = (typeof dynamicDetailPref !== 'undefined' && dynamicDetailPref) ? '(尚無資料)' : '(已停用)';
        }
    } catch(e){ specs.detail = '(錯誤)'; }

    function updateEl(el,key){
        if (!el) return;
        var val = specs[key];
        if (lastSpecs[key] !== val) {
            el.textContent = val;
            lastSpecs[key] = val;
        }
    }
    updateEl(envEl,'environment');
    updateEl(inputEl,'input');
    updateEl(ctxEl,'audioContext');
    updateEl(recEl,'recorder');
    updateEl(outEl,'output');
    updateEl(decEl,'decimation');
    updateEl(dropEl,'dropout');
    updateEl(visRawEl,'visibleRaw');
    updateEl(detailEl,'detail');
}

// 啟動時先渲染一次基本資訊
document.addEventListener('DOMContentLoaded', function(){
    gatherAndRenderSpecs();
    applyTheme();
    applyOverviewVisibility();
    // 安置迷你音量條並同步寬度
    try { placeMiniLevel(); syncMiniLevelWidth(); } catch(e){}
    // 嘗試列出麥克風
    populateMicDevices();
    // 列出輸出裝置
    populateOutputDevices();
    // 初始化 Mic Gain UI
    var gainSlider = document.getElementById('mic-gain');
    var gainValue = document.getElementById('mic-gain-value');
    if (gainSlider && gainValue) {
        var renderGain = function(){
            var v = parseFloat(gainSlider.value);
            if (!isFinite(v)) v = 1.0;
            micGainUserFactor = Math.min(6, Math.max(1, v));
            gainValue.textContent = micGainUserFactor.toFixed(1) + 'x';
        };
        gainSlider.addEventListener('input', function(){ renderGain(); });
        renderGain();
    }
    // 初始化 預設視窗秒數 UI
    var windowSecInput = document.getElementById('default-window-seconds');
    var windowSecReset = document.getElementById('btn-reset-window-seconds');
    if (windowSecInput) {
        var saved = parseFloat(localStorage.getItem('defaultWindowSeconds'));
        if (isFinite(saved) && saved > 0) {
            defaultWindowSeconds = saved;
            try { windowSecInput.value = String(saved); } catch(e){}
        } else {
            defaultWindowSeconds = 1.0;
        }
        function applyWindowSeconds(v){
            if (!isFinite(v) || v <= 0) v = 1.0;
            v = Math.max(0.1, Math.min(30, v));
            defaultWindowSeconds = v;
            try { windowSecInput.value = String(v); } catch(e){}
            localStorage.setItem('defaultWindowSeconds', String(v));
            showToast('預設視窗已設定為 ' + v.toFixed(1) + ' 秒');
            // 立即更新可視範圍顯示（不強制重繪）
            updateVisibleWindowIndicator();
        }
        windowSecInput.addEventListener('change', function(){
            var v = parseFloat(windowSecInput.value);
            applyWindowSeconds(v);
        });
        if (windowSecReset) {
            windowSecReset.addEventListener('click', function(){ applyWindowSeconds(1.0); });
        }
    }
    // 初次嘗試套用既有輸出裝置偏好
    setTimeout(function(){
        try {
            if (selectedOutDeviceId) applyOutputSink(selectedOutDeviceId);
        } catch(e){}
    }, 500);
});

// 綁定 Overview 與主題切換（第二個 DOMContentLoaded 事件可合併，這裡保持簡潔）
document.addEventListener('DOMContentLoaded', function(){
    var overviewToggle = document.getElementById('toggle-overview');
    if (overviewToggle) {
        try { overviewToggle.checked = !!showOverview; } catch(e){}
        overviewToggle.addEventListener('change', function(){
            showOverview = !!overviewToggle.checked;
            localStorage.setItem('showOverview', String(showOverview));
            applyOverviewVisibility();
            if (accumulatedWaveform) { try { accumulatedWaveform.draw(); } catch(e){} }
            if (overviewWaveform) { try { overviewWaveform.draw(); } catch(e){} }
        });
    }
    var darkToggle = document.getElementById('toggle-dark-mode');
    if (darkToggle) {
        try { darkToggle.checked = (themePref === 'dark'); } catch(e){}
        darkToggle.addEventListener('change', function(){
            themePref = darkToggle.checked ? 'dark' : 'light';
            localStorage.setItem('theme', themePref);
            applyTheme();
        });
    }

    var agProtectToggle = document.getElementById('toggle-auto-gain-protect');
    if (agProtectToggle) {
        try { agProtectToggle.checked = !!autoGainProtect; } catch(e){}
        agProtectToggle.addEventListener('change', function(){
            autoGainProtect = !!agProtectToggle.checked;
            localStorage.setItem('autoGainProtect', String(autoGainProtect));
            showToast('自動降增益保護' + (autoGainProtect ? '已啟用' : '已停用'));
        });
    }
    var clipMarkToggle = document.getElementById('toggle-clip-mark');
    if (clipMarkToggle) {
        try { clipMarkToggle.checked = !!showClipMarks; } catch(e){}
        clipMarkToggle.addEventListener('change', function(){
            showClipMarks = !!clipMarkToggle.checked;
            localStorage.setItem('showClipMarks', String(showClipMarks));
            if (accumulatedWaveform) { try { accumulatedWaveform.draw(); } catch(e){} }
            if (overviewWaveform) { try { overviewWaveform.draw(); } catch(e){} }
        });
    }
    var rawZoomToggle = document.getElementById('toggle-raw-zoom');
    if (rawZoomToggle) {
        try { rawZoomToggle.checked = !!rawZoomPref; } catch(e){}
        rawZoomToggle.addEventListener('change', function(){
            rawZoomPref = !!rawZoomToggle.checked;
            localStorage.setItem('rawZoomMode', String(rawZoomPref));
            if (accumulatedWaveform) { try { accumulatedWaveform.setRawZoomMode(rawZoomPref); } catch(e){} }
        });
    }

    // 動態細緻度切換
    var dynDetailToggle = document.getElementById('toggle-dynamic-detail');
    if (dynDetailToggle) {
        try { dynDetailToggle.checked = !!dynamicDetailPref; } catch(e){}
        dynDetailToggle.addEventListener('change', function(){
            dynamicDetailPref = !!dynDetailToggle.checked;
            localStorage.setItem('dynamicDetailEnabled', String(dynamicDetailPref));
            if (accumulatedWaveform) { try { accumulatedWaveform.draw(); } catch(e){} }
        });
    }

    // 建立自動降增益監視器（僅在錄音期間運行）
    (function initAutoGainProtection(){
        var lastToastClip = 0;
        function loop(){
            try {
                if (autoGainProtect && isCurrentlyRecording && vuMeter && typeof vuMeter.peakDb === 'number' && preGainNode) {
                    // 峰值距 0dBFS 小於 1dB 且增益高於 1.2 時嘗試降增益
                    if (vuMeter.peakDb > -1 && preGainNode.gain.value > 1.2) {
                        preGainNode.gain.value = Math.max(1.0, preGainNode.gain.value - 0.1);
                        showToast('自動降增益為 ' + preGainNode.gain.value.toFixed(2));
                    }
                    // 若最近 2 秒內偵測到 clip，提示使用者手動再降
                    var now = performance.now ? performance.now() : Date.now();
                    if (vuMeter.lastClipTime && (now - vuMeter.lastClipTime) < 2000) {
                        if (now - lastToastClip > 2500) {
                            showToast('偵測到削波，請考慮再降低 Mic Gain');
                            lastToastClip = now;
                        }
                    }
                }
            } catch(e){}
            setTimeout(loop, 300);
        }
        loop();
    })();
});

// 更新「可視範圍秒數」指示
function updateVisibleWindowIndicator(){
    var el = document.getElementById('visible-window-seconds');
    if (!el) return;
    try {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            el.textContent = '-';
            return;
        }
        var effRate = (accumulatedWaveform.sourceSampleRate || (audioContext ? audioContext.sampleRate : 48000)) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
        var vis = accumulatedWaveform.getVisibleSamples();
        var secs = vis > 0 && effRate > 0 ? (vis / effRate) : 0;
        el.textContent = secs.toFixed(2) + 's';
    } catch(e){ try { el.textContent = '-'; } catch(_){} }
}

/*=================================================================
 * 麥克風裝置列舉與切換
 *================================================================*/

function requestMicAccessForListing() {
    // 先短暫要求音訊存取以取得裝置標籤（某些瀏覽器未授權時 labels 為空）
    // 若已經授權過（navigator.permissions 支援）則不再反覆呼叫 getUserMedia 以免顯示狀態列提示
    if (navigator.permissions && navigator.permissions.query) {
        try {
            return navigator.permissions.query({ name: 'microphone' }).then(function(res){
                if (res.state === 'granted') {
                    // 直接返回已解決 Promise，不觸發新的 getUserMedia
                    return Promise.resolve();
                }
                // 未授權或 prompt 才發出一次輕量請求
                return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function(stream){
                    stream.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} });
                }).catch(function(err){ console.warn('Mic access for listing failed:', err); });
            });
        } catch(e){
            // 例外情況回退舊流程
        }
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function(stream){
        stream.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} });
    }).catch(function(err){ console.warn('Mic access for listing failed:', err); });
}

function populateMicDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        // 不支援 enumerateDevices
        if (micSelect) {
            micSelect.innerHTML = '<option>此環境不支援裝置列舉</option>';
            micSelect.disabled = true;
        }
        return;
    }

    // 如果沒有授權，labels 可能為空 — 先嘗試要求一次權限（忽略失敗）
    // 僅在尚未枚舉過或 labels 仍空時才嘗試一次；避免每次 populate 都觸發 iOS 麥克風橙色點顯示
    if (!populateMicDevices._hasEnumeratedOnce) {
        populateMicDevices._hasEnumeratedOnce = true;
        requestMicAccessForListing().finally(enumerate);
    } else {
        enumerate();
    }

    function enumerate(){
        navigator.mediaDevices.enumerateDevices().then(function(devices){
            var mics = devices.filter(function(d){ return d.kind === 'audioinput'; });
            if (!micSelect) return;
            micSelect.innerHTML = '';
            if (!mics.length) {
                micSelect.innerHTML = '<option>未偵測到麥克風</option>';
                micSelect.disabled = true;
                var hint = document.getElementById('mic-hint');
                if (hint) hint.textContent = '請確認裝置連線或授權狀態。';
                return;
            }
            micSelect.disabled = false;
            var foundPreferred = false;
            mics.forEach(function(mic, idx){
                var opt = document.createElement('option');
                opt.value = mic.deviceId || '';
                var label = mic.label || ('Microphone ' + (idx+1));
                opt.textContent = label;
                micSelect.appendChild(opt);
                if (selectedMicDeviceId && mic.deviceId === selectedMicDeviceId) {
                    foundPreferred = true;
                    micSelect.value = mic.deviceId;
                }
            });
            if (!foundPreferred) {
                // 若未找到先前偏好，預設第一個
                selectedMicDeviceId = mics[0].deviceId || '';
                micSelect.value = selectedMicDeviceId;
                localStorage.setItem(preferredMicKey, selectedMicDeviceId);
            }
        }).catch(function(err){
            console.warn('enumerateDevices failed:', err);
            if (micSelect) {
                micSelect.innerHTML = '<option>需授權才能列出裝置</option>';
                micSelect.disabled = true;
            }
        });
    }
}

function populateOutputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        if (spkSelect) {
            spkSelect.innerHTML = '<option>此環境不支援輸出裝置列舉</option>';
            spkSelect.disabled = true;
        }
        return;
    }
    function enumerate(){
        navigator.mediaDevices.enumerateDevices().then(function(devices){
            var outs = devices.filter(function(d){ return d.kind === 'audiooutput'; });
            if (!spkSelect) return;
            spkSelect.innerHTML = '';
            // Default option
            var optDef = document.createElement('option');
            optDef.value = 'default';
            optDef.textContent = '系統預設輸出 (Default)';
            spkSelect.appendChild(optDef);
            if (!outs.length) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '未偵測到輸出裝置';
                spkSelect.appendChild(opt);
                spkSelect.disabled = true;
                var hint = document.getElementById('spk-hint');
                if (hint) hint.textContent = '可能需要授權或此瀏覽器不支援設定輸出裝置。';
                return;
            }
            spkSelect.disabled = false;
            outs.forEach(function(d, idx){
                var opt = document.createElement('option');
                opt.value = d.deviceId || '';
                var label = d.label || ('Speaker ' + (idx+1));
                opt.textContent = label;
                spkSelect.appendChild(opt);
            });
            // restore selection
            try {
                if (selectedOutDeviceId) spkSelect.value = selectedOutDeviceId;
            } catch(e){}
        }).catch(function(err){
            console.warn('enumerateDevices for outputs failed:', err);
            if (spkSelect) {
                spkSelect.innerHTML = '<option>需授權或瀏覽器不支援</option>';
                spkSelect.disabled = true;
            }
        });
    }
    // 若從未授權，labels 可能為空 — 共用 mic 權限流程以取得 labels
    if (!populateOutputDevices._hasEnumeratedOnce) {
        populateOutputDevices._hasEnumeratedOnce = true;
        requestMicAccessForListing().finally(enumerate);
    } else {
        enumerate();
    }
}

function applyOutputSink(deviceId) {
    var audioEl = audio || document.querySelector('audio');
    if (!audioEl) return;
    if (typeof audioEl.setSinkId !== 'function') {
        var hint = document.getElementById('spk-hint');
        if (hint) hint.textContent = '此瀏覽器不支援切換輸出裝置';
        return;
    }
    if (!deviceId) deviceId = 'default';
    audioEl.setSinkId(deviceId).then(function(){
        var hint = document.getElementById('spk-hint');
        if (hint) hint.textContent = '已套用輸出裝置: ' + (deviceId==='default'?'系統預設':deviceId);
    }).catch(function(err){
        console.warn('setSinkId 失敗', err);
        var hint = document.getElementById('spk-hint');
        if (hint) hint.textContent = '套用輸出裝置失敗: ' + (err && err.message ? err.message : err);
    });
}

if (micSelect) {
    micSelect.addEventListener('change', function(){
        var newId = micSelect.value || '';
        if (isCurrentlyRecording) {
            alert('請先停止錄音後再切換麥克風');
            // 還原選取
            micSelect.value = selectedMicDeviceId || '';
            return;
        }
        selectedMicDeviceId = newId;
        localStorage.setItem(preferredMicKey, selectedMicDeviceId);
        showToast('下次錄音將使用此麥克風');
        gatherAndRenderSpecs();
    });
}

if (spkSelect) {
    spkSelect.addEventListener('change', function(){
        var newOut = spkSelect.value || 'default';
        selectedOutDeviceId = newOut;
        localStorage.setItem(preferredOutKey, selectedOutDeviceId);
        applyOutputSink(selectedOutDeviceId);
    });
}

if (btnRefreshMics) {
    btnRefreshMics.addEventListener('click', function(){
        populateMicDevices();
    });
}
if (btnRefreshSpks) {
    btnRefreshSpks.addEventListener('click', function(){
        populateOutputDevices();
        // 重新整理後嘗試套用現有偏好
        setTimeout(function(){
            try { if (selectedOutDeviceId) applyOutputSink(selectedOutDeviceId); } catch(e){}
        }, 300);
    });
}

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', function(){
        populateMicDevices();
        populateOutputDevices();
        // 裝置變動時若偏好仍存在嘗試重套用
        setTimeout(function(){
            try { if (selectedOutDeviceId) applyOutputSink(selectedOutDeviceId); } catch(e){}
        }, 400);
    });
}

// 區域選取相關變數
var selectionStart = null;        // 選取起始樣本索引
var selectionEnd = null;          // 選取結束樣本索引
var selectionAudioSource = null;  // 用於播放選取區域的音頻源
var accumulatedControls = {
    zoomIn: document.getElementById('accum-zoom-in'),
    zoomOut: document.getElementById('accum-zoom-out'),
    zoomReset: document.getElementById('accum-zoom-reset'),
    panLeft: document.getElementById('accum-pan-left'),
    panRight: document.getElementById('accum-pan-right'),
    toolbar: document.getElementById('accumulated-toolbar')
};

/**
 * 切換累積波形工具列的啟用狀態
 * @param {boolean} enabled - 是否啟用
 */
function setAccumulatedControlsEnabled(enabled) {
    var buttons = [
        accumulatedControls.zoomIn,
        accumulatedControls.zoomOut,
        accumulatedControls.zoomReset,
        accumulatedControls.panLeft,
        accumulatedControls.panRight
    ];

    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i]) {
            buttons[i].disabled = !enabled;
        }
    }

    if (accumulatedControls.toolbar) {
        accumulatedControls.toolbar.style.opacity = enabled ? '1' : '0.6';
    }
}

setAccumulatedControlsEnabled(false);

/**
 * 更新播放控制按鈕的啟用/停用狀態
 */
function updatePlaybackButtonsState() {
    if (!btnPlay || !btnPause || !btnStopPlayback) return;

    // 錄音期間，全部停用
    if (isCurrentlyRecording) {
        btnPlay.disabled = true;
        btnPause.disabled = true;
        btnStopPlayback.disabled = true;
        if (btnClearSelection) btnClearSelection.disabled = true;
        if (btnJumpStart) btnJumpStart.disabled = true;
        return;
    }

    // 尚無錄音可播
    if (!latestRecordingBlob) {
        btnPlay.disabled = true;
        btnPause.disabled = true;
        btnStopPlayback.disabled = true;
        if (btnClearSelection) btnClearSelection.disabled = (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd);
        if (btnJumpStart) btnJumpStart.disabled = true;
        return;
    }

    // 正在播放
    if (selectionAudioSource && accumulatedWaveform && accumulatedWaveform.isPlaying) {
        btnPlay.disabled = true;
        btnPause.disabled = false;
        btnStopPlayback.disabled = false;
        if (btnClearSelection) btnClearSelection.disabled = (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd);
        if (btnJumpStart) btnJumpStart.disabled = false;
        return;
    }

    // 已暫停或可待播
    btnPlay.disabled = false;
    btnPause.disabled = true;
    // 若有播放位置或選取，允許停止將位置重置；否則無動作意義
    var canStop = !!(accumulatedWaveform && (accumulatedWaveform.playbackPosition > 0 || (selectionStart !== null && selectionEnd !== null)));
    btnStopPlayback.disabled = !canStop;
    if (btnClearSelection) btnClearSelection.disabled = (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd);
    if (btnJumpStart) btnJumpStart.disabled = !(accumulatedWaveform && accumulatedWaveform.playbackPosition > 0);
}

// 初始化時更新一次按鈕狀態
updatePlaybackButtonsState();

/*=================================================================
 * 初始化 Web Audio API
 * 在用戶互動後初始化 AudioContext 和 Analyser
 *================================================================*/

/**
 * 初始化 Web Audio API 組件
 * 確保 AudioContext 在用戶互動後被創建
 * @returns {Promise} 返回 Promise，確保 AudioContext 完全就緒
 */
function initializeAudioContext() {
    if (!audioContext) {
        // 創建 AudioContext
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 創建分析器
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // 設定 FFT 大小

        // 將 analyser 提供給 VU Meter（若已建立）
        if (vuMeter) {
            vuMeter.analyser = analyser;
        }

        // 為了讓音訊節點圖保有出口，避免回授的同時保持數據流
        // 建立前級增益與 MediaStreamDestination（供後續串接與錄音使用）
        preGainNode = audioContext.createGain();
        preGainNode.gain.value = 1.0;
        mediaDest = audioContext.createMediaStreamDestination();

        // 將前級增益輸出到 analyser 與 MediaStreamDestination
    preGainNode.connect(analyser);
    preGainNode.connect(mediaDest);

        analyserSilencer = audioContext.createGain();
        analyserSilencer.gain.value = 0;
        analyser.connect(analyserSilencer);
        analyserSilencer.connect(audioContext.destination);

        // 嘗試載入 AudioWorklet
        workletSupported = !!(audioContext.audioWorklet && window.AudioWorkletNode);
        if (workletSupported) {
            audioContext.audioWorklet.addModule('assets/js/worklet/pcm-collector.js').then(function(){
                workletLoaded = true;
            }).catch(function(err){
                console.warn('載入 AudioWorklet 模組失敗，將回退到 RecordRTC:', err);
                workletLoaded = false;
            });
        }
    }
    
    // 如果 AudioContext 處於暫停狀態，嘗試恢復並返回 Promise
    if (audioContext.state === 'suspended') {
        return audioContext.resume().catch(function(err) {
            console.warn('Unable to resume AudioContext:', err);
        });
    }
    
    // AudioContext 已經是 running 狀態，返回已解決的 Promise
    return Promise.resolve();
}

/*=================================================================
 * LiveWaveform 類 - 即時波形顯示
 * 使用 Canvas 和 AnalyserNode 實現錄音時的即時波形顯示
 *================================================================*/

/**
 * LiveWaveform 類構造函數
 * @param {HTMLCanvasElement} canvas - 用於繪製波形的 Canvas 元素
 * @param {AnalyserNode} analyserNode - 用於擷取音訊資料的分析器
 */
function LiveWaveform(canvas, analyserNode) {
    this.canvas = canvas;                            // Canvas 元素
    this.canvasContext = canvas.getContext('2d');    // Canvas 2D 上下文
    this.analyser = analyserNode;                    // 分析器節點
    this.mediaStreamSource = null;                   // 麥克風來源節點
    this.animationId = null;                         // 動畫幀 ID
    this.isRunning = false;                          // 是否正在運行

    // Canvas 尺寸
    this.width = canvas.width;
    this.height = canvas.height;

    // 延遲設定 FFT 參數，等到 start() 被調用時再設定
    this.bufferLength = 0;
    this.dataArray = null;
    
    // 振幅放大倍率（用於顯示微弱訊號）
    this.amplification = 3.0;

    // 垂直模式暫存：保留最近一個繪製的資料，用於滾動繪製優化
    this._lastDataArray = null;
    this._verticalScrollOffset = 0; // 累積的垂直滾動偏移（像素）
}

/* ================================================================
 * VUMeter 類 - 即時音量 (RMS/Peak) 顯示
 * - 計算 RMS 與 Peak，轉換為 dB 值 (-60dB ~ 0dB)
 * - 提供 peak hold 功能：峰值維持一段時間後緩降
 * - 支援水平與垂直模式的固定寬高繪製
 * ================================================================ */
function VUMeter(canvas, analyserNode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyserNode;
    this.bufferLength = 2048; // 初始緩衝大小；會依 analyser 動態調整
    this.timeData = new Float32Array(this.bufferLength); // 使用 float 格式，範圍約 [-1.0, 1.0]
    this.levelDb = -90;       // 目前 RMS dBFS
    this.peakDb = -90;        // 目前峰值 dBFS
    this.holdPeakDb = -90;    // Peak hold 顯示值 (dBFS)
    this.lastPeakTime = 0;    // 最近一次更新峰值的時間戳
    this.peakHoldMillis = 1500; // 峰值保持時間
    this.fallRateDbPerSec = 20; // 峰值下降速度 (dB/s)
    this.minDb = -90;         // dBFS 最低顯示範圍
    this.maxDb = 0;
    this.animationId = null;
    this.lastClipTime = 0;     // 最近一次偵測到 clip 的時間
    this.clipHoldMillis = 2000;// CLIP 指示保留時間
}

VUMeter.prototype._computeLevels = function() {
    if (!this.analyser) return { rmsDb: this.minDb, peakDb: this.minDb };
    // 確保緩衝大小與 analyser 同步
    var required = this.analyser.fftSize || this.bufferLength;
    if (this.timeData.length !== required) {
        this.bufferLength = required;
        this.timeData = new Float32Array(required);
    }
    // 讀取浮點時域資料（-1.0 ~ 1.0）
    this.analyser.getFloatTimeDomainData(this.timeData);
    var sumSquares = 0;
    var peak = 0;
    var clipped = false;
    for (var i = 0; i < this.bufferLength; i++) {
        var v = this.timeData[i];
        if (v > 1) v = 1; else if (v < -1) v = -1; // 夾限避免異常
        sumSquares += v * v;
        var absV = Math.abs(v);
        if (absV > peak) peak = absV;
        if (absV >= 0.995) clipped = true;
    }
    var rms = Math.sqrt(sumSquares / this.bufferLength);
    // 轉 dB：20 * log10(rms)，避免 log(0)
    var rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    var peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    if (rmsDb < this.minDb) rmsDb = this.minDb;
    if (rmsDb > this.maxDb) rmsDb = this.maxDb;
    if (peakDb < this.minDb) peakDb = this.minDb;
    if (peakDb > this.maxDb) peakDb = this.maxDb;
    if (clipped) { this.lastClipTime = performance.now ? performance.now() : Date.now(); }
    return { rmsDb: rmsDb, peakDb: peakDb };
};

VUMeter.prototype.resize = function() {
    // 可在模式切換後呼叫，這裡僅確保清除
    this.clear();
};

VUMeter.prototype.clear = function() {
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
};

VUMeter.prototype.draw = function(currentDb) {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    // 背景
    ctx.clearRect(0,0,w,h);
    var grd = ctx.createLinearGradient(0,0,w,0);
    grd.addColorStop(0,'#2d3748');
    grd.addColorStop(1,'#1a202c');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,w,h);

    // 將 dB 對應到 0~1
    var norm = (currentDb - this.minDb) / (this.maxDb - this.minDb);
    if (norm < 0) norm = 0; if (norm > 1) norm = 1;

    // 彩色漸層 (綠->黃->紅)
    var barGrad = ctx.createLinearGradient(0,0,w,0);
    barGrad.addColorStop(0,'#38a169');
    barGrad.addColorStop(0.6,'#d69e2e');
    barGrad.addColorStop(0.85,'#dd6b20');
    barGrad.addColorStop(1,'#c53030');
    ctx.fillStyle = barGrad;
    var barWidth = Math.round(w * norm);
    ctx.fillRect(0,0,barWidth,h);

    // 刻度線與標籤 (每10dB一線、每20dB一文字) 以 dBFS (minDb 到 maxDb)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var db = this.minDb; db <= this.maxDb; db += 10) {
        var posNorm = (db - this.minDb) / (this.maxDb - this.minDb);
        if (posNorm < 0) posNorm = 0; if (posNorm > 1) posNorm = 1;
        var xPos = Math.round(w * posNorm) + 0.5;
        // 高亮 0dBFS 主線
        if (db === 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.moveTo(xPos,0); ctx.lineTo(xPos,h); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        } else {
            ctx.moveTo(xPos,0); ctx.lineTo(xPos,h*0.4);
            ctx.moveTo(xPos,h); ctx.lineTo(xPos,h*0.6);
        }
        // 文字標籤每20dB顯示，且 0 / -10 特殊顏色
        if (db % 20 === 0 || db === -10) {
            var label = db.toString();
            ctx.fillStyle = (db === 0) ? '#ffffff' : (db === -10 ? '#ffeb3b' : '#cbd5e0');
            ctx.font = '10px -apple-system,Segoe UI,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, xPos, 1);
        }
    }
    ctx.restore();

    // -10dBFS 區域高亮（半透明覆蓋）
    var minus10Norm = (-10 - this.minDb) / (this.maxDb - this.minDb);
    if (minus10Norm > 0 && minus10Norm < 1) {
        var minus10X = Math.round(w * minus10Norm);
        ctx.save();
        ctx.fillStyle = 'rgba(255,235,59,0.08)';
        ctx.fillRect(minus10X - 2,0,4,h);
        ctx.restore();
    }

    // 峰值 hold 指示線
    var holdNorm = (this.holdPeakDb - this.minDb) / (this.maxDb - this.minDb);
    if (holdNorm < 0) holdNorm = 0; if (holdNorm > 1) holdNorm = 1;
    var holdX = Math.round(w * holdNorm);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(holdX + 0.5,0);
    ctx.lineTo(holdX + 0.5,h);
    ctx.stroke();

    // 文字顯示 (RMS dB / Peak dB)
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 12px -apple-system,Segoe UI,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var displayRms = currentDb <= this.minDb ? '-∞' : currentDb.toFixed(1);
    var displayPeak = this.peakDb <= this.minDb ? '-∞' : this.peakDb.toFixed(1);
    var txt = 'RMS ' + displayRms + ' dBFS   Peak ' + displayPeak + ' dBFS';
    ctx.fillText(txt, 8, h/2);

    // CLIP 指示：最近 clip 於 2 秒內
    try {
        var now = performance.now ? performance.now() : Date.now();
        if (this.lastClipTime && (now - this.lastClipTime) < this.clipHoldMillis) {
            ctx.save();
            ctx.fillStyle = '#B00020';
            var badgeW = 42, badgeH = 18;
            ctx.fillRect(w - badgeW - 8, 4, badgeW, badgeH);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px -apple-system,Segoe UI,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CLIP', w - badgeW/2 - 8, 4 + badgeH/2 + 0.5);
            ctx.restore();
        }
    } catch(e){}
};

VUMeter.prototype.update = function() {
    var levels = this._computeLevels();
    this.levelDb = levels.rmsDb;
    this.peakDb = levels.peakDb;

    // 臨時調試：每秒記錄一次
    if (!this._lastLogTime) this._lastLogTime = 0;
    var now = performance.now();
    if (now - this._lastLogTime > 1000) {
        console.log('[VU Meter Debug] RMS:', this.levelDb.toFixed(1), 'dB, Peak:', this.peakDb.toFixed(1), 'dB, animationId:', this.animationId);
        this._lastLogTime = now;
    }

    // 更新 peak hold
    if (this.peakDb > this.holdPeakDb + 0.5) { // 新峰值（加點 hysteresis）
        this.holdPeakDb = this.peakDb;
        this.lastPeakTime = now;
    } else {
        // 若超過保持時間，開始下降
        var elapsed = now - this.lastPeakTime;
        if (elapsed > this.peakHoldMillis) {
            var fallSeconds = (elapsed - this.peakHoldMillis) / 1000;
            var fallAmount = this.fallRateDbPerSec * fallSeconds;
            this.holdPeakDb = Math.max(this.peakDb, this.holdPeakDb - fallAmount);
        }
    }
    this.draw(this.levelDb);
    // 同步更新核心區迷你條
    updateMiniLevelBar(this.levelDb, this.peakDb);
};

VUMeter.prototype.start = function() {
    // 先停止舊的動畫循環（如果有的話）
    this.stop();
    
    // 確保 buffer 大小與 analyser 同步
    if (this.analyser) {
        var required = this.analyser.fftSize || 2048;
        if (this.timeData.length !== required) {
            this.bufferLength = required;
            this.timeData = new Float32Array(required);
        }
    }
    
    var self = this;
    function loop(){
        self.update();
        self.animationId = requestAnimationFrame(loop);
    }
    loop(); // 無條件啟動新的循環
};

VUMeter.prototype.stop = function() {
    if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }
    this.clear();
};

/**
 * 開始即時波形顯示
 * 連接到麥克風流並開始繪製波形
 * @param {MediaStream} stream - 麥克風媒體流
 */
LiveWaveform.prototype.start = function(stream) {
    if (this.isRunning || !audioContext || !this.analyser) {
        return;
    }

    this.isRunning = true;
    
    var self = this;

    // 確保 AudioContext 處於運行狀態
    var contextReady = Promise.resolve();
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

        // 連接麥克風到前級增益，再送往 analyser/MediaStreamDestination
        self.mediaStreamSource = audioContext.createMediaStreamSource(stream);
        if (preGainNode) {
            try { self.mediaStreamSource.connect(preGainNode); } catch(e) { console.warn('connect preGainNode failed', e); }
        } else {
            // 後援：直接接到 analyser（理論上不會走到這裡）
            self.mediaStreamSource.connect(self.analyser);
        }

        // 設定 FFT 參數（在連接之後）
        self.analyser.fftSize = 1024;
        self.bufferLength = self.analyser.fftSize;
        self.dataArray = new Uint8Array(self.bufferLength);

        // 立即開始繪製，不需要延遲
        self.draw();
    });
};

/**
 * 停止即時波形顯示
 * 停止繪製並清理資源
 */
LiveWaveform.prototype.stop = function() {
    if (!this.isRunning) return; // 如果沒有在運行，直接返回
    
    this.isRunning = false;
    
    if (this.mediaStreamSource) {
        this.mediaStreamSource.disconnect();
        this.mediaStreamSource = null;
    }

    // 取消動畫幀
    if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }
    
    // 清空 Canvas
    this.canvasContext.clearRect(0, 0, this.width, this.height);
};

/**
 * 繪製波形
 * 使用 requestAnimationFrame 持續更新波形顯示
 */
LiveWaveform.prototype.draw = function() {
    if (!this.isRunning || !this.analyser || !this.dataArray) {
        return;
    }

    this.animationId = requestAnimationFrame(this.draw.bind(this));

    this.analyser.getByteTimeDomainData(this.dataArray); // 取得時域資料
    // 推進 VU Meter（若存在），以即時資料計算等級
    if (vuMeter && typeof vuMeter.update === 'function') {
        // 若 VU meter 有綁 analyser，就讓它自行讀取；否則這裡也可擴充成傳遞 dataArray。
        vuMeter.update();
    }

    if (!orientationManager.isVertical()) {
        // 水平模式：與原本相同
        this.canvasContext.fillStyle = '#f0f0f0';
        this.canvasContext.fillRect(0, 0, this.width, this.height);

        // 中央基準線讓波形視覺上置中
        this.canvasContext.strokeStyle = '#d0d0d0';
        this.canvasContext.lineWidth = 1;
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(0, this.height / 2);
        this.canvasContext.lineTo(this.width, this.height / 2);
        this.canvasContext.stroke();

        this.canvasContext.lineWidth = 2;
        this.canvasContext.strokeStyle = '#4CAF50';
        this.canvasContext.beginPath();

        var sliceWidth = this.width / this.bufferLength;
        var x = 0;
        var centerY = this.height / 2;

        for (var i = 0; i < this.bufferLength; i++) {
            var normalized = (this.dataArray[i] - 128) / 128.0; // 將數值轉為 -1 到 1
            normalized = normalized * this.amplification;      // 放大
            if (normalized > 1) normalized = 1; else if (normalized < -1) normalized = -1;
            var y = centerY + normalized * centerY;
            if (i === 0) {
                this.canvasContext.moveTo(x, y);
            } else {
                this.canvasContext.lineTo(x, y);
            }
            x += sliceWidth;
        }
        this.canvasContext.stroke();
    } else {
        // 垂直模式：時間向下延伸，新樣本在下方。
        // 策略：整個畫布往上平移一行高度，再在底部繪製最新波形橫條。
        var ctx = this.canvasContext;
        var w = this.width;
        var h = this.height;
        var centerX = w / 2;
        // 計算本次波形的「條帶高度」，取決於 bufferLength vs width。這裡直接使用 1 像素，簡化呈現並保證平滑滾動。
        var bandHeight = 1; // 每次更新下移 1px

        // 使用 drawImage 將既有內容整體上移（避免昂貴的 getImageData/putImageData 讀回）
        // 將畫布自身作為來源，來源區域從 y=bandHeight 到底，繪製到 y=0
        ctx.drawImage(this.canvas, 0, bandHeight, w, h - bandHeight, 0, 0, w, h - bandHeight);
        // 填底部背景
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, h - bandHeight, w, bandHeight);

        // 在底部畫中心基準線（僅當 bandHeight 足夠時，或每 N 幀畫一次）
        // 這裡簡化：每 40 條畫一次灰線，避免過度密集
        this._verticalScrollOffset = (this._verticalScrollOffset + bandHeight) % 40;
        if (this._verticalScrollOffset === 0) {
            ctx.strokeStyle = '#d0d0d0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h - bandHeight - 0.5);
            ctx.lineTo(w, h - bandHeight - 0.5);
            ctx.stroke();
        }

        // 在底部繪製最新波形（水平線條）
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#4CAF50';
        ctx.beginPath();
        var sliceH = w / this.bufferLength; // 按寬度分配樣本
        var xPos = 0;
        var baselineY = h - Math.floor(bandHeight / 2) - 0.5; // 波形基準線位置
        var amplitudeScale = (bandHeight / 2) || 0.5; // 在 1px 高度時會非常小，純粹顏色線條視覺；可擴充 bandHeight 調整細節
        for (var k = 0; k < this.bufferLength; k++) {
            var norm = (this.dataArray[k] - 128) / 128.0;
            norm *= this.amplification;
            if (norm > 1) norm = 1; else if (norm < -1) norm = -1;
            var dx = xPos;
            var dy = baselineY - norm * amplitudeScale; // 垂直位移
            if (k === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
            xPos += sliceH;
        }
        ctx.stroke();

        // 在最左側加一條淡淡的分隔線，幫助視覺定位（可選）
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.beginPath();
        ctx.moveTo(0, h - bandHeight);
        ctx.lineTo(0, h);
        ctx.stroke();
    }
};

/*=================================================================
 * AccumulatedWaveform 類 - 累積音訊波形顯示
 * 持續繪製目前錄製完成的音訊波形，方便觀察整體振幅分佈
 *================================================================*/

/**
 * AccumulatedWaveform 類構造函數
 * @param {HTMLCanvasElement} canvas - 用於繪製累積波形的 Canvas 元素
 */
function AccumulatedWaveform(canvas) {
    this.canvas = canvas;
    this.canvasContext = null;  // 延遲初始化，先嘗試 OffscreenCanvas
    this.width = canvas.width;
    this.height = canvas.height;

    this.targetSampleRate = 5000;          // 目標採樣率，控制記憶體使用量
    this.sourceSampleRate = 48000;         // 預設來源採樣率
    this.decimationFactor = 10;            // 預設下采樣倍率

    this.sampleMin = [];                   // 累積區段的最小值（動態增長）
    this.sampleMax = [];                   // 累積區段的最大值（動態增長）
    this.sampleCount = 0;                  // 目前緩衝內的有效樣本數

    this.zoomFactor = 1;                   // 目前縮放倍率（1 代表完整視圖）
    this.viewStart = 0;                    // 可視範圍起始樣本索引
    this.isAutoScroll = true;              // 是否自動捲動到最新資料
    this._panRemainder = 0;                // 平滑平移時的殘餘樣本量
    
    // 播放位置相關
    this.playbackPosition = 0;             // 當前播放位置（樣本索引）
    this.isPlaying = false;                // 是否正在播放
    this.playbackStartTime = 0;            // 播放開始時間戳記
    this.playbackStartSample = 0;          // 播放開始的樣本位置

    // Raw 視窗縮放模式（以原始樣本為單位）
    this.rawZoomMode = false;              // 是否使用 raw-sample 視窗座標
    this.rawViewStart = 0;                 // 原始樣本座標的視窗起點
    this.rawVisibleRaw = 0;                // 原始樣本座標的視窗長度（raw samples）

    // OffscreenCanvas + Worker 繪圖（可用時啟用）
    this._useWorker = false;
    this._worker = null;
    this._appendBatchMin = [];
    this._appendBatchMax = [];
    this._appendFlushScheduled = false;
    
    // 嘗試使用 OffscreenCanvas + Worker
    // 注意：canvas.transferControlToOffscreen() 只能在 canvas 沒有 rendering context 時呼叫一次
    if (canvas.transferControlToOffscreen && window.Worker) {
        try {
            var off = canvas.transferControlToOffscreen();
            this._worker = new Worker('assets/js/wf-worker.js');
            this._useWorker = true;
            var isV = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
            this._worker.postMessage({
                type: 'init',
                canvas: off,
                width: this.width,
                height: this.height,
                verticalMode: !!isV,
                showClipMarks: !!showClipMarks,
                sourceSampleRate: this.sourceSampleRate,
                decimationFactor: this.decimationFactor
            }, [off]);
            // 監聽 worker 回報的細緻度
            var self = this;
            this._worker.onmessage = function(ev){
                var msg = ev.data;
                if (!msg) return;
                if (msg.type === 'detailUpdate') {
                    self.lastDetail = msg.detail;
                    self.lastDensity = msg.density;
                    // 若規格面板存在，更新顯示
                    try { gatherAndRenderSpecs(); } catch(e){}
                }
            };
        } catch(e) { 
            // transferControlToOffscreen 失敗（可能 canvas 已有 context 或已轉移），回退到主執行緒繪圖
            this._useWorker = false;
        }
    }
    
    // 如果沒有使用 Worker，嘗試獲取 2D context
    if (!this._useWorker) {
        try {
            this.canvasContext = canvas.getContext('2d');
        } catch(e) {
            // Canvas 已轉移控制權，無法獲取 context
            // 這種情況下無法進行主執行緒繪圖，保持 canvasContext 為 null
            console.warn('無法獲取 canvas context（canvas 已轉移控制權），波形繪製將被跳過');
        }
    }
    
    this.clear();
    setAccumulatedControlsEnabled(false);
}

/**
 * 清空畫布並重繪基準線
 */
AccumulatedWaveform.prototype.clear = function() {
    if (this._useWorker && this._worker) {
        this._worker.postMessage({ type: 'reset' });
        return;
    }
    if (!this.canvasContext) return; // 如果沒有 context 就跳過
    this.canvasContext.clearRect(0, 0, this.width, this.height);
    this.canvasContext.fillStyle = '#f0f0f0';
    this.canvasContext.fillRect(0, 0, this.width, this.height);
    this.canvasContext.lineWidth = 1;
    this.canvasContext.strokeStyle = '#d0d0d0';
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(0, this.height / 2);
    this.canvasContext.lineTo(this.width, this.height / 2);
    this.canvasContext.stroke();
};

/**
 * 重置累積資訊
 */
AccumulatedWaveform.prototype.reset = function() {
    this.sampleMin.length = 0;
    this.sampleMax.length = 0;
    this.sampleCount = 0;
    this.zoomFactor = 1;
    this.viewStart = 0;
    this.isAutoScroll = true;
    this._panRemainder = 0;
    this.clear();
    setAccumulatedControlsEnabled(false);
};

/**
 * 增加新的音訊取樣資料並重新繪製
 * @param {Float32Array} audioSamples - 新的音訊資料
 */
AccumulatedWaveform.prototype.append = function(audioSamples) {
    if (!audioSamples || !audioSamples.length) {
        return;
    }

    var factor = this.decimationFactor;
    var total = audioSamples.length;
    var appendedMin = [];
    var appendedMax = [];
    for (var i = 0; i < total; i += factor) {
        var blockMin = 1.0;
        var blockMax = -1.0;
        var blockSum = 0;
        var blockCount = 0;

        for (var j = 0; j < factor && (i + j) < total; j++) {
            var sample = audioSamples[i + j];
            blockSum += sample;
            blockCount++;
        }

        var blockMean = blockCount ? (blockSum / blockCount) : 0;

        for (var k = 0; k < blockCount; k++) {
            var centeredSample = audioSamples[i + k] - blockMean;
            if (centeredSample < blockMin) {
                blockMin = centeredSample;
            }
            if (centeredSample > blockMax) {
                blockMax = centeredSample;
            }
        }

        if (!blockCount) {
            continue;
        }

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

    if (this.sampleCount > 0) {
        setAccumulatedControlsEnabled(true);
    }

    if (this._useWorker && this._worker) {
        // 批次聚合以減少 postMessage 次數
        this._appendBatchMin.push(appendedMin);
        this._appendBatchMax.push(appendedMax);
        if (!this._appendFlushScheduled) {
            this._appendFlushScheduled = true;
            var self = this;
            var flush = function(){ self._flushAppendBatch(); };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
            else setTimeout(flush, 32);
        }
    }
    this.draw();
};

AccumulatedWaveform.prototype._flushAppendBatch = function(){
    if (!this._useWorker || !this._worker) { this._appendFlushScheduled = false; this._appendBatchMin.length=0; this._appendBatchMax.length=0; return; }
    var batchesMin = this._appendBatchMin.splice(0);
    var batchesMax = this._appendBatchMax.splice(0);
    this._appendFlushScheduled = false;
    var totalLen = 0;
    for (var i=0;i<batchesMin.length;i++){ totalLen += batchesMin[i].length; }
    if (totalLen === 0) return;
    var minBuf = new Float32Array(totalLen);
    var maxBuf = new Float32Array(totalLen);
    var off = 0;
    for (var j=0;j<batchesMin.length;j++){
        var a = batchesMin[j]; var b = batchesMax[j];
        if (!a || !b) continue;
        minBuf.set(a, off);
        maxBuf.set(b, off);
        off += a.length;
    }
    try {
        this._worker.postMessage({ type:'append', minBlocks: minBuf, maxBlocks: maxBuf }, [minBuf.buffer, maxBuf.buffer]);
    } catch(e){
        this._worker.postMessage({ type:'append', minBlocks: Array.from(minBuf), maxBlocks: Array.from(maxBuf) });
    }
};

/**
 * 繪製累積波形
 */
AccumulatedWaveform.prototype.draw = function() {
    if (this._useWorker && this._worker) {
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        var vis = this.getVisibleSamples();
        // 若為 raw 模式，同步 decimated 視窗以利 worker 與 overview 指示
        if (this.rawZoomMode) {
            var dec = Math.max(1, this.decimationFactor||1);
            this.viewStart = Math.floor(this.rawViewStart / dec);
            // 重新計算 zoomFactor 對應目前 dec 視窗
            var visDec = Math.max(1, Math.round(this.rawVisibleRaw / dec));
            if (visDec > this.sampleCount) visDec = this.sampleCount;
            this.zoomFactor = this.sampleCount / visDec;
            vis = visDec;
        }
        // 防呆：避免傳入非有限 zoom 或 0 可視樣本導致 worker 計算出錯
        if (!isFinite(this.zoomFactor) || this.zoomFactor <= 0) {
            this.zoomFactor = Math.max(1, this.sampleCount || 1);
        }
        if (!isFinite(vis) || vis < 1) vis = 1;
        // 動態細緻度所需資訊：可視原始樣本數與 DPR
        var effDec = Math.max(1, this.decimationFactor || 1);
        var visibleRaw = this.rawZoomMode ? Math.max(1, Math.floor(this.rawVisibleRaw || 1)) : Math.max(1, Math.floor(vis * effDec));
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        var msg = {
            type: 'draw',
            zoomFactor: this.zoomFactor,
            viewStart: this.viewStart,
            verticalMode: !!isVertical,
            showClipMarks: !!showClipMarks,
            visibleSamples: vis,
            playbackPosition: this.playbackPosition,
            selectionStart: selectionStart,
            selectionEnd: selectionEnd,
            // 動態細緻度參數
            visibleRaw: visibleRaw,
            dpr: dpr,
            dynamicDetailEnabled: !!dynamicDetailPref
        };
        // 在最高倍放大時，若可使用 Worklet 的原始 PCM，附帶該視窗的原始樣本供高解析度描繪
        try {
            if (usingWorklet && pcmTotalSamples > 0 && typeof getPcmWindow === 'function') {
                var startOrig = this.rawZoomMode ? Math.max(0, Math.floor(this.rawViewStart)) : Math.max(0, Math.floor(this.viewStart * this.decimationFactor));
                var countOrig = this.rawZoomMode ? Math.max(1, Math.floor(this.rawVisibleRaw)) : Math.max(1, Math.floor(vis * this.decimationFactor));
                // 控制安全上限（避免一次傳太多樣本）
                var primaryPixels = isVertical ? this.height : this.width;
                var maxOrig = Math.max(primaryPixels * 4, 4096);
                if (countOrig <= maxOrig) {
                    var raw = getPcmWindow(startOrig, countOrig);
                    if (raw && raw.length) {
                        msg.rawPcm = raw;
                    }
                }
            }
        } catch(e) {}
        if (msg.rawPcm && msg.rawPcm.buffer) {
            try { this._worker.postMessage(msg, [msg.rawPcm.buffer]); }
            catch(_){ this._worker.postMessage(msg); }
        } else {
            this._worker.postMessage(msg);
        }
        // Overview 已由 Worker 處理（若已初始化 OffscreenCanvas）
        try { updateVisibleWindowIndicator(); } catch(e){}
        return;
    }
    this.clear();

    if (!this.sampleCount) {
        return;
    }

    var ctx = this.canvasContext;
    var width = this.width;
    var height = this.height;
    var totalSamples = this.sampleCount;
    var centerY = height / 2; // 水平模式使用
    var visibleSamples = this.getVisibleSamples();

    if (this.viewStart + visibleSamples > totalSamples) {
        this.viewStart = Math.max(0, totalSamples - visibleSamples);
    }

    var startSample = this.viewStart;
    var endSample = Math.min(totalSamples, startSample + visibleSamples);
    // 根據模式決定樣本對應的畫布軸：
    var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
    var primarySpan = isVertical ? height : width; // 主時間軸長度（垂直用高度、水平用寬度）
    var samplesPerPixel = visibleSamples / primarySpan;

    // 時間刻度：根據可視範圍時間動態決定步距
    try {
        var effRateA = (this.sourceSampleRate || (audioContext ? audioContext.sampleRate : 48000)) / Math.max(1, this.decimationFactor || 1);
        if (effRateA > 0) {
            var visibleSecs = visibleSamples / effRateA;
            var startSecs = startSample / effRateA;
            var targetTicks = 8; // 期望約 8 個刻度
            var niceSteps = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,30,60,120,300,600];
            var step = niceSteps[0];
            for (var si = 0; si < niceSteps.length; si++) {
                var cStep = niceSteps[si];
                if ((visibleSecs / cStep) <= targetTicks) { step = cStep; break; }
            }
            var firstTick = Math.floor(startSecs / step) * step;
            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.lineWidth = 1;
            ctx.fillStyle = '#666';
            ctx.font = '10px -apple-system,Segoe UI,sans-serif';
            ctx.textAlign = isVertical ? 'left' : 'center';
            ctx.textBaseline = isVertical ? 'middle' : 'top';
            var lastLabelPos = -1e9;
            // 依視窗大小與目標刻度數動態設定最小間距與字體
            var dynamicGap = Math.max(28, Math.min(80, Math.round((isVertical ? height : width) / Math.max(6, Math.min(12, visibleSecs / step)))));
            var minLabelGapPx = dynamicGap; // 動態最小標籤間距
            // 動態字體大小（10~13px）
            var fontPx = Math.max(10, Math.min(13, Math.round((isVertical ? width : height) / 28)));
            ctx.font = fontPx + 'px -apple-system,Segoe UI,sans-serif';
            for (var t = firstTick; t <= startSecs + visibleSecs + 1e-6; t += step) {
                var ratio = (t - startSecs) / visibleSecs;
                if (ratio < 0 || ratio > 1) continue;
                if (!isVertical) {
                    var xTick = Math.round(ratio * width) + 0.5;
                    ctx.beginPath(); ctx.moveTo(xTick, 0); ctx.lineTo(xTick, height); ctx.stroke();
                    var label = t.toFixed(step >= 1 ? 0 : (step >= 0.1 ? 1 : 2)) + 's';
                    if (xTick - lastLabelPos >= minLabelGapPx) {
                        ctx.fillText(label, xTick, 2);
                        lastLabelPos = xTick;
                    }
                } else {
                    var yTick = Math.round(ratio * height) + 0.5;
                    ctx.beginPath(); ctx.moveTo(0, yTick); ctx.lineTo(width, yTick); ctx.stroke();
                    var labelV = t.toFixed(step >= 1 ? 0 : (step >= 0.1 ? 1 : 2)) + 's';
                    if (yTick - lastLabelPos >= minLabelGapPx) {
                        ctx.fillText(labelV, 4, yTick);
                        lastLabelPos = yTick;
                    }
                }
            }
            ctx.restore();
        }
    } catch(e) { /* ignore tick errors */ }

    ctx.strokeStyle = '#1E88E5';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (!isVertical) {
        // 原水平模式
        if (samplesPerPixel <= 1) {
            var spacing = visibleSamples > 1 ? width / (visibleSamples - 1) : width;
            for (var i = 0; i < visibleSamples; i++) {
                var sampleIndex = startSample + i;
                if (sampleIndex >= endSample) break;
                var pair = this._getSamplePair(sampleIndex);
                if (!pair) continue;
                var columnOffset = (pair.max + pair.min) / 2;
                var adjustedMax = pair.max - columnOffset;
                var adjustedMin = pair.min - columnOffset;
                if (adjustedMax > 1) adjustedMax = 1; else if (adjustedMax < -1) adjustedMax = -1;
                if (adjustedMin > 1) adjustedMin = 1; else if (adjustedMin < -1) adjustedMin = -1;
                var drawX = visibleSamples > 1 ? i * spacing : width / 2;
                var yTop = centerY - adjustedMax * centerY;
                var yBottom = centerY - adjustedMin * centerY;
                ctx.moveTo(drawX + 0.5, yTop);
                ctx.lineTo(drawX + 0.5, yBottom);
                // 削波標記（樣本級）
                if (showClipMarks && (Math.abs(adjustedMax) >= 0.99 || Math.abs(adjustedMin) >= 0.99)) {
                    ctx.stroke();
                    ctx.save();
                    ctx.fillStyle = 'rgba(176,0,32,0.55)';
                    ctx.fillRect(drawX - 1, 0, 2, height); // 紅色細柱
                    ctx.restore();
                    ctx.beginPath();
                }
            }
        } else {
            for (var x = 0; x < width; x++) {
                var rangeStart = startSample + x * samplesPerPixel;
                var rangeEnd = rangeStart + samplesPerPixel;
                var startIdx = Math.max(Math.floor(rangeStart), startSample);
                var endIdx = Math.min(Math.floor(rangeEnd), endSample - 1);
                if (endIdx < startIdx) endIdx = startIdx;
                var min = 1.0, max = -1.0;
                for (var idx = startIdx; idx <= endIdx; idx++) {
                    var samplePair = this._getSamplePair(idx);
                    if (!samplePair) continue;
                    if (samplePair.min < min) min = samplePair.min;
                    if (samplePair.max > max) max = samplePair.max;
                }
                if (min > max) continue;
                var columnOffsetLarge = (max + min) / 2;
                var adjustedMaxLarge = max - columnOffsetLarge;
                var adjustedMinLarge = min - columnOffsetLarge;
                if (adjustedMaxLarge > 1) adjustedMaxLarge = 1; else if (adjustedMaxLarge < -1) adjustedMaxLarge = -1;
                if (adjustedMinLarge > 1) adjustedMinLarge = 1; else if (adjustedMinLarge < -1) adjustedMinLarge = -1;
                var yTop2 = centerY - adjustedMaxLarge * centerY;
                var yBottom2 = centerY - adjustedMinLarge * centerY;
                ctx.moveTo(x + 0.5, yTop2);
                ctx.lineTo(x + 0.5, yBottom2);
                if (showClipMarks && (Math.abs(adjustedMaxLarge) >= 0.99 || Math.abs(adjustedMinLarge) >= 0.99)) {
                    ctx.stroke();
                    ctx.save();
                    ctx.fillStyle = 'rgba(176,0,32,0.35)';
                    ctx.fillRect(x, 0, 1, height);
                    ctx.restore();
                    ctx.beginPath();
                }
            }
        }
    } else {
        // 垂直模式：時間沿 Y 軸向下（viewStart 在頂部->底部），振幅左右擺動。
        var centerX = width / 2;
        if (samplesPerPixel <= 1) {
            var spacingY = visibleSamples > 1 ? height / (visibleSamples - 1) : height;
            for (var v = 0; v < visibleSamples; v++) {
                var sIndex = startSample + v;
                if (sIndex >= endSample) break;
                var spair = this._getSamplePair(sIndex);
                if (!spair) continue;
                var offset = (spair.max + spair.min) / 2;
                var aMax = spair.max - offset;
                var aMin = spair.min - offset;
                if (aMax > 1) aMax = 1; else if (aMax < -1) aMax = -1;
                if (aMin > 1) aMin = 1; else if (aMin < -1) aMin = -1;
                var drawY = visibleSamples > 1 ? v * spacingY : height / 2;
                var xLeft = centerX + aMin * centerX;
                var xRight = centerX + aMax * centerX;
                ctx.moveTo(xLeft, drawY + 0.5);
                ctx.lineTo(xRight, drawY + 0.5);
                if (showClipMarks && (Math.abs(aMax) >= 0.99 || Math.abs(aMin) >= 0.99)) {
                    ctx.stroke();
                    ctx.save();
                    ctx.fillStyle = 'rgba(176,0,32,0.55)';
                    ctx.fillRect(0, drawY - 1, width, 2);
                    ctx.restore();
                    ctx.beginPath();
                }
            }
        } else {
            for (var y = 0; y < height; y++) {
                var rStart = startSample + y * samplesPerPixel;
                var rEnd = rStart + samplesPerPixel;
                var sIdx = Math.max(Math.floor(rStart), startSample);
                var eIdx = Math.min(Math.floor(rEnd), endSample - 1);
                if (eIdx < sIdx) eIdx = sIdx;
                var vmin = 1.0, vmax = -1.0;
                for (var si = sIdx; si <= eIdx; si++) {
                    var pr = this._getSamplePair(si);
                    if (!pr) continue;
                    if (pr.min < vmin) vmin = pr.min;
                    if (pr.max > vmax) vmax = pr.max;
                }
                if (vmin > vmax) continue;
                var off = (vmax + vmin) / 2;
                var adjMax = vmax - off;
                var adjMin = vmin - off;
                if (adjMax > 1) adjMax = 1; else if (adjMax < -1) adjMax = -1;
                if (adjMin > 1) adjMin = 1; else if (adjMin < -1) adjMin = -1;
                var xLeft2 = centerX + adjMin * centerX;
                var xRight2 = centerX + adjMax * centerX;
                ctx.moveTo(xLeft2, y + 0.5);
                ctx.lineTo(xRight2, y + 0.5);
                if (showClipMarks && (Math.abs(adjMax) >= 0.99 || Math.abs(adjMin) >= 0.99)) {
                    ctx.stroke();
                    ctx.save();
                    ctx.fillStyle = 'rgba(176,0,32,0.35)';
                    ctx.fillRect(0, y, width, 1);
                    ctx.restore();
                    ctx.beginPath();
                }
            }
        }
    }

    ctx.stroke();
    
    // 繪製選取區域（根據模式不同改變方向）
    if (selectionStart !== null && selectionEnd !== null) {
        var selStart = Math.min(selectionStart, selectionEnd);
        var selEnd = Math.max(selectionStart, selectionEnd);
        if (selEnd >= startSample && selStart <= endSample) {
            var visStart = Math.max(selStart, startSample);
            var visEnd = Math.min(selEnd, endSample);
            if (!isVertical) {
                var selStartX = ((visStart - startSample) / visibleSamples) * width;
                var selEndX = ((visEnd - startSample) / visibleSamples) * width;
                ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
                ctx.fillRect(selStartX, 0, selEndX - selStartX, height);
                ctx.strokeStyle = '#4CAF50';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(selStartX, 0); ctx.lineTo(selStartX, height);
                ctx.moveTo(selEndX, 0); ctx.lineTo(selEndX, height);
                ctx.stroke();
                var handleRadius = 12; var handleY = height / 2;
                if (selStart >= startSample) {
                    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(selStartX, handleY, handleRadius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                }
                if (selEnd <= endSample) {
                    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(selEndX, handleY, handleRadius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                }
            } else {
                // 垂直模式：選取顯示為水平帶
                var selStartY = ((visStart - startSample) / visibleSamples) * height;
                var selEndY = ((visEnd - startSample) / visibleSamples) * height;
                ctx.fillStyle = 'rgba(76,175,80,0.2)';
                ctx.fillRect(0, selStartY, width, selEndY - selStartY);
                ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.beginPath();
                ctx.moveTo(0, selStartY); ctx.lineTo(width, selStartY);
                ctx.moveTo(0, selEndY); ctx.lineTo(width, selEndY);
                ctx.stroke();
                var handleRadiusV = 12; var handleX = width / 2;
                if (selStart >= startSample) { ctx.fillStyle='#4CAF50'; ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(handleX, selStartY, handleRadiusV, 0, Math.PI*2); ctx.fill(); ctx.stroke(); }
                if (selEnd <= endSample) { ctx.fillStyle='#4CAF50'; ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(handleX, selEndY, handleRadiusV, 0, Math.PI*2); ctx.fill(); ctx.stroke(); }
            }
        }
    }
    
    // 繪製播放位置指示器（模式差異：水平模式垂直線；垂直模式水平線）
    if (this.playbackPosition >= 0 && this.playbackPosition <= totalSamples) {
        if (this.playbackPosition >= startSample && this.playbackPosition <= endSample) {
            if (!isVertical) {
                var playbackX = ((this.playbackPosition - startSample) / visibleSamples) * width;
                ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playbackX, 0); ctx.lineTo(playbackX, height); ctx.stroke();
                ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.moveTo(playbackX,0); ctx.lineTo(playbackX-6,10); ctx.lineTo(playbackX+6,10); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(playbackX,height); ctx.lineTo(playbackX-6,height-10); ctx.lineTo(playbackX+6,height-10); ctx.closePath(); ctx.fill();
                // 時間浮標（水平模式：上方）
                try {
                    var effRateFloat = (this.sourceSampleRate || (audioContext ? audioContext.sampleRate : 48000)) / Math.max(1, this.decimationFactor || 1);
                    if (effRateFloat > 0) {
                        var absSeconds = this.playbackPosition / effRateFloat; // 已含 decimation
                        var labelTxt = absSeconds.toFixed(absSeconds >= 10 ? 2 : 3) + 's';
                        var padX = 6, padY = 3;
                        ctx.font = '11px -apple-system,Segoe UI,sans-serif';
                        var textW = ctx.measureText(labelTxt).width;
                        var boxW = textW + padX*2;
                        var boxH = 16;
                        var boxX = Math.min(Math.max(playbackX - boxW/2, 2), width - boxW - 2);
                        var boxY = 2;
                        ctx.fillStyle = 'rgba(255,255,255,0.9)';
                        ctx.strokeStyle = '#FF0000';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect ? ctx.roundRect(boxX, boxY, boxW, boxH, 4) : ctx.rect(boxX, boxY, boxW, boxH);
                        ctx.fill(); ctx.stroke();
                        ctx.fillStyle = '#c00';
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(labelTxt, boxX + boxW/2, boxY + boxH/2);
                    }
                } catch(e){}
            } else {
                var playbackY = ((this.playbackPosition - startSample) / visibleSamples) * height;
                ctx.strokeStyle='#FF0000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0, playbackY); ctx.lineTo(width, playbackY); ctx.stroke();
                // 左右三角形指示器
                ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.moveTo(0, playbackY); ctx.lineTo(10, playbackY-6); ctx.lineTo(10, playbackY+6); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(width, playbackY); ctx.lineTo(width-10, playbackY-6); ctx.lineTo(width-10, playbackY+6); ctx.closePath(); ctx.fill();
                // 時間浮標（垂直模式：右側）
                try {
                    var effRateFloatV = (this.sourceSampleRate || (audioContext ? audioContext.sampleRate : 48000)) / Math.max(1, this.decimationFactor || 1);
                    if (effRateFloatV > 0) {
                        var absSecV = this.playbackPosition / effRateFloatV;
                        var labelTxtV = absSecV.toFixed(absSecV >= 10 ? 2 : 3) + 's';
                        ctx.font = '11px -apple-system,Segoe UI,sans-serif';
                        var tW = ctx.measureText(labelTxtV).width;
                        var padXv = 6, padYv = 3;
                        var boxWv = tW + padXv*2;
                        var boxHv = 16;
                        var boxXv = width - boxWv - 2;
                        var boxYv = Math.min(Math.max(playbackY - boxHv/2, 2), height - boxHv - 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.9)';
                        ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect ? ctx.roundRect(boxXv, boxYv, boxWv, boxHv, 4) : ctx.rect(boxXv, boxYv, boxWv, boxHv);
                        ctx.fill(); ctx.stroke();
                        ctx.fillStyle = '#c00';
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(labelTxtV, boxXv + boxWv/2, boxYv + boxHv/2);
                    }
                } catch(e){}
            }
        }
    }
    
    // 同步更新全局波形視圖
    if (overviewWaveform) {
        overviewWaveform.draw();
    }
    // 更新可視範圍秒數顯示
    try { updateVisibleWindowIndicator(); } catch(e){}
};

/**
 * 取得目前可視範圍內的樣本數
 * @returns {number} 可視樣本數
 */
AccumulatedWaveform.prototype.getVisibleSamples = function() {
    if (!this.sampleCount) return 0;
    // 在 raw 模式下，decimated 視窗寬度由 rawVisibleRaw / decimationFactor 決定
    if (this.rawZoomMode) {
        var dec = Math.max(1, this.decimationFactor || 1);
        var visDec = Math.max(1, Math.round(this.rawVisibleRaw / dec));
        if (visDec > this.sampleCount) visDec = this.sampleCount;
        return visDec;
    }
    var total = this.sampleCount;
    var minVisible = this._getMinVisibleSamples(total);
    var visible = Math.round(total / this.zoomFactor);
    if (visible < minVisible) visible = minVisible;
    if (visible > total) visible = total;
    return visible;
};

/**
 * 計算目前允許的最小視窗樣本數
 * @param {number} total - 總樣本數
 * @returns {number} 最小視窗樣本
 */
AccumulatedWaveform.prototype._getMinVisibleSamples = function(total) {
    if (!total) {
        return 0;
    }
    // 放寬最小視窗限制：允許縮放到只剩 1 個（decimated）樣本
    return 1;
};

/**
 * 依據目前縮放狀態調整視窗邊界
 */
AccumulatedWaveform.prototype._enforceViewBounds = function() {
    if (!this.sampleCount) { this.viewStart = 0; this.rawViewStart = 0; return; }
    var total = this.sampleCount;
    var visible = this.getVisibleSamples();
    if (this.rawZoomMode) {
        // raw 邊界：rawViewStart 在 [0, sampleCount*decimationFactor - rawVisibleRaw]
        var dec = Math.max(1, this.decimationFactor||1);
        var rawTotal = total * dec;
        if (this.rawVisibleRaw > rawTotal) this.rawVisibleRaw = rawTotal;
        if (this.rawViewStart < 0) this.rawViewStart = 0;
        if (this.rawViewStart + this.rawVisibleRaw > rawTotal) this.rawViewStart = Math.max(0, rawTotal - this.rawVisibleRaw);
        // 對應 decimated viewStart
        this.viewStart = Math.floor(this.rawViewStart / dec);
        return;
    }
    if (visible >= total) { this.viewStart = 0; return; }
    if (this.viewStart < 0) this.viewStart = 0;
    if (this.viewStart + visible > total) this.viewStart = total - visible;
};

/**
 * 捲動視圖到最新資料
 */
AccumulatedWaveform.prototype.scrollToLatest = function() {
    if (!this.sampleCount) { this.viewStart = 0; this.rawViewStart = 0; return; }
    var visible = this.getVisibleSamples();
    if (this.rawZoomMode) {
        var dec = Math.max(1, this.decimationFactor||1);
        var rawTotal = this.sampleCount * dec;
        var rawVis = this.rawVisibleRaw;
        if (rawVis >= rawTotal) { this.rawViewStart = 0; this.viewStart = 0; }
        else { this.rawViewStart = rawTotal - rawVis; this.viewStart = Math.floor(this.rawViewStart / dec); }
        return;
    }
    if (visible >= this.sampleCount) this.viewStart = 0; else this.viewStart = this.sampleCount - visible;
};

/**
 * 設定縮放倍率
 * @param {number} targetZoom - 目標縮放倍率
 * @param {number} [anchorSample] - 錨點樣本索引，用於維持放大中心
 */
AccumulatedWaveform.prototype.setZoom = function(targetZoom, anchorSample) {
    if (!this.sampleCount) return;
    if (this.rawZoomMode) {
        // 在 raw 模式忽略 decimated zoomFactor，改用 rawVisibleRaw 調整
        var dec = Math.max(1, this.decimationFactor||1);
        var totalDec = this.sampleCount; // decimated total
        var prevVisDec = this.getVisibleSamples();
        var prevVisRaw = this.rawVisibleRaw;
        var minVisibleDec = this._getMinVisibleSamples(totalDec);
        var maxZoomDec = totalDec / minVisibleDec;
        if (!isFinite(maxZoomDec) || maxZoomDec < 1) maxZoomDec = 1;
        if (targetZoom < 1) targetZoom = 1; if (targetZoom > maxZoomDec) targetZoom = maxZoomDec;
        if (targetZoom === this.zoomFactor) return;
        this.zoomFactor = targetZoom; // 保留語意（但不直接用於計算）
        var newVisDec = this.getVisibleSamples();
        var newVisRaw = newVisDec * dec;
        if (anchorSample == null) anchorSample = this.rawViewStart + prevVisRaw/2;
        // anchorSample 以 raw 為單位傳入時支援；若 anchorSample 來源是 decimated，轉為 raw
        if (anchorSample < 0) anchorSample = 0;
        this.isAutoScroll = false;
        var rel = prevVisRaw ? (anchorSample - this.rawViewStart)/prevVisRaw : 0.5;
        if (!isFinite(rel)) rel = 0.5;
        this.rawViewStart = Math.round(anchorSample - rel * newVisRaw);
        this.rawVisibleRaw = newVisRaw;
        this._enforceViewBounds();
        this.draw();
        return;
    }
    var total = this.sampleCount;
    var minVisible = this._getMinVisibleSamples(total);
    var maxZoom = total / minVisible; if (!isFinite(maxZoom) || maxZoom < 1) maxZoom = 1;
    if (targetZoom < 1) targetZoom = 1; if (targetZoom > maxZoom) targetZoom = maxZoom;
    if (targetZoom === this.zoomFactor) return;
    var previousVisible = this.getVisibleSamples();
    this.zoomFactor = targetZoom; var newVisible = this.getVisibleSamples();
    if (anchorSample == null) anchorSample = this.viewStart + previousVisible/2;
    this.isAutoScroll = false;
    var relative = previousVisible ? (anchorSample - this.viewStart)/previousVisible : 0.5; if (!isFinite(relative)) relative = 0.5;
    this.viewStart = Math.round(anchorSample - relative*newVisible);
    this._enforceViewBounds(); this.draw();
};

/**
 * 依指定的級距進行縮放
 * @param {number} stepCount - 正值放大，負值縮小
 * @param {number} [anchorRatio] - 錨點相對位置 (0~1) 用於保持焦點
 */
AccumulatedWaveform.prototype.zoomBySteps = function(stepCount, anchorRatio) {
    if (!this.sampleCount || !stepCount) return;
    var anchorSample = null;
    if (anchorRatio != null && this.sampleCount) {
        if (anchorRatio < 0) anchorRatio = 0; else if (anchorRatio > 1) anchorRatio = 1;
        if (this.rawZoomMode) {
            var prevRawVis = this.rawVisibleRaw;
            anchorSample = this.rawViewStart + anchorRatio * prevRawVis; // raw anchor
        } else {
            anchorSample = this.viewStart + anchorRatio * this.getVisibleSamples();
        }
    }
    var zoomBase = 1.5; var targetZoom = this.zoomFactor * Math.pow(zoomBase, stepCount); this.setZoom(targetZoom, anchorSample);
};

/**
 * 依樣本量平移視圖
 * @param {number} sampleDelta - 正值向右，負值向左
 */
AccumulatedWaveform.prototype.panBySamples = function(sampleDelta) {
    if (!this.sampleCount || !sampleDelta) return;
    this.isAutoScroll = false;
    if (this.rawZoomMode) {
        var dec = Math.max(1, this.decimationFactor||1);
        this.rawViewStart += sampleDelta * dec;
        this._panRemainder = 0;
        this._enforceViewBounds();
        this.draw();
        return;
    }
    this.viewStart += sampleDelta; this._panRemainder = 0; this._enforceViewBounds(); this.draw();
};

/**
 * 依畫素量平移視圖
 * @param {number} pixelDelta - 以畫素為單位的位移
 */
AccumulatedWaveform.prototype.panByPixels = function(pixelDelta) {
    if (!this.sampleCount || !pixelDelta) return;
    var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
    var primaryPixels = isVertical ? this.height : this.width;
    var visibleDec = this.getVisibleSamples();
    var samplesPerPixelDec = visibleDec / primaryPixels;
    // Raw 模式與極端高倍放大時的最小移動補強（避免 samplesPerPixelDec < 0.1 導致卡住）
    if (this.rawZoomMode && visibleDec <= 5) {
        samplesPerPixelDec = Math.max(samplesPerPixelDec, 0.25); // 至少四像素一樣本
    }
    this._panRemainder += pixelDelta * samplesPerPixelDec;
    var sampleDelta = Math.trunc(this._panRemainder);
    if (sampleDelta !== 0) {
        this._panRemainder -= sampleDelta;
        this.panBySamples(sampleDelta);
    }
};

/**
 * 重設視圖（恢復自動捲動與預設縮放）
 */
AccumulatedWaveform.prototype.resetView = function() {
    if (!this.sampleCount) { this.zoomFactor = 1; this.viewStart = 0; this.rawViewStart = 0; this.isAutoScroll=true; this._panRemainder=0; this.draw(); return; }
    this.zoomFactor = 1; this._panRemainder=0; this.isAutoScroll=true;
    if (this.rawZoomMode) {
        // raw 模式重設到最後（保持語意一致）
        var dec = Math.max(1,this.decimationFactor||1);
        this.rawVisibleRaw = this.sampleCount * dec; // 全視窗
        this.rawViewStart = 0;
        this._enforceViewBounds();
    }
    this.scrollToLatest(); this.draw();
};

/**
 * 設定來源採樣率並更新下采樣倍率
 * @param {number} sampleRate - 來源音訊採樣率
 */
AccumulatedWaveform.prototype.setSourceSampleRate = function(sampleRate) {
    if (!sampleRate || sampleRate <= 0) {
        return;
    }
    this.sourceSampleRate = sampleRate;
    this.decimationFactor = Math.max(1, Math.round(this.sourceSampleRate / this.targetSampleRate));
};

/**
 * 取得指定索引的樣本值（考慮循環緩衝）
 * @param {number} index - 0-based 索引
 * @returns {number} 樣本值
 */
AccumulatedWaveform.prototype._getSamplePair = function(index) {
    if (index < 0 || index >= this.sampleCount) {
        return null;
    }

    var bufferIndex;
    return {
        min: this.sampleMin[index],
        max: this.sampleMax[index]
    };
};

/**
 * 設定播放位置
 * @param {number} sampleIndex - 樣本索引
 */
AccumulatedWaveform.prototype.setPlaybackPosition = function(sampleIndex) {
    this.playbackPosition = Math.max(0, Math.min(sampleIndex, this.sampleCount));
    this.draw();
};

// Raw 模式切換
AccumulatedWaveform.prototype.setRawZoomMode = function(enabled){
    enabled = !!enabled;
    if (enabled && !(usingWorklet && pcmTotalSamples > 0)) {
        // 不具備原始樣本（非 Worklet）時無法啟用
        enabled = false;
        try {
            var tgl = document.getElementById('toggle-raw-zoom');
            if (tgl) tgl.checked = false;
        } catch(e){}
        showToast('Raw 視窗縮放需 Worklet 模式與原始樣本');
    }
    if (this.rawZoomMode === enabled) { this.draw(); return; }
    var dec = Math.max(1, this.decimationFactor||1);
    // 在切換旗標前先取得目前 decimated 視窗長度
    var currentVisDec = this.getVisibleSamples();
    this.rawZoomMode = enabled;
    if (enabled) {
        // 進入 raw 模式：將目前 decimated 視窗轉換為 raw 視窗
        var visDec = Math.max(1, currentVisDec);
        this.rawVisibleRaw = Math.max(1, visDec * dec);
        this.rawViewStart = Math.max(0, this.viewStart * dec);
        this._enforceViewBounds();
    } else {
        // 離開 raw 模式：根據 raw 視窗回推 decimated zoomFactor/viewStart
        var visDec2 = Math.max(1, Math.round(this.rawVisibleRaw / dec));
        if (visDec2 > this.sampleCount) visDec2 = this.sampleCount;
        this.zoomFactor = this.sampleCount / Math.max(1, visDec2);
        this.viewStart = Math.floor(this.rawViewStart / dec);
        this._enforceViewBounds();
    }
    this.draw();
    // 規格重新渲染（可視 raw 樣本）
    try { gatherAndRenderSpecs(); } catch(e){}
};

/**
 * 開始播放並初始化播放追蹤
 * @param {number} startSample - 開始播放的樣本位置
 * @param {number} sampleRate - 採樣率
 */
AccumulatedWaveform.prototype.startPlayback = function(startSample, sampleRate) {
    this.isPlaying = true;
    this.playbackStartSample = startSample;
    this.playbackPosition = startSample;
    this.playbackStartTime = audioContext.currentTime;
    this.sourceSampleRate = sampleRate || this.sourceSampleRate;
    
    // 開始動畫循環更新播放位置
    this._updatePlaybackPosition();
};

/**
 * 停止播放
 */
AccumulatedWaveform.prototype.stopPlayback = function() {
    this.isPlaying = false;
    this.draw();
};

/**
 * 更新播放位置（內部方法，用於動畫循環）
 */
AccumulatedWaveform.prototype._updatePlaybackPosition = function() {
    if (!this.isPlaying) {
        return;
    }
    
    // 計算當前播放位置
    var elapsed = audioContext.currentTime - this.playbackStartTime;
    var samplesPassed = elapsed * this.sourceSampleRate;
    var decimatedSamplesPassed = samplesPassed / this.decimationFactor;
    
    this.playbackPosition = this.playbackStartSample + decimatedSamplesPassed;
    
    // 重繪波形
    this.draw();
    
    // 繼續動畫循環
    var self = this;
    requestAnimationFrame(function() {
        self._updatePlaybackPosition();
    });
};

/*=================================================================
 * OverviewWaveform 類 - 全局波形視圖
 * 顯示整體波形並標示當前 AccumulatedWaveform 的觀察區域
 *================================================================*/

/**
 * OverviewWaveform 類構造函數
 * @param {HTMLCanvasElement} canvas - 用於繪製全局波形的 Canvas 元素
 * @param {AccumulatedWaveform} accumulatedWaveform - 關聯的累積波形實例
 */
function OverviewWaveform(canvas, accumulatedWaveform) {
    this.canvas = canvas;
    this.canvasContext = null;  // 延遲初始化
    this.width = canvas.width;
    this.height = canvas.height;
    this.accumulatedWaveform = accumulatedWaveform;
    this._useWorker = false;
    this._workerRef = null;
    
    // 若累積波形已啟用 Worker，則將 Overview Canvas 也移轉至同一個 Worker
    if (accumulatedWaveform && accumulatedWaveform._useWorker && accumulatedWaveform._worker && canvas.transferControlToOffscreen) {
        try {
            var off = canvas.transferControlToOffscreen();
            accumulatedWaveform._worker.postMessage({
                type:'initOverview',
                canvas: off,
                width: this.width,
                height: this.height
            }, [off]);
            this._useWorker = true;
            this._workerRef = accumulatedWaveform._worker;
        } catch(e) {
            // transferControlToOffscreen 失敗，回退到主執行緒繪圖
            this._useWorker = false;
        }
    }
    
    // 如果沒有使用 Worker，嘗試獲取 2D context
    if (!this._useWorker) {
        try {
            this.canvasContext = canvas.getContext('2d');
        } catch(e) {
            // Canvas 已轉移控制權，無法獲取 context
            console.warn('無法獲取 overview canvas context（canvas 已轉移控制權），波形繪製將被跳過');
        }
    }
    
    this.clear();
}

/**
 * 清空畫布
 */
OverviewWaveform.prototype.clear = function() {
    if (this._useWorker && this._workerRef) {
        // 交由 worker 清空（在下次 draw 時一併處理）
        return;
    }
    if (!this.canvasContext) return; // 如果沒有 context 就跳過
    this.canvasContext.clearRect(0, 0, this.width, this.height);
    this.canvasContext.fillStyle = '#f5f5f5';
    this.canvasContext.fillRect(0, 0, this.width, this.height);
};

/**
 * 繪製全局波形和視窗指示器
 */
OverviewWaveform.prototype.draw = function() {
    if (!this.accumulatedWaveform) {
        return;
    }
    if (this._useWorker && this._workerRef) {
        // 若尺寸有變化，通知 worker 調整 Overview 畫布大小
        try {
            this._workerRef.postMessage({ type:'resizeOverview', width: this.width, height: this.height });
        } catch(e){}
        // 直接要求 worker 以累積波形狀態進行繪製
        try {
            var isV = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
            var acc = this.accumulatedWaveform;
            var visSamp = acc.getVisibleSamples();
            this._workerRef.postMessage({
                type:'draw',
                zoomFactor: acc.zoomFactor,
                viewStart: acc.viewStart,
                verticalMode: !!isV,
                showClipMarks: !!showClipMarks,
                visibleSamples: visSamp,
                playbackPosition: acc.playbackPosition
            });
        } catch(e){}
        return;
    }
    
    this.clear();
    
    var sampleCount = this.accumulatedWaveform.sampleCount;
    if (!sampleCount) {
        return;
    }
    
    var ctx = this.canvasContext;
    var width = this.width;
    var height = this.height;
    var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
    var centerAxis = isVertical ? width / 2 : height / 2;
    var primarySpan = isVertical ? height : width; // 時間軸投影長度
    var samplesPerPixel = sampleCount / primarySpan;

    // 整段總時間刻度
    try {
        var effRateO = (this.accumulatedWaveform.sourceSampleRate || (audioContext ? audioContext.sampleRate : 48000)) / Math.max(1, this.accumulatedWaveform.decimationFactor || 1);
        if (effRateO > 0) {
            var totalSecs = sampleCount / effRateO;
            var targetTicks = 8;
            var niceSteps = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,30,60,120,300,600];
            var step = niceSteps[0];
            for (var si = 0; si < niceSteps.length; si++) {
                var cStep = niceSteps[si];
                if ((totalSecs / cStep) <= targetTicks) { step = cStep; break; }
            }
            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.fillStyle = '#555';
            ctx.font = '10px -apple-system,Segoe UI,sans-serif';
            ctx.textAlign = isVertical ? 'left' : 'center';
            ctx.textBaseline = isVertical ? 'middle' : 'top';
            var lastLabelPosAll = -1e9;
            // 動態計算 Overview 標籤間距與字體大小
            var dynamicGapO = Math.max(28, Math.min(80, Math.round((isVertical ? height : width) / Math.max(6, Math.min(12, totalSecs / step)))));
            var minLabelGapPxAll = dynamicGapO;
            var fontPxAll = Math.max(10, Math.min(13, Math.round((isVertical ? width : height) / 28)));
            ctx.font = fontPxAll + 'px -apple-system,Segoe UI,sans-serif';
            for (var t = 0; t <= totalSecs + 1e-6; t += step) {
                var ratio = t / totalSecs;
                if (!isVertical) {
                    var xTick = Math.round(ratio * width) + 0.5;
                    ctx.beginPath(); ctx.moveTo(xTick,0); ctx.lineTo(xTick,height); ctx.stroke();
                    var label = t.toFixed(step >= 1 ? 0 : (step >= 0.1 ? 1 : 2)) + 's';
                    if (xTick - lastLabelPosAll >= minLabelGapPxAll) {
                        ctx.fillText(label, xTick, 2);
                        lastLabelPosAll = xTick;
                    }
                } else {
                    var yTick = Math.round(ratio * height) + 0.5;
                    ctx.beginPath(); ctx.moveTo(0,yTick); ctx.lineTo(width,yTick); ctx.stroke();
                    var labelV = t.toFixed(step >= 1 ? 0 : (step >= 0.1 ? 1 : 2)) + 's';
                    if (yTick - lastLabelPosAll >= minLabelGapPxAll) {
                        ctx.fillText(labelV, 4, yTick);
                        lastLabelPosAll = yTick;
                    }
                }
            }
            ctx.restore();
        }
    } catch(e) { /* ignore ticks */ }
    ctx.strokeStyle = '#9E9E9E'; ctx.lineWidth = 1; ctx.beginPath();
    if (!isVertical) {
        // 原水平總覽
        for (var x = 0; x < width; x++) {
            var rangeStart = x * samplesPerPixel;
            var rangeEnd = rangeStart + samplesPerPixel;
            var startIdx = Math.floor(rangeStart);
            var endIdx = Math.min(Math.floor(rangeEnd), sampleCount - 1);
            if (endIdx < startIdx) endIdx = startIdx;
            var min = 1.0, max = -1.0;
            for (var idx = startIdx; idx <= endIdx; idx++) {
                if (idx >= 0 && idx < this.accumulatedWaveform.sampleMin.length) {
                    var sMin = this.accumulatedWaveform.sampleMin[idx];
                    var sMax = this.accumulatedWaveform.sampleMax[idx];
                    if (sMin < min) min = sMin; if (sMax > max) max = sMax;
                }
            }
            if (min > max) continue;
            var offset = (max + min)/2; var aMax = max - offset; var aMin = min - offset;
            if (aMax > 1) aMax=1; else if (aMax < -1) aMax=-1; if (aMin > 1) aMin=1; else if (aMin < -1) aMin=-1;
            var yTop = (height/2) - aMax * (height/2) * 0.9;
            var yBottom = (height/2) - aMin * (height/2) * 0.9;
            ctx.moveTo(x+0.5,yTop); ctx.lineTo(x+0.5,yBottom);
        }
    } else {
        // 垂直總覽：時間沿 Y 軸，振幅左右擺動
        for (var y = 0; y < height; y++) {
            var rStart = y * samplesPerPixel;
            var rEnd = rStart + samplesPerPixel;
            var sIdx = Math.floor(rStart);
            var eIdx = Math.min(Math.floor(rEnd), sampleCount - 1);
            if (eIdx < sIdx) eIdx = sIdx;
            var vmin = 1.0, vmax = -1.0;
            for (var ii = sIdx; ii <= eIdx; ii++) {
                if (ii >= 0 && ii < this.accumulatedWaveform.sampleMin.length) {
                    var mn = this.accumulatedWaveform.sampleMin[ii];
                    var mx = this.accumulatedWaveform.sampleMax[ii];
                    if (mn < vmin) vmin = mn; if (mx > vmax) vmax = mx;
                }
            }
            if (vmin > vmax) continue;
            var off = (vmax + vmin)/2; var adjMax = vmax - off; var adjMin = vmin - off;
            if (adjMax > 1) adjMax=1; else if (adjMax<-1) adjMax=-1; if (adjMin>1) adjMin=1; else if (adjMin<-1) adjMin=-1;
            var xLeft = (width/2) + adjMin * (width/2) * 0.9;
            var xRight = (width/2) + adjMax * (width/2) * 0.9;
            ctx.moveTo(xLeft, y+0.5); ctx.lineTo(xRight, y+0.5);
        }
    }
    ctx.stroke();
    
    // 繪製當前視窗指示器
    var viewStart = this.accumulatedWaveform.viewStart;
    var visibleSamples = this.accumulatedWaveform.getVisibleSamples();
    
    if (!isVertical) {
        var viewStartX = (viewStart / sampleCount) * width;
        var viewWidth = (visibleSamples / sampleCount) * width;
        ctx.fillStyle = 'rgba(30,136,229,0.2)'; ctx.fillRect(viewStartX,0,viewWidth,height);
        ctx.strokeStyle='#1E88E5'; ctx.lineWidth=2; ctx.strokeRect(viewStartX,0,viewWidth,height);
    } else {
        var viewStartY = (viewStart / sampleCount) * height;
        var viewHeight = (visibleSamples / sampleCount) * height;
        ctx.fillStyle = 'rgba(30,136,229,0.2)'; ctx.fillRect(0, viewStartY, width, viewHeight);
        ctx.strokeStyle='#1E88E5'; ctx.lineWidth=2; ctx.strokeRect(0, viewStartY, width, viewHeight);
    }

    // 繪製紅色垂直播放位置（若有播放或已設定位置）
    var playbackPos = this.accumulatedWaveform.playbackPosition;
    if (typeof playbackPos === 'number' && playbackPos >= 0 && playbackPos <= sampleCount) {
        if (!isVertical) {
            var playbackX = (playbackPos / sampleCount) * width;
            ctx.strokeStyle='#FF0000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(playbackX+0.5,0); ctx.lineTo(playbackX+0.5,height); ctx.stroke();
            ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.moveTo(playbackX,0); ctx.lineTo(playbackX-5,9); ctx.lineTo(playbackX+5,9); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(playbackX,height); ctx.lineTo(playbackX-5,height-9); ctx.lineTo(playbackX+5,height-9); ctx.closePath(); ctx.fill();
        } else {
            var playbackY = (playbackPos / sampleCount) * height;
            ctx.strokeStyle='#FF0000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,playbackY+0.5); ctx.lineTo(width,playbackY+0.5); ctx.stroke();
            ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.moveTo(0,playbackY); ctx.lineTo(9,playbackY-5); ctx.lineTo(9,playbackY+5); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(width,playbackY); ctx.lineTo(width-9,playbackY-5); ctx.lineTo(width-9,playbackY+5); ctx.closePath(); ctx.fill();
        }
    }
};

/*=================================================================
 * 輔助工具函數
 * 提供時間計算、麥克風捕獲等通用功能
 *================================================================*/

/**
 * 將秒數轉換為時:分:秒格式
 * @param {number} secs - 總秒數
 * @returns {string} 格式化的時間字串 (HH:MM:SS 或 MM:SS)
 */
function calculateTimeDuration(secs, includeMillis) {
    var hr = Math.floor(secs / 3600);           // 計算小時
    var min = Math.floor((secs - (hr * 3600)) / 60); // 計算分鐘
    var sec = Math.floor(secs - (hr * 3600) - (min * 60)); // 計算秒數
    var ms = Math.floor((secs - Math.floor(secs)) * 1000); // 計算毫秒

    // 格式化分鐘：小於10時前面補0
    if (min < 10) {
        min = "0" + min;
    }

    // 格式化秒數：小於10時前面補0
    if (sec < 10) {
        sec = "0" + sec;
    }

    // 格式化毫秒：補滿3位數
    var msStr = ms.toString().padStart(3, '0');

    var timeStr;
    // 如果沒有小時，只顯示分:秒
    if(hr <= 0) {
        timeStr = min + ':' + sec;
    } else {
        // 有小時時顯示時:分:秒
        timeStr = hr + ':' + min + ':' + sec;
    }

    // 如果需要顯示毫秒
    if (includeMillis) {
        timeStr += '.' + msStr;
    }

    return timeStr;
}

/**
 * 捕獲用戶麥克風
 * 請求麥克風權限並獲取音頻流
 * @param {function} callback - 成功獲取麥克風後的回調函數
 */
function captureMicrophone(callback) {
    // 讀取 AGC 設定
    var agcToggle = document.getElementById('agc-toggle');
    var agcEnabled = agcToggle ? agcToggle.checked : false;

    // iOS 上若 AGC 關閉常見錄音音量偏低；若使用者尚未自訂增益 (保持預設 1.0x) 則自動提升到 3.5x
    try {
        var ua = navigator.userAgent || '';
        var isIOS = /iphone|ipad|ipod/i.test(ua);
        if (isIOS && !agcEnabled && micGainUserFactor && Math.abs(micGainUserFactor - 1.0) < 0.0001) {
            micGainUserFactor = 3.5;
            var gainSlider = document.getElementById('mic-gain');
            var gainValue = document.getElementById('mic-gain-value');
            if (gainSlider) { gainSlider.value = micGainUserFactor; }
            if (gainValue) { gainValue.textContent = micGainUserFactor.toFixed(1) + 'x'; }
            showToast('iOS: 已自動提升 Mic Gain 至 3.5x');
        }
    } catch(e){}

    var audioConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: agcEnabled
    };
    // 若使用者選擇了特定麥克風，加入 deviceId 限制
    if (selectedMicDeviceId) {
        audioConstraints.deviceId = { exact: selectedMicDeviceId };
    }

    lastAudioConstraintsUsed = audioConstraints;

    navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
        .then(function(microphone) {
            // 保存目前麥克風串流參考，供停止時釋放
            currentMicStream = microphone;
            // 套用前級增益倍率（僅在 AGC 關閉時）
            if (!agcEnabled && preGainNode) {
                preGainNode.gain.value = Math.min(6, Math.max(1, micGainUserFactor));
            } else if (preGainNode) {
                preGainNode.gain.value = 1.0;
            }
            callback(microphone);           // 成功時執行回調
        }).catch(function(error) {
            // 若因指定 deviceId 導致找不到裝置，嘗試退回預設裝置
            var name = (error && (error.name || error.code)) || '';
            var overconstrained = name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'OverconstrainedErrorEvent';
            if (overconstrained && audioConstraints && audioConstraints.deviceId) {
                console.warn('Specified deviceId not available, falling back to default device.', error);
                showToast('選擇的麥克風無法使用，已改用預設裝置。');
                var fallbackConstraints = {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: agcEnabled
                };
                lastAudioConstraintsUsed = fallbackConstraints;
                return navigator.mediaDevices.getUserMedia({ audio: fallbackConstraints, video: false })
                    .then(function(m){ 
                        currentMicStream = m;
                        if (!agcEnabled && preGainNode) {
                            preGainNode.gain.value = Math.min(6, Math.max(1, micGainUserFactor));
                        } else if (preGainNode) {
                            preGainNode.gain.value = 1.0;
                        }
                        callback(m); 
                    })
                    .catch(function(err){
                        showError('無法捕獲麥克風（預設裝置）', err);
                        console.error(err);
                    });
            }
            // 其它錯誤：顯示錯誤訊息並記錄到控制台
            showError('無法捕獲麥克風，請檢查權限設定', error);
            console.error(error);
        });
}

/*=================================================================
 * 累積波形更新工具
 * 將新收到的音訊 Blob 解碼並附加至累積波形
 *================================================================*/

/**
 * 將錄音片段 Blob 附加至累積波形顯示
 * @param {Blob} blob - 錄音片段
 */
function appendBlobToAccumulatedWaveform(blob) {
    if (!accumulatedWaveform || !audioContext) {
        return;
    }

    blob.arrayBuffer().then(function(arrayBuffer) {
        return audioContext.decodeAudioData(arrayBuffer);
    }).then(function(audioBuffer) {
        if (!accumulatedWaveform) {
            return;
        }

        accumulatedWaveform.setSourceSampleRate(audioBuffer.sampleRate);
        var channelData = audioBuffer.getChannelData(0);
        accumulatedWaveform.append(channelData);
        // 更新 decimation 與來源採樣率顯示
        gatherAndRenderSpecs();
    }).catch(function(error) {
        console.warn('Unable to decode audio chunk for accumulated waveform.', error);
    });
}

/**
 * 播放選取的音訊範圍或整句
 */
function playSelectedOrFullAudio() {
    if (!latestRecordingBlob || !audioContext || !accumulatedWaveform) {
        console.warn('沒有可播放的音訊');
        return;
    }

    // 停止之前的播放
    if (selectionAudioSource) {
        try {
            selectionAudioSource.stop();
        } catch (e) {
            // 忽略已經停止的錯誤
        }
        selectionAudioSource = null;
    }
    
    // 停止之前的播放動畫
    if (accumulatedWaveform) {
        accumulatedWaveform.stopPlayback();
    }

    latestRecordingBlob.arrayBuffer().then(function(arrayBuffer) {
        return audioContext.decodeAudioData(arrayBuffer);
    }).then(function(audioBuffer) {
        var sampleRate = audioBuffer.sampleRate;
        var channelData = audioBuffer.getChannelData(0);
        
        // 判斷播放起始位置
        var startSample, endSample;
        var playFromPosition = false;
        
        // 優先使用播放位置指示器
        if (accumulatedWaveform.playbackPosition > 0 && 
            accumulatedWaveform.playbackPosition < accumulatedWaveform.sampleCount) {
            // 從播放位置開始
            var decimationFactor = accumulatedWaveform.decimationFactor;
            startSample = Math.floor(accumulatedWaveform.playbackPosition * decimationFactor);
            playFromPosition = true;
            
            // 如果有選取範圍，播放到選取範圍結束
            if (selectionStart !== null && selectionEnd !== null) {
                var selEnd = Math.max(selectionStart, selectionEnd);
                endSample = Math.min(channelData.length, Math.ceil(selEnd * decimationFactor));
            } else {
                // 否則播放到結尾
                endSample = channelData.length;
            }
            
            console.log('從播放位置開始: 樣本 ' + startSample);
        } else if (selectionStart !== null && selectionEnd !== null) {
            // 有選取範圍，播放選取範圍
            var decimationFactor = accumulatedWaveform.decimationFactor;
            startSample = Math.min(selectionStart, selectionEnd) * decimationFactor;
            endSample = Math.max(selectionStart, selectionEnd) * decimationFactor;
            
            startSample = Math.max(0, Math.floor(startSample));
            endSample = Math.min(channelData.length, Math.ceil(endSample));
            
            console.log('播放選取範圍: 樣本 ' + startSample + ' 到 ' + endSample);
        } else {
            // 播放整句
            startSample = 0;
            endSample = channelData.length;
            console.log('播放整句: 總共 ' + channelData.length + ' 個樣本');
        }
        
        if (startSample >= endSample) {
            console.warn('播放範圍無效');
            return;
        }
        
        // 提取播放範圍的音訊數據
        var duration = (endSample - startSample) / sampleRate;
        var newBuffer = audioContext.createBuffer(1, endSample - startSample, sampleRate);
        var newChannelData = newBuffer.getChannelData(0);
        
        for (var i = 0; i < newChannelData.length; i++) {
            newChannelData[i] = channelData[startSample + i];
        }
        
        // 創建音訊源並播放
    selectionAudioSource = audioContext.createBufferSource();
        selectionAudioSource.buffer = newBuffer;
    // 聲音輸出
    selectionAudioSource.connect(audioContext.destination);
    // 也接入 analyser 以便播放期間 VU Meter 更新
    try { selectionAudioSource.connect(analyser); } catch(e) { /* ignore */ }
        
        // 開始播放動畫
        var decimationFactor = accumulatedWaveform.decimationFactor;
        var startSampleDecimated = startSample / decimationFactor;
        accumulatedWaveform.startPlayback(startSampleDecimated, sampleRate);
        
        // 播放結束後清理
        selectionAudioSource.onended = function() {
            selectionAudioSource = null;
            if (accumulatedWaveform) {
                accumulatedWaveform.stopPlayback();
                // 播放結束後，播放位置停留在結束位置
                accumulatedWaveform.setPlaybackPosition(endSample / decimationFactor);
            }
            console.log('播放完成');
            updatePlaybackButtonsState();
        };
        
        selectionAudioSource.start(0);
        updatePlaybackButtonsState();
        console.log('開始播放，時長: ' + duration.toFixed(2) + ' 秒');
        
    }).catch(function(error) {
        console.error('播放失敗:', error);
        if (accumulatedWaveform) {
            accumulatedWaveform.stopPlayback();
        }
        updatePlaybackButtonsState();
    });
}

/**
 * 綁定累積波形操作的互動控制
 * @param {HTMLCanvasElement} canvas - 累積波形使用的畫布
 */
function bindAccumulatedWaveformInteractions(canvas) {
    if (!canvas || accumulatedControlsBound) {
        return;
    }

    accumulatedControlsBound = true;

    var isDragging = false;
    var isSelecting = false;
    var isResizingSelection = false;
    var resizeEdge = null; // 'left' 或 'right'
    var lastX = 0;
    var lastY = 0;
    var selectionStartX = 0;
    var activePointerId = null;
    var longPressTimer = null;
    var longPressDelay = 500; // 長按時間（毫秒）
    var isLongPress = false;
    var startX = 0;
    var startY = 0;
    var moveThreshold = 10; // 移動超過此距離視為拖曳而非長按
    
    // 檢測是否為觸控設備
    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // 根據設備類型設置邊緣檢測範圍
    var edgeThreshold = isTouchDevice ? 25 : 10; // 觸控設備用更大的範圍

    // 檢測滑鼠是否在選取區域邊緣
    function getSelectionEdgeAt(x, rect, y) {
        if (selectionStart === null || selectionEnd === null) {
            return null;
        }
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        var selStart = Math.min(selectionStart, selectionEnd);
        var selEnd = Math.max(selectionStart, selectionEnd);
        
        // 轉換樣本位置到像素位置
        var leftSamplePos = selStart - accumulatedWaveform.viewStart;
        var rightSamplePos = selEnd - accumulatedWaveform.viewStart;
        if (!isVertical) {
            var leftX = (leftSamplePos / visibleSamples) * rect.width;
            var rightX = (rightSamplePos / visibleSamples) * rect.width;
            if (Math.abs(x - leftX) <= edgeThreshold) return 'left';
            if (Math.abs(x - rightX) <= edgeThreshold) return 'right';
        } else {
            var topY = (leftSamplePos / visibleSamples) * rect.height;
            var bottomY = (rightSamplePos / visibleSamples) * rect.height;
            if (Math.abs(y - topY) <= edgeThreshold) return 'top';
            if (Math.abs(y - bottomY) <= edgeThreshold) return 'bottom';
        }
        
        return null;
    }
    
    // 清除長按計時器
    function clearLongPressTimer() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        isLongPress = false;
    }

    // 更新游標樣式
    canvas.addEventListener('pointermove', function(event) {
        if (!accumulatedWaveform || isDragging || isSelecting || isResizingSelection) {
            return;
        }
        
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        var edge = getSelectionEdgeAt(x, rect, y);
        
        if (event.shiftKey && edge) {
            canvas.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
        } else if (event.shiftKey) {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'grab';
        }
    });

    canvas.addEventListener('pointerdown', function(event) {
        if (!accumulatedWaveform) {
            return;
        }
        
        activePointerId = event.pointerId;
        var rect = canvas.getBoundingClientRect();
    var clickX = event.clientX - rect.left;
    var clickY = event.clientY - rect.top;
    var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        
        // 記錄起始位置
        startX = event.clientX;
        startY = event.clientY;
        
        // 檢查是否按下 Shift 鍵或在邊緣（PC 操作）
        if (event.shiftKey) {
            clearLongPressTimer();
            
            // 檢查是否在選取區域邊緣
            var edge = getSelectionEdgeAt(clickX, rect, clickY);
            
            if (edge) {
                // 拉伸選取區域邊緣
                isResizingSelection = true;
                resizeEdge = edge;
                isDragging = false;
                isSelecting = false;
                canvas.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
            } else {
                // 創建新的選取區域
                isSelecting = true;
                isDragging = false;
                isResizingSelection = false;
                selectionStartX = isVertical ? clickY : clickX;
                
                // 計算選取起始樣本
                var visibleSamples = accumulatedWaveform.getVisibleSamples();
                var sampleRatio = isVertical ? (clickY / rect.height) : (clickX / rect.width);
                selectionStart = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
                selectionEnd = selectionStart;
                
                // 清除舊的播放控制
                var oldPlaybackControls = document.getElementById('selection-playback-controls');
                if (oldPlaybackControls) {
                    oldPlaybackControls.remove();
                }
                
                accumulatedWaveform.draw();
                canvas.style.cursor = 'crosshair';
            }
        } else if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            // 左鍵單擊（非 Ctrl/Cmd）：移動播放位置或其他操作
            
            // 檢查是否直接點擊在選取區域邊緣（觸控設備優化）
            var edge = getSelectionEdgeAt(clickX, rect, clickY);
            
            if (edge) {
                // 直接開始拉伸（無需 Shift，方便觸控操作）
                clearLongPressTimer();
                isResizingSelection = true;
                resizeEdge = edge;
                isDragging = false;
                isSelecting = false;
                canvas.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
                
                // 觸控回饋
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            } else {
                // 先設置播放位置（點擊時立即設置）
                var visibleSamples = accumulatedWaveform.getVisibleSamples();
                var sampleRatio = isVertical ? (clickY / rect.height) : (clickX / rect.width);
                var clickedSample = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
                
                // 限制在有效範圍內
                clickedSample = Math.max(0, Math.min(clickedSample, accumulatedWaveform.sampleCount));
                accumulatedWaveform.setPlaybackPosition(clickedSample);
                
                // 開始長按檢測（用於觸控設備選取）
                isLongPress = false;
                longPressTimer = setTimeout(function() {
                    // 長按觸發選取模式
                    if (!isDragging && !isSelecting && !isResizingSelection) {
                        isLongPress = true;
                        isSelecting = true;
                        isDragging = false;
                        selectionStartX = isVertical ? clickY : clickX;
                        
                        // 計算選取起始樣本
                        selectionStart = clickedSample;
                        selectionEnd = selectionStart;
                        
                        // 清除舊的播放控制
                        var oldPlaybackControls = document.getElementById('selection-playback-controls');
                        if (oldPlaybackControls) {
                            oldPlaybackControls.remove();
                        }
                        
                        accumulatedWaveform.draw();
                        canvas.style.cursor = 'crosshair';
                        
                        // 震動回饋
                        if (navigator.vibrate) {
                            navigator.vibrate(100);
                        }
                        
                        // 視覺提示
                        canvas.style.boxShadow = '0 0 10px 2px rgba(76, 175, 80, 0.5)';
                    }
                }, longPressDelay);
                
                // 一般拖曳平移模式（如果不觸發長按）
                isDragging = true;
                isSelecting = false;
                isResizingSelection = false;
                lastX = event.clientX; lastY = event.clientY;
                accumulatedWaveform.isAutoScroll = false;
                canvas.style.cursor = 'grabbing';
            }
        } else {
            // 其他情況（如 Ctrl+點擊）：原有的拖曳行為
            clearLongPressTimer();
            isDragging = true;
            isSelecting = false;
            isResizingSelection = false;
            lastX = event.clientX; lastY = event.clientY;
            accumulatedWaveform.isAutoScroll = false;
            canvas.style.cursor = 'grabbing';
        }
        
        try {
            canvas.setPointerCapture(activePointerId);
        } catch (err) {
            // ignore if not supported
        }
    });

    canvas.addEventListener('pointermove', function(event) {
        if (!accumulatedWaveform) {
            return;
        }
        
        if (event.pointerId !== activePointerId && (isDragging || isSelecting || isResizingSelection)) {
            return;
        }
        
    var rect = canvas.getBoundingClientRect();
    var currentX = event.clientX - rect.left;
    var currentY = event.clientY - rect.top;
    var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        
        // 檢測移動距離，超過閾值則取消長按
        if (longPressTimer && !isLongPress) {
            var moveDistance = Math.sqrt(
                Math.pow(event.clientX - startX, 2) + 
                Math.pow(event.clientY - startY, 2)
            );
            
            if (moveDistance > moveThreshold) {
                clearLongPressTimer();
            }
        }
        
        if (isResizingSelection) {
            // 拉伸選取區域邊緣
            var visibleSamples = accumulatedWaveform.getVisibleSamples();
            var sampleRatio = isVertical ? (currentY / rect.height) : (currentX / rect.width);
            var newSample = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
            
            // 限制在有效範圍內
            if (newSample < 0) newSample = 0;
            if (newSample >= accumulatedWaveform.sampleCount) {
                newSample = accumulatedWaveform.sampleCount - 1;
            }
            
            // 更新對應的邊緣
            if (resizeEdge === 'left' || resizeEdge === 'top') {
                selectionStart = newSample;
            } else if (resizeEdge === 'right' || resizeEdge === 'bottom') {
                selectionEnd = newSample;
            }

            // 最小選取長度：0.2 秒
            if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
                var effRateR = (accumulatedWaveform.sourceSampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
                var minSamplesR = Math.ceil(0.2 * effRateR);
                var sR = Math.min(selectionStart, selectionEnd);
                var eR = Math.max(selectionStart, selectionEnd);
                if ((eR - sR) < minSamplesR) {
                    if (resizeEdge === 'left' || resizeEdge === 'top') {
                        // 正在推左/上邊緣，維持右/下固定，延長到最小
                        sR = Math.max(0, eR - minSamplesR);
                        selectionStart = sR;
                    } else {
                        eR = Math.min(accumulatedWaveform.sampleCount - 1, sR + minSamplesR);
                        selectionEnd = eR;
                    }
                }
            }
            
            accumulatedWaveform.draw();
            
        } else if (isSelecting) {
            // 更新選取範圍
            var visibleSamples = accumulatedWaveform.getVisibleSamples();
            var sampleRatio = isVertical ? (currentY / rect.height) : (currentX / rect.width);
            selectionEnd = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
            
            // 限制在有效範圍內
            if (selectionEnd < 0) selectionEnd = 0;
            if (selectionEnd >= accumulatedWaveform.sampleCount) {
                selectionEnd = accumulatedWaveform.sampleCount - 1;
            }

            // 最小選取長度：0.2 秒（即時）
            if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
                var effRate = (accumulatedWaveform.sourceSampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
                var minSamples = Math.ceil(0.2 * effRate);
                var s = Math.min(selectionStart, selectionEnd);
                var e = Math.max(selectionStart, selectionEnd);
                if ((e - s) < minSamples) {
                    if (selectionEnd > selectionStart) {
                        // 往右/下拖曳，延長 end
                        selectionEnd = Math.min(accumulatedWaveform.sampleCount - 1, selectionStart + minSamples);
                    } else {
                        // 往左/上拖曳，延長 start
                        selectionStart = Math.max(0, selectionEnd - minSamples);
                    }
                }
            }

            accumulatedWaveform.draw();
            
        } else if (isDragging && !isLongPress) {
            // 平移波形（長按模式下不平移）
            var deltaPrimary = isVertical ? (event.clientY - lastY) : (event.clientX - lastX);
            if (deltaPrimary !== 0) {
                accumulatedWaveform.panByPixels(-deltaPrimary);
                if (isVertical) { lastY = event.clientY; } else { lastX = event.clientX; }
            }
        }
    });

    function endDrag(event) {
        if (event && event.pointerId !== activePointerId) {
            return;
        }
        
        // 清除長按計時器和視覺效果
        clearLongPressTimer();
        canvas.style.boxShadow = '';
        
        // 選取或拉伸完成後，不再顯示舊的播放 UI，僅重繪
        
        isDragging = false;
        isSelecting = false;
        isResizingSelection = false;
        resizeEdge = null;
        
    // 恢復預設游標
        canvas.style.cursor = 'grab';
        
        if (activePointerId !== null) {
            try {
                canvas.releasePointerCapture(activePointerId);
            } catch (err) {
                // ignore if release not supported
            }
        }
        activePointerId = null;

        // 最終校正：若選取存在且長度 < 0.2 秒，擴張到最小長度
        if (accumulatedWaveform && selectionStart !== null && selectionEnd !== null) {
            var s0 = Math.min(selectionStart, selectionEnd);
            var e0 = Math.max(selectionStart, selectionEnd);
            var effRateF = (accumulatedWaveform.sourceSampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
            var minSamplesF = Math.ceil(0.2 * effRateF);
            if ((e0 - s0) < minSamplesF) {
                // 盡量向右/下延長；若到邊界，則向左/上補足
                var targetEnd = Math.min(accumulatedWaveform.sampleCount - 1, s0 + minSamplesF);
                var needed = minSamplesF - (e0 - s0);
                if (targetEnd > e0) {
                    e0 = targetEnd;
                } else if (s0 > 0) {
                    s0 = Math.max(0, e0 - minSamplesF);
                }
                selectionStart = s0;
                selectionEnd = e0;
                accumulatedWaveform.draw();
            }
        }

        // 選取狀態可能已變更，更新按鈕狀態
        updatePlaybackButtonsState();
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);

    canvas.addEventListener('wheel', function(event) {
        if (!accumulatedWaveform) {
            return;
        }

        event.preventDefault();

        var rect = canvas.getBoundingClientRect();
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();

        if (event.ctrlKey || event.metaKey) {
            // Ctrl/Command + 滾輪：以指標位置為錨點縮放
            var step = event.deltaY > 0 ? -1 : 1;
            if (step !== 0) {
                var anchorRatio = isVertical ? ((event.clientY - rect.top) / rect.height) : ((event.clientX - rect.left) / rect.width);
                accumulatedWaveform.zoomBySteps(step, anchorRatio);
            }
        } else {
            // 一般滾輪：平移視圖（支援水平與垂直）
            var delta = isVertical ? event.deltaY : (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY);
            if (event.shiftKey && event.deltaY !== 0) {
                delta = event.deltaY;
            }
            if (delta !== 0) {
                accumulatedWaveform.panByPixels(delta);
            }
        }
    }, { passive: false });

    var zoomInButton = accumulatedControls.zoomIn;
    var zoomOutButton = accumulatedControls.zoomOut;
    var zoomResetButton = accumulatedControls.zoomReset;
    var panLeftButton = accumulatedControls.panLeft;
    var panRightButton = accumulatedControls.panRight;

    if (zoomInButton) {
        zoomInButton.addEventListener('click', function() {
            if (!accumulatedWaveform) {
                return;
            }
            accumulatedWaveform.zoomBySteps(1, 0.5);
        });
    }

    if (zoomOutButton) {
        zoomOutButton.addEventListener('click', function() {
            if (!accumulatedWaveform) {
                return;
            }
            accumulatedWaveform.zoomBySteps(-1, 0.5);
        });
    }

    if (zoomResetButton) {
        zoomResetButton.addEventListener('click', function() {
            if (!accumulatedWaveform) {
                return;
            }
            accumulatedWaveform.resetView();
        });
    }

    if (panLeftButton) {
        panLeftButton.addEventListener('click', function() {
            if (!accumulatedWaveform) {
                return;
            }
            var step = Math.round(accumulatedWaveform.getVisibleSamples() * 0.25);
            accumulatedWaveform.panBySamples(-step);
        });
    }

    if (panRightButton) {
        panRightButton.addEventListener('click', function() {
            if (!accumulatedWaveform) {
                return;
            }
            var step = Math.round(accumulatedWaveform.getVisibleSamples() * 0.25);
            accumulatedWaveform.panBySamples(step);
        });
    }
    
    // 播放按鈕
    // (舊) toolbar 播放按鈕已移除，播放改由主控制區按鈕
}

/**
 * 顯示選取區域播放界面
 */
// (移除) showSelectionPlaybackUI: 選取播放控制改由主播放按鈕處理

/**
 * 計算選取區域的時長
 */
function calculateSelectionDuration(startSample, endSample) {
    if (!accumulatedWaveform) {
        return '0:00';
    }
    
    var sampleCount = Math.abs(endSample - startSample);
    var sampleRate = accumulatedWaveform.sourceSampleRate;
    var effectiveSampleRate = sampleRate / accumulatedWaveform.decimationFactor;
    var durationSeconds = sampleCount / effectiveSampleRate;
    
    return calculateTimeDuration(durationSeconds);
}

/**
 * 播放選取的區域
 */
// (移除) playSelectedRegion: 改由 playSelectedOrFullAudio 整合處理

/**
 * 清除選取區域
 */
// (移除) clearSelection: 若需清除可直接設置 selectionStart/End = null 並 redraw

/**
 * 綁定全局波形的互動控制
 * @param {HTMLCanvasElement} canvas - 全局波形使用的畫布
 */
function bindOverviewWaveformInteractions(canvas) {
    if (!canvas) {
        return;
    }
    
    var isDragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragStartViewStart = 0;
    var isInViewWindow = false;
    var activePointerId = null;
    
    // 邊緣拉伸相關變數
    var isResizing = false;
    var resizeEdge = null; // 'left' 或 'right'
    var resizeStartX = 0;
    var resizeStartY = 0;
    var resizeStartViewStart = 0;
    var resizeStartVisibleSamples = 0;
    var edgeThreshold = 10; // 邊緣檢測閾值（畫素）
    
    // 檢查點擊位置是否在視窗指示器內
    function isInsideViewWindow(clientCoordX, clientCoordY) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return false;
        }
        
        var rect = canvas.getBoundingClientRect();
        var clickX = clientCoordX - rect.left;
        var clickY = clientCoordY - rect.top;
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        var sampleCount = accumulatedWaveform.sampleCount;
        var viewStart = accumulatedWaveform.viewStart;
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        
        if (!isVertical) {
            var viewStartX = (viewStart / sampleCount) * rect.width;
            var viewWidth = (visibleSamples / sampleCount) * rect.width;
            return clickX >= viewStartX && clickX <= (viewStartX + viewWidth);
        } else {
            var viewStartY = (viewStart / sampleCount) * rect.height;
            var viewHeight = (visibleSamples / sampleCount) * rect.height;
            return clickY >= viewStartY && clickY <= (viewStartY + viewHeight);
        }
    }
    
    // 檢查是否在視窗邊緣
    function getResizeEdge(clientCoordX, clientCoordY) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return null;
        }
        
        var rect = canvas.getBoundingClientRect();
        var clickX = clientCoordX - rect.left;
        var clickY = clientCoordY - rect.top;
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        var sampleCount = accumulatedWaveform.sampleCount;
        var viewStart = accumulatedWaveform.viewStart;
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        
        if (!isVertical) {
            var viewStartX = (viewStart / sampleCount) * rect.width;
            var viewEndX = ((viewStart + visibleSamples) / sampleCount) * rect.width;
            if (Math.abs(clickX - viewStartX) <= edgeThreshold) return 'left';
            if (Math.abs(clickX - viewEndX) <= edgeThreshold) return 'right';
        } else {
            var viewStartY = (viewStart / sampleCount) * rect.height;
            var viewEndY = ((viewStart + visibleSamples) / sampleCount) * rect.height;
            if (Math.abs(clickY - viewStartY) <= edgeThreshold) return 'top';
            if (Math.abs(clickY - viewEndY) <= edgeThreshold) return 'bottom';
        }
        
        return null;
    }
    
    // 更新鼠標樣式
    function updateCursor(clientX, clientY) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            canvas.style.cursor = 'default';
            return;
        }
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        
        if (isDragging) {
            if (isResizing) {
                canvas.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
            } else {
                canvas.style.cursor = 'grabbing';
            }
            return;
        }
        
        var edge = getResizeEdge(clientX, clientY);
        if (edge) {
            canvas.style.cursor = isVertical ? 'ns-resize' : 'ew-resize';
        } else if (isInsideViewWindow(clientX, clientY)) {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'pointer';
        }
    }
    
    canvas.addEventListener('pointerdown', function(event) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return;
        }
        
        var rect = canvas.getBoundingClientRect();
        var clickX = event.clientX - rect.left;
        var clickY = event.clientY - rect.top;
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
        
        isDragging = true;
        activePointerId = event.pointerId;
    dragStartX = clickX;
    dragStartY = clickY;
        dragStartViewStart = accumulatedWaveform.viewStart;
        
        // 檢查是否在邊緣進行拉伸
        var edge = getResizeEdge(event.clientX, event.clientY);
        if (edge) {
            isResizing = true;
            resizeEdge = edge;
            resizeStartX = clickX;
            resizeStartY = clickY;
            resizeStartViewStart = accumulatedWaveform.viewStart;
            resizeStartVisibleSamples = accumulatedWaveform.getVisibleSamples();
            } else {
                isResizing = false;
                resizeEdge = null;
                isInViewWindow = isInsideViewWindow(event.clientX, event.clientY);

                var clickRatio = isVertical ? (clickY / rect.height) : (clickX / rect.width);
                var targetSample = Math.floor(clickRatio * accumulatedWaveform.sampleCount);
                var effRateO = (accumulatedWaveform.sourceSampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
                var desiredWindowSamples = Math.max(1, Math.ceil(defaultWindowSeconds * effRateO));
                if (desiredWindowSamples > accumulatedWaveform.sampleCount) desiredWindowSamples = accumulatedWaveform.sampleCount;
                var halfWin = Math.floor(desiredWindowSamples / 2);

                // 若在視窗內點擊，且未拖曳（之後 pointerup 判斷），我們改成重新聚焦該點為中心的預設視窗；若在視窗外則跳轉聚焦。
                if (!isInViewWindow) {
                var clickRatio = isVertical ? (clickY / rect.height) : (clickX / rect.width);
                var targetSample = Math.floor(clickRatio * accumulatedWaveform.sampleCount);
                    var startSel = Math.max(0, targetSample - halfWin);
                    if (startSel + desiredWindowSamples > accumulatedWaveform.sampleCount) {
                        startSel = Math.max(0, accumulatedWaveform.sampleCount - desiredWindowSamples);
                    }
                    var endSel = Math.min(accumulatedWaveform.sampleCount - 1, startSel + desiredWindowSamples);
                    selectionStart = startSel;
                    selectionEnd = endSel;
                    var targetZoom = accumulatedWaveform.sampleCount / desiredWindowSamples;
                    if (!isFinite(targetZoom) || targetZoom < 1) targetZoom = 1;
                    accumulatedWaveform.zoomFactor = targetZoom;
                    accumulatedWaveform.viewStart = startSel;
                accumulatedWaveform.isAutoScroll = false;
                accumulatedWaveform._enforceViewBounds();
                accumulatedWaveform.draw();
                updatePlaybackButtonsState();
                
                // 更新拖動起始位置
                dragStartX = clickX;
                dragStartY = clickY;
                dragStartViewStart = accumulatedWaveform.viewStart;
                isInViewWindow = true;
                } else {
                    // 先記錄點擊，用於 pointerup 判斷是否為點擊而非拖曳
                    dragStartX = clickX;
                    dragStartY = clickY;
                    dragStartViewStart = accumulatedWaveform.viewStart;
                    // 標記將在 pointerup 進行聚焦判斷
                    isInViewWindow = true;
            }
        }
        
        try {
            canvas.setPointerCapture(activePointerId);
        } catch (err) {
            // ignore if not supported
        }
        
        updateCursor(event.clientX, event.clientY);
    });
    
    canvas.addEventListener('pointermove', function(event) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return;
        }
        
        var rect = canvas.getBoundingClientRect();
        
        // 更新鼠標樣式
        if (!isDragging) {
            updateCursor(event.clientX, event.clientY);
        }
        
        if (!isDragging || event.pointerId !== activePointerId) {
            return;
        }
        
        var currentX = event.clientX - rect.left;
        var currentY = event.clientY - rect.top;
        var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
    var deltaPrimary = isVertical ? (currentY - (isResizing ? resizeStartY : dragStartY)) : (currentX - (isResizing ? resizeStartX : dragStartX));
        var sampleCount = accumulatedWaveform.sampleCount;
        
        if (isResizing) {
            // 處理邊緣拉伸
            var deltaSamples = Math.floor(((isVertical ? (currentY - (isResizing ? resizeStartY : dragStartY)) : (currentX - (isResizing ? resizeStartX : dragStartX))) / (isVertical ? rect.height : rect.width)) * sampleCount);
            
            if (resizeEdge === 'left' || resizeEdge === 'top') {
                // 拉伸左邊緣：調整 viewStart 和 visibleSamples
                var newViewStart = resizeStartViewStart + deltaSamples;
                var newVisibleSamples = resizeStartVisibleSamples - deltaSamples;
                
                // 限制最小可視範圍
                var minVisible = accumulatedWaveform._getMinVisibleSamples(sampleCount);
                if (newVisibleSamples < minVisible) {
                    newVisibleSamples = minVisible;
                    newViewStart = resizeStartViewStart + resizeStartVisibleSamples - minVisible;
                }
                
                // 確保不超出邊界
                if (newViewStart < 0) {
                    newVisibleSamples += newViewStart;
                    newViewStart = 0;
                }
                
                if (newVisibleSamples > 0) {
                    accumulatedWaveform.viewStart = newViewStart;
                    accumulatedWaveform.zoomFactor = sampleCount / newVisibleSamples;
                }
            } else if (resizeEdge === 'right' || resizeEdge === 'bottom') {
                // 拉伸右邊緣：只調整 visibleSamples
                var newVisibleSamples = resizeStartVisibleSamples + deltaSamples;
                
                // 限制最小可視範圍
                var minVisible = accumulatedWaveform._getMinVisibleSamples(sampleCount);
                if (newVisibleSamples < minVisible) {
                    newVisibleSamples = minVisible;
                }
                
                // 確保不超出邊界
                var maxEnd = sampleCount - resizeStartViewStart;
                if (newVisibleSamples > maxEnd) {
                    newVisibleSamples = maxEnd;
                }
                
                if (newVisibleSamples > 0) {
                    accumulatedWaveform.zoomFactor = sampleCount / newVisibleSamples;
                }
            }
            
            accumulatedWaveform.isAutoScroll = false;
            accumulatedWaveform._enforceViewBounds();
            accumulatedWaveform.draw();
        } else {
            // 處理視窗拖動
            var deltaSamples = Math.floor(((isVertical ? (currentY - dragStartY) : (currentX - dragStartX)) / (isVertical ? rect.height : rect.width)) * sampleCount);
            
            accumulatedWaveform.viewStart = dragStartViewStart + deltaSamples;
            accumulatedWaveform.isAutoScroll = false;
            accumulatedWaveform._enforceViewBounds();
            accumulatedWaveform.draw();
        }
    });
    
    function endDrag(event) {
        if (event && event.pointerId !== activePointerId) {
            return;
        }
        
        isDragging = false;
        isResizing = false;
        resizeEdge = null;
        
        if (activePointerId !== null) {
            try {
                canvas.releasePointerCapture(activePointerId);
            } catch (err) {
                // ignore if release not supported
            }
        }
        activePointerId = null;
        
        // 恢復鼠標樣式
        if (event) {
            updateCursor(event.clientX, event.clientY);
        } else {
            canvas.style.cursor = 'default';
        }

        // 若原本在視窗內點擊且幾乎沒拖曳，則聚焦 defaultWindowSeconds 視窗置中於點擊位置
        if (event && isInViewWindow && accumulatedWaveform && accumulatedWaveform.sampleCount) {
            var rect = canvas.getBoundingClientRect();
            var releaseX = event.clientX - rect.left;
            var releaseY = event.clientY - rect.top;
            var isVertical = orientationManager && orientationManager.isVertical && orientationManager.isVertical();
            var moveDist = Math.sqrt(Math.pow(releaseX - dragStartX,2) + Math.pow(releaseY - dragStartY,2));
            if (moveDist < 5) { // 視為點擊
                var clickRatio = isVertical ? (releaseY / rect.height) : (releaseX / rect.width);
                var targetSample = Math.floor(clickRatio * accumulatedWaveform.sampleCount);
                var effRateO = (accumulatedWaveform.sourceSampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
                var desiredWindowSamples = Math.max(1, Math.ceil(defaultWindowSeconds * effRateO));
                if (desiredWindowSamples > accumulatedWaveform.sampleCount) desiredWindowSamples = accumulatedWaveform.sampleCount;
                var halfWin = Math.floor(desiredWindowSamples / 2);
                var startSel = Math.max(0, targetSample - halfWin);
                if (startSel + desiredWindowSamples > accumulatedWaveform.sampleCount) {
                    startSel = Math.max(0, accumulatedWaveform.sampleCount - desiredWindowSamples);
                }
                var endSel = Math.min(accumulatedWaveform.sampleCount - 1, startSel + desiredWindowSamples);
                selectionStart = startSel;
                selectionEnd = endSel;
                var targetZoom = accumulatedWaveform.sampleCount / desiredWindowSamples;
                if (!isFinite(targetZoom) || targetZoom < 1) targetZoom = 1;
                accumulatedWaveform.zoomFactor = targetZoom;
                accumulatedWaveform.viewStart = startSel;
                accumulatedWaveform.isAutoScroll = false;
                accumulatedWaveform._enforceViewBounds();
                accumulatedWaveform.draw();
                updatePlaybackButtonsState();
            }
        }
    }
    
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function(event) {
        if (!isDragging) {
            canvas.style.cursor = 'default';
        }
    });
    
    canvas.addEventListener('pointerenter', function(event) {
        if (!isDragging) {
            updateCursor(event.clientX, event.clientY);
        }
    });
}

/*=================================================================
 * 停止錄音回調函數
 * 處理錄音停止後的各種操作：波形生成、檔案上傳等
 *================================================================*/

/**
 * 錄音停止後的回調函數
 * 處理錄音數據、生成波形、上傳檔案等操作
 */
function stopRecordingCallback() {
    /*---------------------------------------------------------------
     * 獲取錄音器內部數據
     * 從 RecordRTC 獲取左右聲道的原始音頻數據
     *--------------------------------------------------------------*/
    
    // 獲取 StereoAudioRecorder 物件（內部錄音器）
    var internalRecorder = recorder.getInternalRecorder();
    
    // 獲取左右聲道數據
    var leftchannel = internalRecorder.leftchannel;   // 左聲道數據
    var rightchannel = internalRecorder.rightchannel; // 右聲道數據

    /*---------------------------------------------------------------
     * 生成自定義 WAV 檔案
     * 使用原始 PCM 數據手動創建 WAV 格式音頻
     *--------------------------------------------------------------*/
    
    // 調用音頻緩衝區合併函數，生成最終的 WAV 檔案
    mergeLeftRightBuffers({
        desiredSampRate: internalRecorder.desiredSampRate,           // 目標採樣率
        sampleRate: internalRecorder.sampleRate,                     // 原始採樣率
        numberOfAudioChannels: internalRecorder.numberOfAudioChannels, // 聲道數量
        internalInterleavedLength: internalRecorder.recordingLength,  // 錄音長度
        leftBuffers: leftchannel,                                     // 左聲道緩衝區
        rightBuffers: internalRecorder.numberOfAudioChannels === 1 ? [] : rightchannel // 右聲道緩衝區（單聲道時為空陣列）
    }, function(buffer, view) {
        /*-----------------------------------------------------------
         * WAV 檔案生成完成回調
         * 將生成的音頻數據載入到播放器
         *----------------------------------------------------------*/
        
        // 創建 Blob 物件（WAV 格式）
        var blob = new Blob([buffer], {
            type: 'audio/wav'
        });

        if (latestRecordingUrl) {
            URL.revokeObjectURL(latestRecordingUrl);
            latestRecordingUrl = null;
        }

        latestRecordingBlob = blob;
        latestRecordingUrl = URL.createObjectURL(blob);

    // 將音頻載入到主播放器
    audio.srcObject = null;
    audio.src = latestRecordingUrl;
    // 錄音完成後才解除 muted 並顯示控制列，避免 iOS 將情境視為邊錄邊播而降低輸入音量
    try { audio.muted = false; audio.controls = true; } catch(e){}

    // 錄音完成後預設顯示 defaultWindowSeconds 秒視窗（若總長度 >= 該秒數），並建立選取區
        try {
            if (accumulatedWaveform && accumulatedWaveform.sampleCount > 0 && audioContext) {
                var effRate = (accumulatedWaveform.sourceSampleRate || audioContext.sampleRate || 48000) / Math.max(1, accumulatedWaveform.decimationFactor || 1);
                var samples1s = Math.max(1, Math.ceil(defaultWindowSeconds * effRate));
                var totalSamples = accumulatedWaveform.sampleCount;
                var windowSamples = Math.min(samples1s, totalSamples);
                // 對齊視窗到最開頭
                accumulatedWaveform.zoomFactor = totalSamples / windowSamples;
                accumulatedWaveform.viewStart = 0;
                accumulatedWaveform.isAutoScroll = false;
                // 不建立初始選取區：清除選取
                selectionStart = null;
                selectionEnd = null;
                accumulatedWaveform._enforceViewBounds();
                accumulatedWaveform.draw();
                updatePlaybackButtonsState();
            }
    } catch(e) { console.warn('設定預設視窗失敗', e); }
        
        /*-----------------------------------------------------------
         * 清理即時波形顯示
         * 停止即時波形並清理資源
         *----------------------------------------------------------*/
        if (liveWaveform) {
            liveWaveform.stop();
            liveWaveform = null;
        }

        if (downloadButton) {
            downloadButton.disabled = false;
        }

        // 有可播放錄音後，更新播放按鈕狀態
        updatePlaybackButtonsState();
        // 最終輸出規格（含 size/duration）
        gatherAndRenderSpecs();
        // 更新錄音時長顯示（最終）
        if (audioContext && pcmTotalSamples > 0) {
            var durationSecs = pcmTotalSamples / audioContext.sampleRate;
            var timeStr = calculateTimeDuration(durationSecs, true);
            var samplesStr = pcmTotalSamples.toLocaleString();
            document.querySelector('#recording-duration').innerHTML = 
                '錄音時長：' + timeStr + ' | 樣本數：' + samplesStr;
        }
    });

    /*---------------------------------------------------------------
     * 停止麥克風並上傳檔案
     * 清理資源並開始檔案上傳流程
     *--------------------------------------------------------------*/
    
    recorder.microphone.stop(); // 停止麥克風錄音
    var button = this;           // 保存按鈕引用
    
    // 上傳錄音檔案到伺服器
    uploadToServer(recorder, function(progress, fileURL) {
        if(progress === 'ended') {
            // 上傳完成：更新按鈕狀態為下載連結
            button.disabled = false;
            button.innerHTML = 'Click to download from server';
            button.onclick = function() {
                window.open(fileURL); // 開啟下載連結
            };
            return;
        }
        // 上傳進行中：更新按鈕文字顯示進度
        button.innerHTML = progress;
    });

    recorder = null; // 清空錄音器引用
}

/*=================================================================
 * 全域錄音器變數
 * 用於在不同函數間共享錄音器實例
 *================================================================*/
var recorder; // 全域可訪問的錄音器物件
var isCurrentlyRecording = false; // 追蹤當前錄音狀態

/*=================================================================
 * 上傳相關 - 全域函式（供 RecordRTC 與 Worklet 共用）
 *================================================================*/
var listOfFilesUploaded = [];

function uploadToServer(recordSource, callback) {
    try {
        var blob = (recordSource instanceof Blob) ? recordSource : (recordSource && recordSource.blob);
        if (!blob) { callback && callback('no-blob'); return; }
        var fileType = blob.type.split('/')[0] || 'audio';
        var fileName = 'xxx_' + (Math.random() * 1000).toString().replace('.', '');
        if (fileType === 'audio') { fileName += (!!navigator.mozGetUserMedia ? '.ogg' : '.wav'); } else { fileName += '.webm'; }
        var formData = new FormData();
        formData.append(fileType + '-filename', fileName);
        formData.append(fileType + '-blob', blob);
        callback && callback('Uploading ' + fileType + ' recording to server.');
        var upload_url = 'save.php';
        var upload_directory = 'uploads/';
        makeXMLHttpRequest(upload_url, formData, function(progress){
            if (progress !== 'upload-ended') { callback && callback(progress); return; }
            callback && callback('ended', upload_directory + fileName);
            listOfFilesUploaded.push(upload_directory + fileName);
        });
    } catch(e) {
        console.error('uploadToServer error', e);
        callback && callback('upload-error');
    }
}

function makeXMLHttpRequest(url, data, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState == 4 && request.status == 200) {
            callback('upload-ended');
        }
    };
    request.upload.onloadstart = function() { callback('Upload started...'); };
    request.upload.onprogress = function(e){ if (e && e.total) callback('Upload Progress ' + Math.round(e.loaded/e.total*100) + '%'); };
    request.upload.onload = function(){ callback('progress-ended'); };
    request.upload.onerror = function(err){ callback('Failed to upload to server'); console.error('XHR failed', err); };
    request.upload.onabort = function(err){ callback('Upload aborted.'); console.error('XHR aborted', err); };
    request.open('POST', url);
    request.send(data);
}

/*=================================================================
 * 錄音切換按鈕事件處理
 * 處理使用者點擊錄音切換按鈕時的所有邏輯（開始/停止錄音）
 *================================================================*/

document.getElementById('btn-toggle-recording').onclick = function() {
    if (!isCurrentlyRecording) {
        // 開始錄音
        startRecording.call(this);
    } else {
        // 停止錄音
        stopRecording.call(this);
    }
};

// 綁定主播放控制按鈕
if (btnPlay) {
    btnPlay.addEventListener('click', function() {
        // 確保 AudioContext 可用
        initializeAudioContext().then(function(){
            if (audioContext.state === 'suspended') {
                return audioContext.resume();
            }
        }).finally(function(){
            playSelectedOrFullAudio();
            updatePlaybackButtonsState();
        });
    });
}

function pausePlayback() {
    if (selectionAudioSource) {
        try { selectionAudioSource.onended = null; selectionAudioSource.stop(); } catch(e) {}
        selectionAudioSource = null;
    }
    if (accumulatedWaveform) {
        accumulatedWaveform.stopPlayback();
        // 不重置播放位置，保留於暫停點
    }
    updatePlaybackButtonsState();
}

if (btnPause) {
    btnPause.addEventListener('click', function(){
        pausePlayback();
        ensureVUMeterRunning();
    });
}

function stopPlaybackAll() {
    if (selectionAudioSource) {
        try { selectionAudioSource.onended = null; selectionAudioSource.stop(); } catch(e) {}
        selectionAudioSource = null;
    }
    if (accumulatedWaveform) {
        accumulatedWaveform.stopPlayback();
        // 將播放位置重置至選取起點或開頭
        if (selectionStart !== null && selectionEnd !== null) {
            accumulatedWaveform.setPlaybackPosition(Math.min(selectionStart, selectionEnd));
        } else {
            accumulatedWaveform.setPlaybackPosition(0);
        }
    }
    updatePlaybackButtonsState();
}

if (btnStopPlayback) {
    btnStopPlayback.addEventListener('click', function(){
        stopPlaybackAll();
        ensureVUMeterRunning();
    });
}

// 回到開始：將播放位置、視圖、播放動畫全部回到開頭
function jumpToStart() {
    if (selectionAudioSource) {
        try { selectionAudioSource.onended = null; selectionAudioSource.stop(); } catch(e) {}
        selectionAudioSource = null;
    }
    if (accumulatedWaveform) {
        accumulatedWaveform.stopPlayback();
        accumulatedWaveform.setPlaybackPosition(0);
        accumulatedWaveform.isAutoScroll = false;
        accumulatedWaveform.draw();
    }
    updatePlaybackButtonsState();
}

if (btnJumpStart) {
    btnJumpStart.addEventListener('click', function(){
        jumpToStart();
        ensureVUMeterRunning();
    });
}

// 新增：清除選取區間
function clearSelection() {
    // 若正在播放，使用暫停以保留播放位置
    if (selectionAudioSource || (accumulatedWaveform && accumulatedWaveform.isPlaying)) {
        pausePlayback();
    }
    selectionStart = null;
    selectionEnd = null;
    if (accumulatedWaveform) {
        accumulatedWaveform.draw();
    }
    updatePlaybackButtonsState();
}

if (btnClearSelection) {
    btnClearSelection.addEventListener('click', function(){
        clearSelection();
        ensureVUMeterRunning();
    });
}

/*=================================================================
 * 開始錄音函數
 * 處理開始錄音時的所有邏輯
 *================================================================*/

function startRecording() {
    var toggleButton = document.getElementById('btn-toggle-recording');
    
    /*---------------------------------------------------------------
     * 初始化錄音狀態
     * 設定各種狀態變數並清理之前的錄音
     *--------------------------------------------------------------*/
    isCurrentlyRecording = true;    // 設定為錄音中
    is_ready_to_record = false;     // 設定為非準備狀態
    is_recording = true;            // 設定為錄音中
    is_recorded = false;            // 設定為未完成錄音
    // 掉樣估時計時起點
    recordWallStartMs = performance.now();
    recordWallStopMs = 0;
    
    // 更新按鈕樣式和文字
    toggleButton.classList.add('recording');
    toggleButton.innerHTML = '■ 停止錄音';


    if (downloadButton) {
        downloadButton.disabled = true;
    }

    if (latestRecordingUrl) {
        URL.revokeObjectURL(latestRecordingUrl);
        latestRecordingUrl = null;
    }
    latestRecordingBlob = null;
    
    // 清理之前的即時波形顯示
    if (liveWaveform) {
        liveWaveform.stop();
        liveWaveform = null;
    }

    // 錄音開始時停用播放控制
    updatePlaybackButtonsState();

    /*---------------------------------------------------------------
     * 先恢復/初始化 AudioContext（確保在使用者手勢中進行）
     * 之後再請求麥克風，避免 iOS/Safari 因非手勢啟動而失敗
     *--------------------------------------------------------------*/
    initializeAudioContext().then(function(){
        // 確保 preGainNode 連接到 analyser（可能在上次錄音結束時被斷開）
        try {
            if (preGainNode && analyser) {
                preGainNode.connect(analyser);
            }
        } catch(e) {
            // 如果已經連接會拋出錯誤，靜默忽略
        }
        
        /*-----------------------------------------------------------
         * 捕獲麥克風並開始錄音
         *----------------------------------------------------------*/
        captureMicrophone(function(microphone) {
            // 將麥克風音頻流設定到主音頻元素（可選，不自動播放）
            try { audio.srcObject = microphone; } catch(e) { console.warn('set srcObject failed', e); }

            /*-------------------------------------------------------
             * 初始化即時波形顯示
             *------------------------------------------------------*/
            var liveCanvas = document.getElementById('waveform');
            liveWaveform = liveCanvas ? new LiveWaveform(liveCanvas, analyser) : null;
            if (liveWaveform) {
                liveWaveform.start(microphone);
            }

            /*-------------------------------------------------------
             * 初始化累積與總覽波形
             *------------------------------------------------------*/
            var accumulatedCanvas = document.getElementById('accumulated-waveform');
            
            // 如果已存在 accumulatedWaveform，重用它（重置狀態）
            if (!accumulatedWaveform && accumulatedCanvas) {
                accumulatedWaveform = new AccumulatedWaveform(accumulatedCanvas);
            }
            
            // 重置累積波形狀態（清空數據）
            if (accumulatedWaveform) {
                accumulatedWaveform.sampleMin = [];
                accumulatedWaveform.sampleMax = [];
                accumulatedWaveform.sampleCount = 0;
                accumulatedWaveform.zoomFactor = 1;
                accumulatedWaveform.viewStart = 0;
                accumulatedWaveform.isAutoScroll = true;
                accumulatedWaveform.playbackPosition = 0;
                accumulatedWaveform.isPlaying = false;
                if (accumulatedWaveform._useWorker && accumulatedWaveform._worker) {
                    // 通知 worker 重置
                    accumulatedWaveform._worker.postMessage({ type: 'reset' });
                }
                accumulatedWaveform.clear();
            }
            
            if (accumulatedCanvas) {
                bindAccumulatedWaveformInteractions(accumulatedCanvas);
                // 初始化 Raw 視窗縮放偏好
                try { if (typeof accumulatedWaveform.setRawZoomMode === 'function') accumulatedWaveform.setRawZoomMode(rawZoomPref); } catch(e){}
            }
            
            var overviewCanvas = document.getElementById('overview-waveform');
            
            // 如果已存在 overviewWaveform，重用它
            if (!overviewWaveform && overviewCanvas && accumulatedWaveform) {
                overviewWaveform = new OverviewWaveform(overviewCanvas, accumulatedWaveform);
            }
            
            // 更新 overviewWaveform 的引用並清空
            if (overviewWaveform && accumulatedWaveform) {
                overviewWaveform.accumulatedWaveform = accumulatedWaveform;
                overviewWaveform.clear();
            }
            
            if (overviewCanvas) {
                bindOverviewWaveformInteractions(overviewCanvas);
            }

            // 綁定/啟動 VU Meter
            var vuCanvas = document.getElementById('vu-meter');
            if (vuCanvas) {
                if (!vuMeter) {
                    vuMeter = new VUMeter(vuCanvas, analyser);
                } else {
                    // 停止舊的動畫循環
                    vuMeter.stop();
                    // 更新 analyser 引用
                    vuMeter.analyser = analyser;
                    // 確保 canvas context 有效（重新獲取）
                    try {
                        vuMeter.ctx = vuCanvas.getContext('2d');
                    } catch(e) {
                        console.warn('重新獲取 VU Meter canvas context 失敗', e);
                    }
                    // 重置狀態
                    vuMeter.levelDb = -90;
                    vuMeter.peakDb = -90;
                    vuMeter.holdPeakDb = -90;
                    vuMeter.lastPeakTime = 0;
                }
                vuMeter.start();
            }

            // 重新定位 mini-level 元素（確保每次錄音都正確顯示）
            try { 
                placeMiniLevel(); 
                syncMiniLevelWidth(); 
            } catch(e) { 
                console.warn('重新定位 mini-level 失敗', e); 
            }

            // 依目前模式調整尺寸
            applyDisplayMode();

            /*-------------------------------------------------------
             * 初始化 RecordRTC 並開始錄音
             *------------------------------------------------------*/
            // 若 Worklet 可用，使用 Worklet 直接收集 PCM；否則回退 RecordRTC
            if (workletSupported && workletLoaded) {
                usingWorklet = true;
                pcmChunks = []; pcmTotalSamples = 0;
                // 建立工作節點
                try {
                    pcmCollectorNode = new AudioWorkletNode(audioContext, 'pcm-collector', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        outputChannelCount: [1]
                    });
                    // 連接：preGain -> worklet -> silencer（保持節點活躍）
                    preGainNode.connect(pcmCollectorNode);
                    pcmCollectorNode.connect(analyserSilencer);
                    // 收資料
                    pcmCollectorNode.port.onmessage = function(ev){
                        var data = ev.data || {};
                        if (data.type === 'pcm' && data.buffer && data.length) {
                            try {
                                // 檢查記憶體限制（在新增資料前）
                                if (!checkRecordingMemoryLimit()) {
                                    return; // 已達上限，停止處理新資料
                                }
                                
                                var f32 = new Float32Array(data.buffer, 0, data.length);
                                // 複製出獨立緩衝避免之後被覆寫
                                var copy = new Float32Array(f32.length);
                                copy.set(f32);
                                pcmChunks.push(copy);
                                pcmTotalSamples += copy.length;
                                // 直接將新片段 append 至累積波形
                                if (accumulatedWaveform) {
                                    if (!accumulatedWaveform.sourceSampleRate && audioContext) {
                                        accumulatedWaveform.sourceSampleRate = audioContext.sampleRate;
                                        var target = accumulatedWaveform.targetSampleRate || 5000;
                                        accumulatedWaveform.decimationFactor = Math.max(1, Math.floor((audioContext.sampleRate||48000)/target));
                                    }
                                    accumulatedWaveform.append(copy);
                                }
                            } catch(e) { 
                                showError('處理錄音資料時發生錯誤', e);
                            }
                        }
                    };
                    // 規格更新
                    gatherAndRenderSpecs();
                    setTimeout(gatherAndRenderSpecs, 500);
                    setTimeout(gatherAndRenderSpecs, 1500);
                } catch (e) {
                    console.warn('建立 Worklet 失敗，回退 RecordRTC:', e);
                    usingWorklet = false;
                }
            }

            if (!usingWorklet) {
                try {
                    // 若已有處理後的 mediaDest，使用其串流進行錄製以套用前級增益
                    var recordStream = (mediaDest && mediaDest.stream) ? mediaDest.stream : microphone;
                    recorder = RecordRTC(recordStream, {
                        type: 'audio',
                        mimeType: 'audio/wav',
                        recorderType: StereoAudioRecorder,
                        numberOfAudioChannels: 1,
                        bufferSize: 4096,
                        timeSlice: 100,
                        ondataavailable: function(blob) {
                            appendBlobToAccumulatedWaveform(blob);
                            gatherAndRenderSpecs();
                        }
                    });
                    recorder.startRecording();
                    gatherAndRenderSpecs();
                    setTimeout(gatherAndRenderSpecs, 500);
                    setTimeout(gatherAndRenderSpecs, 1500);
                } catch(recErr) {
                    showError('RecordRTC 初始化失敗', recErr);
                    isCurrentlyRecording = false;
                    is_ready_to_record = true;
                    is_recording = false;
                    toggleButton.classList.remove('recording');
                    toggleButton.innerHTML = '● 開始錄音';
                    var agcToggle = document.getElementById('agc-toggle');
                    if (agcToggle) agcToggle.disabled = false;
                    return;
                }
            }

            // 開始計時顯示
            dateStarted = new Date().getTime();
            (function looper() {
                // 僅在錄音期間更新，停止後不再排程
                if (!isCurrentlyRecording) return;
                var elapsedSecs = (new Date().getTime() - dateStarted) / 1000;
                var timeStr = calculateTimeDuration(elapsedSecs, true); // 顯示毫秒
                var samplesStr = pcmTotalSamples.toLocaleString(); // 格式化數字加千分位
                document.querySelector('#recording-duration').innerHTML = 
                    '錄音時長：' + timeStr + ' | 樣本數：' + samplesStr;
                setTimeout(looper, 100); // 每100ms更新一次以顯示毫秒
            })();

            // 保留原始麥克風參考（供 specs 顯示 track 設定）
            if (recorder) recorder.microphone = microphone;
        });
    }).catch(function(err){
        showError('無法啟動音頻系統', err);
        // 錯誤時恢復按鈕狀態
        isCurrentlyRecording = false;
        is_ready_to_record = true;
        is_recording = false;
        toggleButton.classList.remove('recording');
        toggleButton.innerHTML = '● 開始錄音';
        var agcToggle = document.getElementById('agc-toggle');
        if (agcToggle) agcToggle.disabled = false;
    });
}

/*=================================================================
 * 停止錄音函數
 * 處理停止錄音時的所有邏輯
 *================================================================*/

function stopRecording() {
    var toggleButton = document.getElementById('btn-toggle-recording');
    
    /*---------------------------------------------------------------
     * 更新錄音狀態
     * 設定各種狀態變數並觸發停止錄音流程
     *--------------------------------------------------------------*/
    isCurrentlyRecording = false;            // 設定為非錄音中
    // 掉樣估時計時終點
    recordWallStopMs = performance.now();
    if (usingWorklet) {
        // 停止 Worklet：斷開連線並封裝 WAV
        try {
            if (pcmCollectorNode) {
                pcmCollectorNode.port.onmessage = null;
                preGainNode && preGainNode.disconnect(pcmCollectorNode);
                pcmCollectorNode.disconnect();
            }
        } catch(e){ console.warn('斷開 Worklet 失敗', e); }
        // 組裝最終 PCM -> WAV
        finalizeWorkletRecording();
        // 關閉麥克風串流
        try {
            if (currentMicStream) { currentMicStream.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} }); }
        } catch(e){ console.warn('停止麥克風串流失敗', e); }
        currentMicStream = null;
        usingWorklet = false;
    } else if (recorder) {
        recorder.stopRecording(stopRecordingCallback); // 停止錄音並執行回調
        // RecordRTC 路徑在 stopRecordingCallback 裡面會呼叫 recorder.microphone.stop()
        try {
            if (currentMicStream) { currentMicStream.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} }); }
        } catch(e){ console.warn('停止麥克風串流失敗', e); }
        currentMicStream = null;
    }

    // 立即停止即時波形，避免仍連著前級節點導致 VU Meter 跳動
    try { if (liveWaveform) { liveWaveform.stop(); liveWaveform = null; } } catch(e){}
    // 解除 audio 元素的即時串流來源
    try { if (audio && audio.srcObject) { audio.srcObject = null; } } catch(e){}
    
    // 更新狀態變數
    is_ready_to_record = true;               // 設定為準備錄音狀態
    is_recording = false;                    // 設定為非錄音中
    is_recorded = true;                      // 設定為已完成錄音
    
    // 更新按鈕樣式和文字
    toggleButton.classList.remove('recording');
    toggleButton.innerHTML = '● 開始錄音';
    // 等待 stopRecordingCallback 生成 blob 後再啟用播放

    // 保留 VU Meter 繼續更新（播放階段仍需顯示）
    // 停止瞬間（Blob 尚未生成）先更新一次，稍後 stopRecordingCallback 會再更新
    gatherAndRenderSpecs();
}

function finalizeWorkletRecording(){
    try {
        if (!pcmChunks.length || !audioContext) {
            showToast('無錄音資料或 AudioContext 缺失');
            return;
        }
        var total = pcmTotalSamples;
        var merged = new Float32Array(total);
        var offset = 0;
        for (var i=0;i<pcmChunks.length;i++) { merged.set(pcmChunks[i], offset); offset += pcmChunks[i].length; }
        // 轉成 16-bit PCM WAV
        var wavBuffer = buildWavFromFloat32Mono(merged, audioContext.sampleRate);
        var blob = new Blob([wavBuffer], { type:'audio/wav' });
        if (latestRecordingUrl) { URL.revokeObjectURL(latestRecordingUrl); latestRecordingUrl=null; }
        latestRecordingBlob = blob;
        latestRecordingUrl = URL.createObjectURL(blob);
        audio.srcObject = null;
        audio.src = latestRecordingUrl;
        try { audio.muted = false; audio.controls = true; } catch(e){}
        // 設定預設視窗（不建立選取區）
        try {
            if (accumulatedWaveform && accumulatedWaveform.sampleCount>0 && audioContext) {
                var effRate = (accumulatedWaveform.sourceSampleRate || audioContext.sampleRate)/Math.max(1, accumulatedWaveform.decimationFactor||1);
                var samplesWin = Math.max(1, Math.ceil(defaultWindowSeconds * effRate));
                var totalS = accumulatedWaveform.sampleCount;
                var windowSamples = Math.min(samplesWin, totalS);
                accumulatedWaveform.zoomFactor = totalS / windowSamples;
                accumulatedWaveform.viewStart = 0;
                accumulatedWaveform.isAutoScroll = false;
                // 清除任何既有選取區
                selectionStart = null;
                selectionEnd = null;
                accumulatedWaveform._enforceViewBounds();
                accumulatedWaveform.draw();
            }
        } catch(e){ console.warn('預設視窗設定失敗', e); }
        if (liveWaveform) { try { liveWaveform.stop(); } catch(_){} liveWaveform=null; }
        if (downloadButton) {
            downloadButton.disabled = false;
            // 綁定下載動作
            downloadButton.onclick = function(){ if(latestRecordingUrl) window.open(latestRecordingUrl); };
        }
        // 啟動上傳（重用全域 uploadToServer）
        uploadToServer(blob, function(progress, fileURL){
            var btn = downloadButton;
            if (!btn) return;
            if (progress === 'ended') {
                btn.innerHTML = 'Server Download';
                btn.onclick = function(){ window.open(fileURL); };
            } else if (progress && typeof progress === 'string') {
                btn.innerHTML = progress;
            }
        });
        updatePlaybackButtonsState();
        gatherAndRenderSpecs();
        // 更新錄音時長顯示（最終）
        if (audioContext && pcmTotalSamples > 0) {
            var durationSecs = pcmTotalSamples / audioContext.sampleRate;
            var timeStr = calculateTimeDuration(durationSecs, true);
            var samplesStr = pcmTotalSamples.toLocaleString();
            document.querySelector('#recording-duration').innerHTML = 
                '錄音時長：' + timeStr + ' | 樣本數：' + samplesStr;
        }
        showToast('錄音完成 (Worklet)');
        // 停止後 VU Meter 若需繼續顯示播放音訊會由 playback source 重新驅動；此處斷開 preGain 與 analyser 以停止原輸入能量
        try { if (preGainNode) preGainNode.disconnect(analyser); } catch(e){}
    } catch(e){ console.error('finalizeWorkletRecording failed', e); showToast('封裝錄音失敗'); }
}

function buildWavFromFloat32Mono(float32, sampleRate){
    var bytesPerSample = 2;
    var blockAlign = bytesPerSample * 1;
    var byteRate = sampleRate * blockAlign;
    var dataSize = float32.length * bytesPerSample;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    var writeStr = function(off,str){ for(var i=0;i<str.length;i++) view.setUint8(off+i,str.charCodeAt(i)); };
    writeStr(0,'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8,'WAVE');
    writeStr(12,'fmt ');
    view.setUint32(16,16,true); // PCM chunk size
    view.setUint16(20,1,true); // PCM format
    view.setUint16(22,1,true); // channels
    view.setUint32(24,sampleRate,true);
    view.setUint32(28,byteRate,true);
    view.setUint16(32,blockAlign,true);
    view.setUint16(34,bytesPerSample*8,true);
    writeStr(36,'data');
    view.setUint32(40,dataSize,true);
    // PCM samples
    var offset = 44;
    for (var i=0;i<float32.length;i++) {
        var s = float32[i];
        // 軟削波 + clamp（與原邏輯一致）
        if (s > 1) s = 1; else if (s < -1) s = -1;
        var soft = Math.tanh(s * 2.2) / Math.tanh(2.2);
        var v = Math.max(-1, Math.min(1, soft));
        var int16 = v < 0 ? v * 0x8000 : v * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
    }
    return buffer;
}

// 測試音控制已移除

if (downloadButton) {
    downloadButton.onclick = function() {
        if (!latestRecordingBlob) {
            return;
        }

        var downloadUrl = URL.createObjectURL(latestRecordingBlob);
        var anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = downloadUrl;
        anchor.download = 'recording-' + new Date().toISOString().replace(/[:.]/g, '-') + '.wav';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        setTimeout(function() {
            URL.revokeObjectURL(downloadUrl);
        }, 0);
    };
}

/*=================================================================
 * 音頻處理工具函數
 * 以下函數處理原始 PCM 數據並生成 WAV 檔案
 * (改編自 StereoAudioRecorder.js，用於說明如何處理原始 PCM 數據)
 *================================================================*/

/**
 * 合併左右聲道緩衝區
 * 將分離的左右聲道數據合併為完整的音頻檔案
 * @param {Object} config - 音頻配置物件
 * @param {function} callback - 完成回調函數
 */
function mergeLeftRightBuffers(config, callback) {
    /**
     * 音頻緩衝區合併主函數
     * 處理聲道合併、採樣率轉換、WAV 格式生成
     * @param {Object} config - 音頻配置參數
     * @param {function} cb - 回調函數
     */
    function mergeAudioBuffers(config, cb) {
        var numberOfAudioChannels = config.numberOfAudioChannels; // 聲道數量

        /*-----------------------------------------------------------
         * 複製音頻緩衝區數據
         * 使用 slice(0) 創建數據副本以避免修改原始數據
         *----------------------------------------------------------*/
        var leftBuffers = config.leftBuffers.slice(0);   // 左聲道緩衝區副本
        var rightBuffers = config.rightBuffers.slice(0); // 右聲道緩衝區副本
        var sampleRate = config.sampleRate;              // 原始採樣率
        var internalInterleavedLength = config.internalInterleavedLength; // 交錯數據長度
        var desiredSampRate = config.desiredSampRate;    // 目標採樣率

        /*-----------------------------------------------------------
         * 處理立體聲音頻 (雙聲道)
         * 合併緩衝區並進行採樣率轉換
         *----------------------------------------------------------*/
        if (numberOfAudioChannels === 2) {
            leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);   // 合併左聲道
            rightBuffers = mergeBuffers(rightBuffers, internalInterleavedLength); // 合併右聲道
            
            // 如果需要改變採樣率，進行插值處理
            if (desiredSampRate) {
                leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
                rightBuffers = interpolateArray(rightBuffers, desiredSampRate, sampleRate);
            }
        }

        /*-----------------------------------------------------------
         * 處理單聲道音頻
         * 只需處理左聲道數據
         *----------------------------------------------------------*/
        if (numberOfAudioChannels === 1) {
            leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength); // 合併左聲道
            
            // 如果需要改變採樣率，進行插值處理
            if (desiredSampRate) {
                leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
            }
        }

        /*-----------------------------------------------------------
         * 更新採樣率
         * 如果指定了目標採樣率，更新當前採樣率變數
         *----------------------------------------------------------*/
        if (desiredSampRate) {
            sampleRate = desiredSampRate; // 設定為目標採樣率
        }

        /*-----------------------------------------------------------
         * 採樣率轉換相關函數
         * 參考資料: http://stackoverflow.com/a/28977136/552182
         *----------------------------------------------------------*/
        
        /**
         * 陣列插值函數 - 用於採樣率轉換
         * 使用線性插值將音頻數據從一個採樣率轉換到另一個採樣率
         * @param {Array} data - 原始音頻數據陣列
         * @param {number} newSampleRate - 目標採樣率
         * @param {number} oldSampleRate - 原始採樣率
         * @returns {Array} 轉換後的音頻數據陣列
         */
        function interpolateArray(data, newSampleRate, oldSampleRate) {
            var fitCount = Math.round(data.length * (newSampleRate / oldSampleRate)); // 計算新陣列長度
            var newData = [];                                                          // 新數據陣列
            var springFactor = Number((data.length - 1) / (fitCount - 1));        // 插值彈性係數
            
            newData[0] = data[0]; // 設定第一個數據點（邊界條件）
            
            // 對中間的數據點進行線性插值
            for (var i = 1; i < fitCount - 1; i++) {
                var tmp = i * springFactor;                                        // 計算插值位置
                var before = Number(Math.floor(tmp)).toFixed();                    // 前一個數據點索引
                var after = Number(Math.ceil(tmp)).toFixed();                      // 後一個數據點索引
                var atPoint = tmp - before;                                        // 插值權重
                newData[i] = linearInterpolate(data[before], data[after], atPoint); // 線性插值計算
            }
            
            newData[fitCount - 1] = data[data.length - 1]; // 設定最後一個數據點（邊界條件）
            return newData; // 返回插值後的數據
        }

        /**
         * 線性插值函數
         * 在兩個數據點之間進行線性插值
         * @param {number} before - 前一個數據點的值
         * @param {number} after - 後一個數據點的值
         * @param {number} atPoint - 插值位置 (0-1 之間)
         * @returns {number} 插值結果
         */
        function linearInterpolate(before, after, atPoint) {
            return before + (after - before) * atPoint; // 線性插值計算公式
        }

        /**
         * 合併多個音頻緩衝區
         * 將多個小的音頻緩衝區合併為一個連續的大緩衝區
         * @param {Array} channelBuffer - 音頻緩衝區陣列
         * @param {number} rLength - 結果陣列的總長度
         * @returns {Float64Array} 合併後的音頻數據
         */
        function mergeBuffers(channelBuffer, rLength) {
            var result = new Float64Array(rLength); // 創建結果陣列
            var offset = 0;                         // 偏移量指針
            var lng = channelBuffer.length;         // 緩衝區數量

            // 逐個複製緩衝區數據到結果陣列
            for (var i = 0; i < lng; i++) {
                var buffer = channelBuffer[i];      // 當前緩衝區
                result.set(buffer, offset);         // 複製數據到指定位置
                offset += buffer.length;            // 更新偏移量
            }

            return result; // 返回合併後的數據
        }

        /**
         * 交錯左右聲道數據
         * 將分離的左右聲道數據交錯排列為立體聲格式
         * @param {Array} leftChannel - 左聲道數據
         * @param {Array} rightChannel - 右聲道數據
         * @returns {Float64Array} 交錯後的立體聲數據
         */
        function interleave(leftChannel, rightChannel) {
            var length = leftChannel.length + rightChannel.length; // 總數據長度
            var result = new Float64Array(length);                  // 結果陣列
            var inputIndex = 0;                                     // 輸入索引

            // 交錯排列左右聲道數據：L R L R L R...
            for (var index = 0; index < length;) {
                result[index++] = leftChannel[inputIndex];  // 左聲道
                result[index++] = rightChannel[inputIndex]; // 右聲道
                inputIndex++;                               // 移至下一組數據
            }
            return result; // 返回交錯後的數據
        }

        /**
         * 將字串寫入 DataView
         * 用於在 WAV 檔案中寫入 UTF-8 字串（如 "RIFF", "WAVE" 等標識符）
         * @param {DataView} view - DataView 物件
         * @param {number} offset - 寫入偏移量
         * @param {string} string - 要寫入的字串
         */
        function writeUTFBytes(view, offset, string) {
            var lng = string.length; // 字串長度
            // 逐字元寫入字串的 UTF-8 編碼
            for (var i = 0; i < lng; i++) {
                view.setUint8(offset + i, string.charCodeAt(i)); // 寫入字元的 ASCII 碼
            }
        }

        // interleave both channels together
        var interleaved;

        if (numberOfAudioChannels === 2) {
            interleaved = interleave(leftBuffers, rightBuffers);
        }

        if (numberOfAudioChannels === 1) {
            interleaved = leftBuffers;
        }

        var interleavedLength = interleaved.length;

        // create wav file
        var resultingBufferLength = 44 + interleavedLength * 2;

        var buffer = new ArrayBuffer(resultingBufferLength);

        var view = new DataView(buffer);

        // RIFF chunk descriptor/identifier 
        writeUTFBytes(view, 0, 'RIFF');

        // RIFF chunk length
        view.setUint32(4, 44 + interleavedLength * 2, true);

        // RIFF type 
        writeUTFBytes(view, 8, 'WAVE');

        // format chunk identifier 
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');

        // format chunk length 
        view.setUint32(16, 16, true);

        // sample format (raw)
        view.setUint16(20, 1, true);

        // stereo (2 channels)
        view.setUint16(22, numberOfAudioChannels, true);

        // sample rate 
        view.setUint32(24, sampleRate, true);

        // byte rate (sample rate * block align)
        view.setUint32(28, sampleRate * 2, true);

        // block align (channel count * bytes per sample) 
        view.setUint16(32, numberOfAudioChannels * 2, true);

        // bits per sample 
        view.setUint16(34, 16, true);

        // data sub-chunk
        // data chunk identifier 
        writeUTFBytes(view, 36, 'data');

        // data chunk length 
        view.setUint32(40, interleavedLength * 2, true);

        // write the PCM samples (with clamp, soft-clip stats)
        var lng = interleavedLength;
        var index = 44;
        var volume = 1;
        var clippedSamples = 0;
        var maxAbsSample = 0;
        for (var i = 0; i < lng; i++) {
            var s = interleaved[i];
            if (s > 1) s = 1; else if (s < -1) s = -1;
            if (s > 0.90) { // 軟削波區（只處理正峰；負峰用對稱）
                var sign = s < 0 ? -1 : 1;
                s = sign * Math.tanh(Math.abs(s) * 2);
            }
            var absS = Math.abs(s);
            if (absS > maxAbsSample) maxAbsSample = absS;
            if (absS >= 0.995) clippedSamples++;
            view.setInt16(index, s * (0x7FFF * volume), true);
            index += 2;
        }
        try { window.__lastClipStats = { fromEncoder:true, clippedSamples:clippedSamples, maxAbs:maxAbsSample, totalSamples:lng, ts:Date.now() }; } catch(e){}

        if (cb) {
            return cb({
                buffer: buffer,
                view: view
            });
        }

        postMessage({
            buffer: buffer,
            view: view
        });
    }

    /*---------------------------------------------------------------
     * 瀏覽器兼容性處理
     * 不同瀏覽器使用不同的音頻處理方式
     *--------------------------------------------------------------*/
    if (!isChrome) {
        // Microsoft Edge 瀏覽器：直接在主線程處理
        mergeAudioBuffers(config, function(data) {
            callback(data.buffer, data.view); // 返回處理結果
        });
        return;
    }

    /*---------------------------------------------------------------
     * Chrome 瀏覽器：使用 Web Worker 處理
     * 在背景線程中處理音頻以避免阻塞 UI
     *--------------------------------------------------------------*/
    var webWorker = processInWebWorker(mergeAudioBuffers); // 創建 Web Worker

    // 監聽 Worker 處理完成事件
    webWorker.onmessage = function(event) {
        callback(event.data.buffer, event.data.view); // 返回處理結果
        URL.revokeObjectURL(webWorker.workerURL);      // 釋放記憶體
    };

    webWorker.postMessage(config); // 發送配置數據給 Worker
}

/**
 * 在 Web Worker 中處理函數
 * 創建一個 Web Worker 來在背景線程執行指定函數
 * @param {Function} _function - 要在 Worker 中執行的函數
 * @returns {Worker} Web Worker 實例
 */
function processInWebWorker(_function) {
    // 創建包含函數代碼的 Blob URL
    var workerURL = URL.createObjectURL(new Blob([
        _function.toString(),  // 函數的字串表示
        ';this.onmessage = function (eee) {' + _function.name + '(eee.data);}'  // Worker 訊息處理器
    ], {
        type: 'application/javascript'  // MIME 類型
    }));

    var worker = new Worker(workerURL);  // 創建 Worker
    worker.workerURL = workerURL;        // 保存 URL 引用以便後續清理
    return worker;                       // 返回 Worker 實例
}

/*=================================================================
 * AGC 控制初始化
 * 處理 AGC 開關的互動邏輯
 *================================================================*/

// 等待 DOM 載入完成
(function initAGCControl() {
    // 獲取 AGC 開關元素
    var agcToggle = document.getElementById('agc-toggle');
    var toggleButton = document.getElementById('btn-toggle-recording');
    
    if (!agcToggle) {
        return; // 如果找不到元素，直接返回
    }
    
    // 監聽 AGC 開關變更事件
    agcToggle.addEventListener('change', function() {
        if (!isCurrentlyRecording) {
            // 只有在未錄音時才允許變更
            var message = this.checked 
                ? 'AGC 已啟用：錄音時會自動調整音量，但可能有 1-3 秒的初始延遲'
                : 'AGC 已停用：錄音將立即開始，但音量可能較小且不穩定';
            
            // 顯示提示訊息（可選）
            console.log(message);
        } else {
            // 如果正在錄音，提示使用者
            alert('請先停止錄音後再變更 AGC 設定');
            // 恢復原來的狀態
            this.checked = !this.checked;
        }
    });
    
    // 錄音時禁用 AGC 開關
    var originalToggleOnClick = toggleButton ? toggleButton.onclick : null;
    if (toggleButton && originalToggleOnClick) {
        toggleButton.onclick = function() {
            if (!isCurrentlyRecording) {
                // 開始錄音時禁用 AGC 開關
                agcToggle.disabled = true;
            } else {
                // 停止錄音時重新啟用 AGC 開關
                agcToggle.disabled = false;
            }
            return originalToggleOnClick.call(this);
        };
    }
})();
