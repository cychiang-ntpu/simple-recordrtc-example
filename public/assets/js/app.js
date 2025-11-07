/*=================================================================
 * 全域變數宣告區域
 * 定義應用程式中需要的主要變數和狀態
 *================================================================*/

// DOM 元素引用
var audio = document.querySelector('audio');                    // 主要音頻播放元素
var audioBlobsContainer = document.querySelector('#audio-blobs-container'); // 錄音片段容器
var downloadButton = document.getElementById('btn-download-recording');     // 下載按鈕

// 錄音狀態控制變數
var is_ready_to_record = true;   // 是否準備好錄音
var is_recording = false;        // 是否正在錄音
var is_recorded = false;         // 是否已完成錄音

// Web Audio API 相關物件
var audioContext = null; // 音頻上下文（延遲初始化）
var analyser = null;     // 音頻分析器（延遲初始化）
var analyserSilencer = null; // 用於避免回授的靜音輸出節點

// 即時/累積波形顯示變數
var liveWaveform = null;          // 即時波形顯示器實例
var accumulatedWaveform = null;   // 累積波形顯示器實例
var overviewWaveform = null;      // 全局波形顯示器實例
var latestRecordingBlob = null;   // 最近一次錄音的 Blob
var latestRecordingUrl = null;    // 最近一次錄音的 Object URL
var accumulatedControlsBound = false; // 是否已綁定累積波形互動

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
    playSelection: document.getElementById('accum-play-selection'),
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
        accumulatedControls.panRight,
        accumulatedControls.playSelection
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

        // 為了讓音訊節點圖保有出口，避免回授的同時保持數據流
        analyserSilencer = audioContext.createGain();
        analyserSilencer.gain.value = 0;
        analyser.connect(analyserSilencer);
        analyserSilencer.connect(audioContext.destination);
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
}

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

        // 連接麥克風到 analyser
        self.mediaStreamSource = audioContext.createMediaStreamSource(stream);
        self.mediaStreamSource.connect(self.analyser);

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
        
        // 應用振幅放大
        normalized = normalized * this.amplification;
        
        // 限制範圍在 -1 到 1
        if (normalized > 1) {
            normalized = 1;
        } else if (normalized < -1) {
            normalized = -1;
        }

        var y = centerY + normalized * centerY;             // 以畫布中心為基準上下擺動

        if (i === 0) {
            this.canvasContext.moveTo(x, y);
        } else {
            this.canvasContext.lineTo(x, y);
        }

        x += sliceWidth;
    }

    this.canvasContext.stroke();
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
    this.canvasContext = canvas.getContext('2d');
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

    this.clear();
    setAccumulatedControlsEnabled(false);
}

/**
 * 清空畫布並重繪基準線
 */
AccumulatedWaveform.prototype.clear = function() {
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

    this.draw();
};

/**
 * 繪製累積波形
 */
AccumulatedWaveform.prototype.draw = function() {
    this.clear();

    if (!this.sampleCount) {
        return;
    }

    var ctx = this.canvasContext;
    var width = this.width;
    var height = this.height;
    var totalSamples = this.sampleCount;
    var centerY = height / 2;
    var visibleSamples = this.getVisibleSamples();

    if (this.viewStart + visibleSamples > totalSamples) {
        this.viewStart = Math.max(0, totalSamples - visibleSamples);
    }

    var startSample = this.viewStart;
    var endSample = Math.min(totalSamples, startSample + visibleSamples);
    var samplesPerPixel = visibleSamples / width;

    ctx.strokeStyle = '#1E88E5';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (samplesPerPixel <= 1) {
        var spacing = visibleSamples > 1 ? width / (visibleSamples - 1) : width;
        for (var i = 0; i < visibleSamples; i++) {
            var sampleIndex = startSample + i;
            if (sampleIndex >= endSample) {
                break;
            }

            var pair = this._getSamplePair(sampleIndex);
            if (!pair) {
                continue;
            }

            var columnOffset = (pair.max + pair.min) / 2;
            var adjustedMax = pair.max - columnOffset;
            var adjustedMin = pair.min - columnOffset;

            if (adjustedMax > 1) adjustedMax = 1;
            if (adjustedMax < -1) adjustedMax = -1;
            if (adjustedMin > 1) adjustedMin = 1;
            if (adjustedMin < -1) adjustedMin = -1;

            var drawX = visibleSamples > 1 ? i * spacing : width / 2;
            var yTop = centerY - adjustedMax * centerY;
            var yBottom = centerY - adjustedMin * centerY;

            ctx.moveTo(drawX + 0.5, yTop);
            ctx.lineTo(drawX + 0.5, yBottom);
        }
    } else {
        for (var x = 0; x < width; x++) {
            var rangeStart = startSample + x * samplesPerPixel;
            var rangeEnd = rangeStart + samplesPerPixel;
            var startIdx = Math.max(Math.floor(rangeStart), startSample);
            var endIdx = Math.min(Math.floor(rangeEnd), endSample - 1);

            if (endIdx < startIdx) {
                endIdx = startIdx;
            }

            var min = 1.0;
            var max = -1.0;

            for (var idx = startIdx; idx <= endIdx; idx++) {
                var samplePair = this._getSamplePair(idx);
                if (!samplePair) {
                    continue;
                }
                if (samplePair.min < min) {
                    min = samplePair.min;
                }
                if (samplePair.max > max) {
                    max = samplePair.max;
                }
            }

            if (min > max) {
                continue;
            }

            var columnOffsetLarge = (max + min) / 2;
            var adjustedMaxLarge = max - columnOffsetLarge;
            var adjustedMinLarge = min - columnOffsetLarge;

            if (adjustedMaxLarge > 1) adjustedMaxLarge = 1;
            if (adjustedMaxLarge < -1) adjustedMaxLarge = -1;
            if (adjustedMinLarge > 1) adjustedMinLarge = 1;
            if (adjustedMinLarge < -1) adjustedMinLarge = -1;

            var yTop = centerY - adjustedMaxLarge * centerY;
            var yBottom = centerY - adjustedMinLarge * centerY;

            ctx.moveTo(x + 0.5, yTop);
            ctx.lineTo(x + 0.5, yBottom);
        }
    }

    ctx.stroke();
    
    // 繪製選取區域
    if (selectionStart !== null && selectionEnd !== null) {
        var selStart = Math.min(selectionStart, selectionEnd);
        var selEnd = Math.max(selectionStart, selectionEnd);
        
        // 只繪製在可視範圍內的選取
        if (selEnd >= startSample && selStart <= endSample) {
            var visStart = Math.max(selStart, startSample);
            var visEnd = Math.min(selEnd, endSample);
            
            var selStartX = ((visStart - startSample) / visibleSamples) * width;
            var selEndX = ((visEnd - startSample) / visibleSamples) * width;
            
            // 繪製半透明選取區域
            ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
            ctx.fillRect(selStartX, 0, selEndX - selStartX, height);
            
            // 繪製選取邊界線
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(selStartX, 0);
            ctx.lineTo(selStartX, height);
            ctx.moveTo(selEndX, 0);
            ctx.lineTo(selEndX, height);
            ctx.stroke();
            
            // 繪製可拖曳的圓形手柄（觸控友善）
            var handleRadius = 12;
            var handleY = height / 2;
            
            // 左側手柄
            if (selStart >= startSample) {
                ctx.fillStyle = '#4CAF50';
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(selStartX, handleY, handleRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // 左側手柄內部指示器
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(selStartX - 4, handleY - 5);
                ctx.lineTo(selStartX - 4, handleY + 5);
                ctx.moveTo(selStartX, handleY - 5);
                ctx.lineTo(selStartX, handleY + 5);
                ctx.moveTo(selStartX + 4, handleY - 5);
                ctx.lineTo(selStartX + 4, handleY + 5);
                ctx.stroke();
            }
            
            // 右側手柄
            if (selEnd <= endSample) {
                ctx.fillStyle = '#4CAF50';
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(selEndX, handleY, handleRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // 右側手柄內部指示器
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(selEndX - 4, handleY - 5);
                ctx.lineTo(selEndX - 4, handleY + 5);
                ctx.moveTo(selEndX, handleY - 5);
                ctx.lineTo(selEndX, handleY + 5);
                ctx.moveTo(selEndX + 4, handleY - 5);
                ctx.lineTo(selEndX + 4, handleY + 5);
                ctx.stroke();
            }
        }
    }
    
    // 繪製播放位置指示器（紅色垂直線）
    if (this.playbackPosition >= 0 && this.playbackPosition <= totalSamples) {
        // 檢查播放位置是否在可視範圍內
        if (this.playbackPosition >= startSample && this.playbackPosition <= endSample) {
            var playbackX = ((this.playbackPosition - startSample) / visibleSamples) * width;
            
            // 繪製紅色垂直線
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playbackX, 0);
            ctx.lineTo(playbackX, height);
            ctx.stroke();
            
            // 繪製頂部三角形指示器
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.moveTo(playbackX, 0);
            ctx.lineTo(playbackX - 6, 10);
            ctx.lineTo(playbackX + 6, 10);
            ctx.closePath();
            ctx.fill();
            
            // 繪製底部三角形指示器
            ctx.beginPath();
            ctx.moveTo(playbackX, height);
            ctx.lineTo(playbackX - 6, height - 10);
            ctx.lineTo(playbackX + 6, height - 10);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // 同步更新全局波形視圖
    if (overviewWaveform) {
        overviewWaveform.draw();
    }
};

/**
 * 取得目前可視範圍內的樣本數
 * @returns {number} 可視樣本數
 */
AccumulatedWaveform.prototype.getVisibleSamples = function() {
    if (!this.sampleCount) {
        return 0;
    }

    var total = this.sampleCount;
    var minVisible = this._getMinVisibleSamples(total);
    var visible = Math.round(total / this.zoomFactor);

    if (visible < minVisible) {
        visible = minVisible;
    }
    if (visible > total) {
        visible = total;
    }

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

    var minSpan;
    if (total <= this.width) {
        minSpan = Math.max(1, Math.ceil(total / 6));
    } else {
        minSpan = Math.max(1, Math.floor(this.width / 2));
    }

    if (minSpan > total) {
        minSpan = total;
    }

    return minSpan;
};

/**
 * 依據目前縮放狀態調整視窗邊界
 */
AccumulatedWaveform.prototype._enforceViewBounds = function() {
    if (!this.sampleCount) {
        this.viewStart = 0;
        return;
    }

    var total = this.sampleCount;
    var visible = this.getVisibleSamples();

    if (visible >= total) {
        this.viewStart = 0;
        return;
    }

    if (this.viewStart < 0) {
        this.viewStart = 0;
    }

    if (this.viewStart + visible > total) {
        this.viewStart = total - visible;
    }
};

/**
 * 捲動視圖到最新資料
 */
AccumulatedWaveform.prototype.scrollToLatest = function() {
    if (!this.sampleCount) {
        this.viewStart = 0;
        return;
    }

    var visible = this.getVisibleSamples();

    if (visible >= this.sampleCount) {
        this.viewStart = 0;
    } else {
        this.viewStart = this.sampleCount - visible;
    }
};

/**
 * 設定縮放倍率
 * @param {number} targetZoom - 目標縮放倍率
 * @param {number} [anchorSample] - 錨點樣本索引，用於維持放大中心
 */
AccumulatedWaveform.prototype.setZoom = function(targetZoom, anchorSample) {
    if (!this.sampleCount) {
        return;
    }

    var total = this.sampleCount;
    var minVisible = this._getMinVisibleSamples(total);
    var maxZoom = total / minVisible;
    if (!isFinite(maxZoom) || maxZoom < 1) {
        maxZoom = 1;
    }

    if (targetZoom < 1) {
        targetZoom = 1;
    }
    if (targetZoom > maxZoom) {
        targetZoom = maxZoom;
    }

    if (targetZoom === this.zoomFactor) {
        return;
    }

    var previousVisible = this.getVisibleSamples();
    this.zoomFactor = targetZoom;
    var newVisible = this.getVisibleSamples();

    if (anchorSample === undefined || anchorSample === null) {
        anchorSample = this.viewStart + previousVisible / 2;
    }

    this.isAutoScroll = false;

    var relative = previousVisible ? (anchorSample - this.viewStart) / previousVisible : 0.5;
    if (!isFinite(relative)) {
        relative = 0.5;
    }

    this.viewStart = Math.round(anchorSample - relative * newVisible);
    this._enforceViewBounds();
    this.draw();
};

/**
 * 依指定的級距進行縮放
 * @param {number} stepCount - 正值放大，負值縮小
 * @param {number} [anchorRatio] - 錨點相對位置 (0~1) 用於保持焦點
 */
AccumulatedWaveform.prototype.zoomBySteps = function(stepCount, anchorRatio) {
    if (!this.sampleCount || !stepCount) {
        return;
    }

    var anchorSample = null;
    if (anchorRatio !== undefined && anchorRatio !== null && this.sampleCount) {
        if (anchorRatio < 0) {
            anchorRatio = 0;
        } else if (anchorRatio > 1) {
            anchorRatio = 1;
        }
        anchorSample = this.viewStart + anchorRatio * this.getVisibleSamples();
    }

    var zoomBase = 1.5;
    var targetZoom = this.zoomFactor * Math.pow(zoomBase, stepCount);
    this.setZoom(targetZoom, anchorSample);
};

/**
 * 依樣本量平移視圖
 * @param {number} sampleDelta - 正值向右，負值向左
 */
AccumulatedWaveform.prototype.panBySamples = function(sampleDelta) {
    if (!this.sampleCount || !sampleDelta) {
        return;
    }

    this.isAutoScroll = false;
    this.viewStart += sampleDelta;
    this._panRemainder = 0;
    this._enforceViewBounds();
    this.draw();
};

/**
 * 依畫素量平移視圖
 * @param {number} pixelDelta - 以畫素為單位的位移
 */
AccumulatedWaveform.prototype.panByPixels = function(pixelDelta) {
    if (!this.sampleCount || !pixelDelta) {
        return;
    }

    var samplesPerPixel = this.getVisibleSamples() / this.width;
    this._panRemainder += pixelDelta * samplesPerPixel;
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
    if (!this.sampleCount) {
        this.zoomFactor = 1;
        this.viewStart = 0;
        this.isAutoScroll = true;
        this._panRemainder = 0;
        this.draw();
        return;
    }

    this.zoomFactor = 1;
    this._panRemainder = 0;
    this.isAutoScroll = true;
    this.scrollToLatest();
    this.draw();
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
    this.canvasContext = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.accumulatedWaveform = accumulatedWaveform;
    
    this.clear();
}

/**
 * 清空畫布
 */
OverviewWaveform.prototype.clear = function() {
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
    
    this.clear();
    
    var sampleCount = this.accumulatedWaveform.sampleCount;
    if (!sampleCount) {
        return;
    }
    
    var ctx = this.canvasContext;
    var width = this.width;
    var height = this.height;
    var centerY = height / 2;
    
    // 繪製整體波形（簡化版本）
    var samplesPerPixel = sampleCount / width;
    
    ctx.strokeStyle = '#9E9E9E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (var x = 0; x < width; x++) {
        var rangeStart = x * samplesPerPixel;
        var rangeEnd = rangeStart + samplesPerPixel;
        var startIdx = Math.floor(rangeStart);
        var endIdx = Math.min(Math.floor(rangeEnd), sampleCount - 1);
        
        if (endIdx < startIdx) {
            endIdx = startIdx;
        }
        
        var min = 1.0;
        var max = -1.0;
        
        for (var idx = startIdx; idx <= endIdx; idx++) {
            if (idx >= 0 && idx < this.accumulatedWaveform.sampleMin.length) {
                var sampleMin = this.accumulatedWaveform.sampleMin[idx];
                var sampleMax = this.accumulatedWaveform.sampleMax[idx];
                if (sampleMin < min) min = sampleMin;
                if (sampleMax > max) max = sampleMax;
            }
        }
        
        if (min > max) {
            continue;
        }
        
        // 去除 DC offset
        var columnOffset = (max + min) / 2;
        var adjustedMax = max - columnOffset;
        var adjustedMin = min - columnOffset;
        
        if (adjustedMax > 1) adjustedMax = 1;
        if (adjustedMax < -1) adjustedMax = -1;
        if (adjustedMin > 1) adjustedMin = 1;
        if (adjustedMin < -1) adjustedMin = -1;
        
        var yTop = centerY - adjustedMax * centerY * 0.9;
        var yBottom = centerY - adjustedMin * centerY * 0.9;
        
        ctx.moveTo(x + 0.5, yTop);
        ctx.lineTo(x + 0.5, yBottom);
    }
    
    ctx.stroke();
    
    // 繪製當前視窗指示器
    var viewStart = this.accumulatedWaveform.viewStart;
    var visibleSamples = this.accumulatedWaveform.getVisibleSamples();
    
    var viewStartX = (viewStart / sampleCount) * width;
    var viewWidth = (visibleSamples / sampleCount) * width;
    
    // 繪製半透明的視窗範圍
    ctx.fillStyle = 'rgba(30, 136, 229, 0.2)';
    ctx.fillRect(viewStartX, 0, viewWidth, height);
    
    // 繪製視窗邊框
    ctx.strokeStyle = '#1E88E5';
    ctx.lineWidth = 2;
    ctx.strokeRect(viewStartX, 0, viewWidth, height);
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
function calculateTimeDuration(secs) {
    var hr = Math.floor(secs / 3600);           // 計算小時
    var min = Math.floor((secs - (hr * 3600)) / 60); // 計算分鐘
    var sec = Math.floor(secs - (hr * 3600) - (min * 60)); // 計算秒數

    // 格式化分鐘：小於10時前面補0
    if (min < 10) {
        min = "0" + min;
    }

    // 格式化秒數：小於10時前面補0
    if (sec < 10) {
        sec = "0" + sec;
    }

    // 如果沒有小時，只顯示分:秒
    if(hr <= 0) {
        return min + ':' + sec;
    }

    // 有小時時顯示時:分:秒
    return hr + ':' + min + ':' + sec;
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
    
    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,    // 關閉回音消除
            noiseSuppression: false,    // 關閉噪音抑制
            autoGainControl: agcEnabled // 根據使用者設定啟用/停用 AGC
        },
        video: false                    // 不需要視頻
    }).then(function(microphone) {
        callback(microphone);           // 成功時執行回調
    }).catch(function(error) {
        // 錯誤處理：顯示錯誤訊息並記錄到控制台
        alert('Unable to capture your microphone. Please check console logs.');
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
        selectionAudioSource.connect(audioContext.destination);
        
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
        };
        
        selectionAudioSource.start(0);
        console.log('開始播放，時長: ' + duration.toFixed(2) + ' 秒');
        
    }).catch(function(error) {
        console.error('播放失敗:', error);
        if (accumulatedWaveform) {
            accumulatedWaveform.stopPlayback();
        }
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
    function getSelectionEdgeAt(x, rect) {
        if (selectionStart === null || selectionEnd === null) {
            return null;
        }
        
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        var selStart = Math.min(selectionStart, selectionEnd);
        var selEnd = Math.max(selectionStart, selectionEnd);
        
        // 轉換樣本位置到像素位置
        var leftSamplePos = selStart - accumulatedWaveform.viewStart;
        var rightSamplePos = selEnd - accumulatedWaveform.viewStart;
        
        var leftX = (leftSamplePos / visibleSamples) * rect.width;
        var rightX = (rightSamplePos / visibleSamples) * rect.width;
        
        // 檢查是否接近左邊緣
        if (Math.abs(x - leftX) <= edgeThreshold) {
            return 'left';
        }
        
        // 檢查是否接近右邊緣
        if (Math.abs(x - rightX) <= edgeThreshold) {
            return 'right';
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
        var edge = getSelectionEdgeAt(x, rect);
        
        if (event.shiftKey && edge) {
            canvas.style.cursor = 'ew-resize';
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
        
        // 記錄起始位置
        startX = event.clientX;
        startY = event.clientY;
        
        // 檢查是否按下 Shift 鍵或在邊緣（PC 操作）
        if (event.shiftKey) {
            clearLongPressTimer();
            
            // 檢查是否在選取區域邊緣
            var edge = getSelectionEdgeAt(clickX, rect);
            
            if (edge) {
                // 拉伸選取區域邊緣
                isResizingSelection = true;
                resizeEdge = edge;
                isDragging = false;
                isSelecting = false;
                canvas.style.cursor = 'ew-resize';
            } else {
                // 創建新的選取區域
                isSelecting = true;
                isDragging = false;
                isResizingSelection = false;
                selectionStartX = clickX;
                
                // 計算選取起始樣本
                var visibleSamples = accumulatedWaveform.getVisibleSamples();
                var sampleRatio = clickX / rect.width;
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
            var edge = getSelectionEdgeAt(clickX, rect);
            
            if (edge) {
                // 直接開始拉伸（無需 Shift，方便觸控操作）
                clearLongPressTimer();
                isResizingSelection = true;
                resizeEdge = edge;
                isDragging = false;
                isSelecting = false;
                canvas.style.cursor = 'ew-resize';
                
                // 觸控回饋
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            } else {
                // 先設置播放位置（點擊時立即設置）
                var visibleSamples = accumulatedWaveform.getVisibleSamples();
                var sampleRatio = clickX / rect.width;
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
                        selectionStartX = clickX;
                        
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
                lastX = event.clientX;
                accumulatedWaveform.isAutoScroll = false;
                canvas.style.cursor = 'grabbing';
            }
        } else {
            // 其他情況（如 Ctrl+點擊）：原有的拖曳行為
            clearLongPressTimer();
            isDragging = true;
            isSelecting = false;
            isResizingSelection = false;
            lastX = event.clientX;
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
            var sampleRatio = currentX / rect.width;
            var newSample = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
            
            // 限制在有效範圍內
            if (newSample < 0) newSample = 0;
            if (newSample >= accumulatedWaveform.sampleCount) {
                newSample = accumulatedWaveform.sampleCount - 1;
            }
            
            // 更新對應的邊緣
            if (resizeEdge === 'left') {
                selectionStart = newSample;
            } else if (resizeEdge === 'right') {
                selectionEnd = newSample;
            }
            
            accumulatedWaveform.draw();
            
        } else if (isSelecting) {
            // 更新選取範圍
            var visibleSamples = accumulatedWaveform.getVisibleSamples();
            var sampleRatio = currentX / rect.width;
            selectionEnd = Math.floor(accumulatedWaveform.viewStart + sampleRatio * visibleSamples);
            
            // 限制在有效範圍內
            if (selectionEnd < 0) selectionEnd = 0;
            if (selectionEnd >= accumulatedWaveform.sampleCount) {
                selectionEnd = accumulatedWaveform.sampleCount - 1;
            }
            
            accumulatedWaveform.draw();
            
        } else if (isDragging && !isLongPress) {
            // 平移波形（長按模式下不平移）
            var deltaX = event.clientX - lastX;
            if (deltaX !== 0) {
                accumulatedWaveform.panByPixels(-deltaX);
                lastX = event.clientX;
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
        
        if (isSelecting || isResizingSelection) {
            // 選取或拉伸完成，如果有選取區域則顯示播放選項
            if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
                showSelectionPlaybackUI();
            }
        }
        
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
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);

    canvas.addEventListener('wheel', function(event) {
        if (!accumulatedWaveform) {
            return;
        }

        event.preventDefault();

        if (event.ctrlKey || event.metaKey) {
            // Ctrl/Command + 滾輪：以指標位置為錨點縮放
            var step = event.deltaY > 0 ? -1 : 1;
            if (step !== 0) {
                var rect = canvas.getBoundingClientRect();
                var anchorRatio = (event.clientX - rect.left) / rect.width;
                accumulatedWaveform.zoomBySteps(step, anchorRatio);
            }
        } else {
            // 一般滾輪：平移視圖（支援水平與垂直）
            var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
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
    var playButton = accumulatedControls.playSelection;
    if (playButton) {
        playButton.addEventListener('click', function() {
            playSelectedOrFullAudio();
        });
    }
}

/**
 * 顯示選取區域播放界面
 */
function showSelectionPlaybackUI() {
    if (selectionStart === null || selectionEnd === null) {
        return;
    }
    
    var toolbar = accumulatedControls.toolbar;
    if (!toolbar) {
        return;
    }
    
    // 移除舊的播放控制（如果存在）
    var oldPlaybackControls = document.getElementById('selection-playback-controls');
    if (oldPlaybackControls) {
        oldPlaybackControls.remove();
    }
    
    // 創建播放控制容器
    var playbackControls = document.createElement('div');
    playbackControls.id = 'selection-playback-controls';
    playbackControls.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; margin-left: 15px; padding-left: 15px; border-left: 2px solid #ccc;';
    
    // 計算選取時長
    var selStart = Math.min(selectionStart, selectionEnd);
    var selEnd = Math.max(selectionStart, selectionEnd);
    var selectionDuration = calculateSelectionDuration(selStart, selEnd);
    
    // 時長顯示
    var durationLabel = document.createElement('span');
    durationLabel.style.cssText = 'font-size: 13px; color: #4CAF50; font-weight: bold;';
    durationLabel.textContent = '選取: ' + selectionDuration;
    
    // 播放按鈕
    var playButton = document.createElement('button');
    playButton.textContent = '▶ 播放選取';
    playButton.style.cssText = 'background-color: #4CAF50; color: white;';
    playButton.onclick = playSelectedRegion;
    
    // 清除選取按鈕
    var clearButton = document.createElement('button');
    clearButton.textContent = '✕ 清除選取';
    clearButton.style.cssText = 'background-color: #f44336; color: white;';
    clearButton.onclick = clearSelection;
    
    playbackControls.appendChild(durationLabel);
    playbackControls.appendChild(playButton);
    playbackControls.appendChild(clearButton);
    
    toolbar.appendChild(playbackControls);
}

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
function playSelectedRegion() {
    if (!latestRecordingBlob || selectionStart === null || selectionEnd === null) {
        alert('無法播放：請先完成錄音並選取區域');
        return;
    }
    
    // 確保 AudioContext 已初始化
    if (!audioContext) {
        initializeAudioContext();
    }
    
    // 恢復 AudioContext（如果被暫停）
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // 停止之前的播放
    if (selectionAudioSource) {
        try {
            selectionAudioSource.stop();
        } catch (e) {
            // ignore
        }
        selectionAudioSource = null;
    }
    
    var selStart = Math.min(selectionStart, selectionEnd);
    var selEnd = Math.max(selectionStart, selectionEnd);
    
    // 解碼完整音頻並播放選取部分
    latestRecordingBlob.arrayBuffer().then(function(arrayBuffer) {
        return audioContext.decodeAudioData(arrayBuffer);
    }).then(function(audioBuffer) {
        // 計算實際的時間位置
        var totalSamples = accumulatedWaveform.sampleCount;
        
        // 轉換樣本索引到實際時間
        var startTime = (selStart / totalSamples) * audioBuffer.duration;
        var endTime = (selEnd / totalSamples) * audioBuffer.duration;
        var duration = endTime - startTime;
        
        console.log('Selection info:', {
            selStart: selStart,
            selEnd: selEnd,
            totalSamples: totalSamples,
            startTime: startTime,
            endTime: endTime,
            duration: duration,
            audioBufferDuration: audioBuffer.duration
        });
        
        // 創建音頻源
        selectionAudioSource = audioContext.createBufferSource();
        selectionAudioSource.buffer = audioBuffer;
        selectionAudioSource.connect(audioContext.destination);
        
        // 播放選取的片段
        selectionAudioSource.start(0, startTime, duration);
        
        // 播放結束後清理
        selectionAudioSource.onended = function() {
            selectionAudioSource = null;
        };
        
        console.log('Playing selection from', startTime.toFixed(2), 'to', endTime.toFixed(2), 'seconds');
    }).catch(function(error) {
        console.error('Failed to play selection:', error);
        alert('播放失敗：' + error.message);
    });
}

/**
 * 清除選取區域
 */
function clearSelection() {
    // 停止播放
    if (selectionAudioSource) {
        try {
            selectionAudioSource.stop();
        } catch (e) {
            // ignore
        }
        selectionAudioSource = null;
    }
    
    // 清除選取
    selectionStart = null;
    selectionEnd = null;
    
    // 移除播放控制
    var playbackControls = document.getElementById('selection-playback-controls');
    if (playbackControls) {
        playbackControls.remove();
    }
    
    // 重繪波形
    if (accumulatedWaveform) {
        accumulatedWaveform.draw();
    }
}

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
    var dragStartViewStart = 0;
    var isInViewWindow = false;
    var activePointerId = null;
    
    // 邊緣拉伸相關變數
    var isResizing = false;
    var resizeEdge = null; // 'left' 或 'right'
    var resizeStartX = 0;
    var resizeStartViewStart = 0;
    var resizeStartVisibleSamples = 0;
    var edgeThreshold = 10; // 邊緣檢測閾值（畫素）
    
    // 檢查點擊位置是否在視窗指示器內
    function isInsideViewWindow(clientX) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return false;
        }
        
        var rect = canvas.getBoundingClientRect();
        var clickX = clientX - rect.left;
        var sampleCount = accumulatedWaveform.sampleCount;
        var viewStart = accumulatedWaveform.viewStart;
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        
        var viewStartX = (viewStart / sampleCount) * rect.width;
        var viewWidth = (visibleSamples / sampleCount) * rect.width;
        
        return clickX >= viewStartX && clickX <= (viewStartX + viewWidth);
    }
    
    // 檢查是否在視窗邊緣
    function getResizeEdge(clientX) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return null;
        }
        
        var rect = canvas.getBoundingClientRect();
        var clickX = clientX - rect.left;
        var sampleCount = accumulatedWaveform.sampleCount;
        var viewStart = accumulatedWaveform.viewStart;
        var visibleSamples = accumulatedWaveform.getVisibleSamples();
        
        var viewStartX = (viewStart / sampleCount) * rect.width;
        var viewEndX = ((viewStart + visibleSamples) / sampleCount) * rect.width;
        
        // 檢查是否在左邊緣
        if (Math.abs(clickX - viewStartX) <= edgeThreshold) {
            return 'left';
        }
        
        // 檢查是否在右邊緣
        if (Math.abs(clickX - viewEndX) <= edgeThreshold) {
            return 'right';
        }
        
        return null;
    }
    
    // 更新鼠標樣式
    function updateCursor(clientX) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            canvas.style.cursor = 'default';
            return;
        }
        
        if (isDragging) {
            if (isResizing) {
                canvas.style.cursor = 'ew-resize';
            } else {
                canvas.style.cursor = 'grabbing';
            }
            return;
        }
        
        var edge = getResizeEdge(clientX);
        if (edge) {
            canvas.style.cursor = 'ew-resize';
        } else if (isInsideViewWindow(clientX)) {
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
        
        isDragging = true;
        activePointerId = event.pointerId;
        dragStartX = clickX;
        dragStartViewStart = accumulatedWaveform.viewStart;
        
        // 檢查是否在邊緣進行拉伸
        var edge = getResizeEdge(event.clientX);
        if (edge) {
            isResizing = true;
            resizeEdge = edge;
            resizeStartX = clickX;
            resizeStartViewStart = accumulatedWaveform.viewStart;
            resizeStartVisibleSamples = accumulatedWaveform.getVisibleSamples();
        } else {
            isResizing = false;
            resizeEdge = null;
            isInViewWindow = isInsideViewWindow(event.clientX);
            
            // 如果點擊在視窗外，立即跳轉到該位置
            if (!isInViewWindow) {
                var clickRatio = clickX / rect.width;
                var targetSample = Math.floor(clickRatio * accumulatedWaveform.sampleCount);
                var visibleSamples = accumulatedWaveform.getVisibleSamples();
                accumulatedWaveform.viewStart = Math.floor(targetSample - visibleSamples / 2);
                accumulatedWaveform.isAutoScroll = false;
                accumulatedWaveform._enforceViewBounds();
                accumulatedWaveform.draw();
                
                // 更新拖動起始位置
                dragStartX = clickX;
                dragStartViewStart = accumulatedWaveform.viewStart;
                isInViewWindow = true;
            }
        }
        
        try {
            canvas.setPointerCapture(activePointerId);
        } catch (err) {
            // ignore if not supported
        }
        
        updateCursor(event.clientX);
    });
    
    canvas.addEventListener('pointermove', function(event) {
        if (!accumulatedWaveform || !accumulatedWaveform.sampleCount) {
            return;
        }
        
        var rect = canvas.getBoundingClientRect();
        
        // 更新鼠標樣式
        if (!isDragging) {
            updateCursor(event.clientX);
        }
        
        if (!isDragging || event.pointerId !== activePointerId) {
            return;
        }
        
        var currentX = event.clientX - rect.left;
        var deltaX = currentX - (isResizing ? resizeStartX : dragStartX);
        var sampleCount = accumulatedWaveform.sampleCount;
        
        if (isResizing) {
            // 處理邊緣拉伸
            var deltaSamples = Math.floor((deltaX / rect.width) * sampleCount);
            
            if (resizeEdge === 'left') {
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
            } else if (resizeEdge === 'right') {
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
            var deltaSamples = Math.floor((deltaX / rect.width) * sampleCount);
            
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
            updateCursor(event.clientX);
        } else {
            canvas.style.cursor = 'default';
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
            updateCursor(event.clientX);
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

    /*---------------------------------------------------------------
     * 檔案上傳相關函數
     * 處理檔案上傳到 PHP 後端的邏輯
     *--------------------------------------------------------------*/
    
    var listOfFilesUploaded = []; // 已上傳檔案清單

    /**
     * 上傳錄音檔案到伺服器
     * @param {Object} recordRTC - RecordRTC 錄音器實例或 Blob 物件
     * @param {function} callback - 進度回調函數
     */
    function uploadToServer(recordRTC, callback) {
        // 獲取 Blob 物件（可能直接是 Blob 或從 RecordRTC 提取）
        var blob = recordRTC instanceof Blob ? recordRTC : recordRTC.blob;
        var fileType = blob.type.split('/')[0] || 'audio'; // 獲取檔案類型（通常是 'audio'）
        
        // 生成唯一檔案名稱
        var fileName = 'xxx_' + (Math.random() * 1000).toString().replace('.', '');
        
        // 根據瀏覽器類型設定檔案副檔名
        if (fileType === 'audio') {
            fileName += '.' + (!!navigator.mozGetUserMedia ? 'ogg' : 'wav'); // Firefox 使用 ogg，其他使用 wav
        } else {
            fileName += '.webm'; // 視頻檔案使用 webm
        }

        // 創建 FormData 物件用於檔案上傳
        var formData = new FormData();
        formData.append(fileType + '-filename', fileName); // 檔案名稱
        formData.append(fileType + '-blob', blob);          // 檔案內容

        callback('Uploading ' + fileType + ' recording to server.'); // 通知開始上傳

        // 伺服器端點設定
        var upload_url = 'save.php';        // 上傳處理 PHP 檔案
        var upload_directory = 'uploads/';   // 上傳目錄

        // 執行 HTTP 請求上傳檔案
        makeXMLHttpRequest(upload_url, formData, function(progress) {
            if (progress !== 'upload-ended') {
                callback(progress); // 更新上傳進度
                return;
            }

            callback('ended', upload_directory + fileName); // 上傳完成

            // 將檔案加入已上傳清單（用於離開頁面時清理）
            listOfFilesUploaded.push(upload_directory + fileName);
        });
    }

    /**
     * 建立 XMLHttpRequest 請求上傳檔案
     * @param {string} url - 上傳目標 URL
     * @param {FormData} data - 要上傳的表單數據
     * @param {function} callback - 進度回調函數
     */
    function makeXMLHttpRequest(url, data, callback) {
        var request = new XMLHttpRequest(); // 創建 HTTP 請求物件
        
        // 請求狀態變化處理
        request.onreadystatechange = function() {
            if (request.readyState == 4 && request.status == 200) {
                callback('upload-ended'); // 上傳完成
            }
        };

        // 上傳開始事件
        request.upload.onloadstart = function() {
            callback('Upload started...');
        };

        // 上傳進度事件
        request.upload.onprogress = function(event) {
            callback('Upload Progress ' + Math.round(event.loaded / event.total * 100) + "%");
        };

        // 上傳即將結束事件
        request.upload.onload = function() {
            callback('progress-about-to-end');
        };

        // 上傳完成事件
        request.upload.onload = function() {
            callback('progress-ended');
        };

        // 上傳錯誤處理
        request.upload.onerror = function(error) {
            callback('Failed to upload to server');
            console.error('XMLHttpRequest failed', error);
        };

        // 上傳中止處理
        request.upload.onabort = function(error) {
            callback('Upload aborted.');
            console.error('XMLHttpRequest aborted', error);
        };

        // 發送 POST 請求
        request.open('POST', url);
        request.send(data);
    }
    
    recorder = null; // 清空錄音器引用
}

/*=================================================================
 * 全域錄音器變數
 * 用於在不同函數間共享錄音器實例
 *================================================================*/
var recorder; // 全域可訪問的錄音器物件
var isCurrentlyRecording = false; // 追蹤當前錄音狀態

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
    
    // 更新按鈕樣式和文字
    toggleButton.classList.add('recording');
    toggleButton.innerHTML = '■ 停止錄音';

    // 清空之前的錄音片段容器
    let element = audioBlobsContainer;
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }

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

    /*---------------------------------------------------------------
     * 捕獲麥克風並開始錄音
     * 獲取用戶麥克風權限並初始化 RecordRTC
     *--------------------------------------------------------------*/
    captureMicrophone(function(microphone) {
        // 初始化 Web Audio API 並等待就緒
        initializeAudioContext().then(function() {
            // 將麥克風音頻流設定到主音頻元素
            audio.srcObject = microphone;

            /*-----------------------------------------------------------
             * 初始化即時波形顯示
             * 創建 LiveWaveform 實例並連接到麥克風流
             *----------------------------------------------------------*/
            var liveCanvas = document.getElementById('waveform');
            liveWaveform = liveCanvas ? new LiveWaveform(liveCanvas, analyser) : null;
            if (liveWaveform) {
                liveWaveform.start(microphone);
            }

            /*-----------------------------------------------------------
             * 初始化累積波形顯示
             * 顯示目前為止已錄製的所有音訊波形
             *----------------------------------------------------------*/
            var accumulatedCanvas = document.getElementById('accumulated-waveform');
            accumulatedWaveform = accumulatedCanvas ? new AccumulatedWaveform(accumulatedCanvas) : null;
            if (accumulatedCanvas) {
                bindAccumulatedWaveformInteractions(accumulatedCanvas);
            }
            
            /*-----------------------------------------------------------
             * 初始化全局波形視圖
             * 顯示整體波形並標示當前觀察區域
             *----------------------------------------------------------*/
            var overviewCanvas = document.getElementById('overview-waveform');
            overviewWaveform = overviewCanvas && accumulatedWaveform ? new OverviewWaveform(overviewCanvas, accumulatedWaveform) : null;
            if (overviewCanvas) {
                bindOverviewWaveformInteractions(overviewCanvas);
            }

            /*-----------------------------------------------------------
             * 初始化 RecordRTC 錄音器
             * 設定錄音參數和即時處理回調
             *----------------------------------------------------------*/
            recorder = RecordRTC(microphone, {
                type: 'audio',                    // 錄音類型：音頻
                mimeType: 'audio/wav',            // 輸出格式：WAV
                recorderType: StereoAudioRecorder, // 使用立體聲錄音器
                numberOfAudioChannels: 1,         // 聲道數：單聲道
                //sampleRate: 48000,             // 採樣率（註解掉使用預設值）
                //desiredSampRate: 48000,        // 目標採樣率（註解掉使用預設值）
                bufferSize: 2048,                // 緩衝區大小
                timeSlice: 20,                   // 時間片段：每20ms觸發一次 ondataavailable，提高更新率
                
                /*-------------------------------------------------------
                 * 即時音頻數據處理回調
                 * 每1000ms會觸發一次，接收錄音片段
                 *------------------------------------------------------*/
                ondataavailable: function(blob) {
                    /*---------------------------------------------------
                     * 創建錄音片段顯示容器
                     * 為每個錄音片段創建獨立的顯示區域和波形
                     *--------------------------------------------------*/
                    
                    // 創建音頻片段的主容器
                    var audioContainer = document.createElement('div');
                    audioContainer.style.cssText = 'margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;';
                    
                    // 創建音頻播放控制器
                    var au = document.createElement('audio');
                    au.controls = true;                        // 顯示播放控制
                    au.srcObject = null;                       // 清空媒體流
                    au.src = URL.createObjectURL(blob);        // 設定音頻來源
                    
                    // 組織容器結構
                    audioContainer.appendChild(au);            // 添加音頻控制器
                    audioBlobsContainer.appendChild(audioContainer); // 添加到主容器
                    audioBlobsContainer.appendChild(document.createElement('hr')); // 添加分隔線

                    // 更新累積波形顯示
                    appendBlobToAccumulatedWaveform(blob);
                }
            });

            /*-----------------------------------------------------------
             * 開始錄音並設定時間顯示
             * 啟動錄音器並開始計時顯示
             *----------------------------------------------------------*/
            recorder.startRecording(); // 開始錄音

            dateStarted = new Date().getTime(); // 記錄開始時間

            /*-----------------------------------------------------------
             * 錄音時間顯示循環
             * 每秒更新一次錄音時長顯示
             *----------------------------------------------------------*/
            (function looper() {
                if(!recorder) {
                    return; // 如果錄音器不存在則停止循環
                }

                // 更新時長顯示：計算並顯示已錄音時間
                document.querySelector('h3').innerHTML = 'Recording Duration: ' + 
                    calculateTimeDuration((new Date().getTime() - dateStarted) / 1000);

                setTimeout(looper, 1000); // 1秒後再次執行
            })();

            /*-----------------------------------------------------------
             * 保存麥克風引用
             * 為停止錄音時釋放麥克風做準備
             *----------------------------------------------------------*/
            recorder.microphone = microphone; // 保存麥克風引用
        }).catch(function(err) {
            console.error('Failed to initialize AudioContext:', err);
            alert('無法初始化音頻系統，請重新整理頁面後再試。');
            // 錯誤時恢復按鈕狀態
            isCurrentlyRecording = false;
            toggleButton.classList.remove('recording');
            toggleButton.innerHTML = '● 開始錄音';
        });
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
    recorder.stopRecording(stopRecordingCallback); // 停止錄音並執行回調
    
    // 更新狀態變數
    is_ready_to_record = true;               // 設定為準備錄音狀態
    is_recording = false;                    // 設定為非錄音中
    is_recorded = true;                      // 設定為已完成錄音
    
    // 更新按鈕樣式和文字
    toggleButton.classList.remove('recording');
    toggleButton.innerHTML = '● 開始錄音';
}

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

        // write the PCM samples
        var lng = interleavedLength;
        var index = 44;
        var volume = 1;
        for (var i = 0; i < lng; i++) {
            view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
            index += 2;
        }

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
