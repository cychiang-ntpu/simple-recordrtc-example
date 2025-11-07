/**
 * AccumulatedWaveform - Accumulated audio waveform visualization
 * Displays the complete recorded audio waveform with zoom and pan capabilities
 */
export class AccumulatedWaveform {
    /**
     * Create an AccumulatedWaveform instance
     * @param {HTMLCanvasElement} canvas - Canvas element for drawing
     * @param {Object} options - Configuration options
     * @param {string} options.backgroundColor - Background color (default: '#f0f0f0')
     * @param {string} options.waveColor - Waveform color (default: '#1E88E5')
     * @param {string} options.centerLineColor - Center line color (default: '#d0d0d0')
     * @param {number} options.targetSampleRate - Target sample rate for downsampling (default: 5000)
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.canvasContext = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // Configuration options
        this.options = {
            backgroundColor: options.backgroundColor || '#f0f0f0',
            waveColor: options.waveColor || '#1E88E5',
            centerLineColor: options.centerLineColor || '#d0d0d0',
            targetSampleRate: options.targetSampleRate || 5000
        };

        this.targetSampleRate = this.options.targetSampleRate;
        this.sourceSampleRate = 48000;
        this.decimationFactor = 10;

        this.sampleMin = [];
        this.sampleMax = [];
        this.sampleCount = 0;

        this.zoomFactor = 1;
        this.viewStart = 0;
        this.isAutoScroll = true;
        this._panRemainder = 0;

        this.clear();
    }

    /**
     * Clear the canvas and redraw baseline
     */
    clear() {
        this.canvasContext.clearRect(0, 0, this.width, this.height);
        this.canvasContext.fillStyle = this.options.backgroundColor;
        this.canvasContext.fillRect(0, 0, this.width, this.height);

        this.canvasContext.lineWidth = 1;
        this.canvasContext.strokeStyle = this.options.centerLineColor;
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(0, this.height / 2);
        this.canvasContext.lineTo(this.width, this.height / 2);
        this.canvasContext.stroke();
    }

    /**
     * Reset accumulated data
     */
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

    /**
     * Append new audio samples
     * @param {Float32Array} audioSamples - Audio sample data
     */
    append(audioSamples) {
        if (!audioSamples || !audioSamples.length) {
            return;
        }

        const factor = this.decimationFactor;
        const total = audioSamples.length;

        for (let i = 0; i < total; i += factor) {
            let blockMin = 1.0;
            let blockMax = -1.0;
            let blockSum = 0;
            let blockCount = 0;

            for (let j = 0; j < factor && (i + j) < total; j++) {
                const sample = audioSamples[i + j];
                blockSum += sample;
                blockCount++;
            }

            const blockMean = blockCount ? (blockSum / blockCount) : 0;

            for (let k = 0; k < blockCount; k++) {
                const centeredSample = audioSamples[i + k] - blockMean;
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
                blockMin = 0;
                blockMax = 0;
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

        this.draw();
    }

    /**
     * Draw the accumulated waveform
     */
    draw() {
        this.clear();

        if (!this.sampleCount) {
            return;
        }

        const ctx = this.canvasContext;
        const width = this.width;
        const height = this.height;
        const totalSamples = this.sampleCount;
        const centerY = height / 2;
        const visibleSamples = this.getVisibleSamples();

        if (this.viewStart + visibleSamples > totalSamples) {
            this.viewStart = Math.max(0, totalSamples - visibleSamples);
        }

        const startSample = this.viewStart;
        const endSample = Math.min(totalSamples, startSample + visibleSamples);
        const samplesPerPixel = visibleSamples / width;

        ctx.strokeStyle = this.options.waveColor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        if (samplesPerPixel <= 1) {
            const spacing = visibleSamples > 1 ? width / (visibleSamples - 1) : width;
            for (let i = 0; i < visibleSamples; i++) {
                const sampleIndex = startSample + i;
                if (sampleIndex >= endSample) {
                    break;
                }

                const pair = this._getSamplePair(sampleIndex);
                if (!pair) {
                    continue;
                }

                const columnOffset = (pair.max + pair.min) / 2;
                let adjustedMax = pair.max - columnOffset;
                let adjustedMin = pair.min - columnOffset;

                adjustedMax = Math.max(-1, Math.min(1, adjustedMax));
                adjustedMin = Math.max(-1, Math.min(1, adjustedMin));

                const drawX = visibleSamples > 1 ? i * spacing : width / 2;
                const yTop = centerY - adjustedMax * centerY;
                const yBottom = centerY - adjustedMin * centerY;

                ctx.moveTo(drawX + 0.5, yTop);
                ctx.lineTo(drawX + 0.5, yBottom);
            }
        } else {
            for (let x = 0; x < width; x++) {
                const rangeStart = startSample + x * samplesPerPixel;
                const rangeEnd = rangeStart + samplesPerPixel;
                const startIdx = Math.max(Math.floor(rangeStart), startSample);
                let endIdx = Math.min(Math.floor(rangeEnd), endSample - 1);

                if (endIdx < startIdx) {
                    endIdx = startIdx;
                }

                let min = 1.0;
                let max = -1.0;

                for (let idx = startIdx; idx <= endIdx; idx++) {
                    const samplePair = this._getSamplePair(idx);
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

                const columnOffset = (max + min) / 2;
                let adjustedMax = max - columnOffset;
                let adjustedMin = min - columnOffset;

                adjustedMax = Math.max(-1, Math.min(1, adjustedMax));
                adjustedMin = Math.max(-1, Math.min(1, adjustedMin));

                const yTop = centerY - adjustedMax * centerY;
                const yBottom = centerY - adjustedMin * centerY;

                ctx.moveTo(x + 0.5, yTop);
                ctx.lineTo(x + 0.5, yBottom);
            }
        }

        ctx.stroke();
    }

    /**
     * Get visible sample count based on zoom
     * @returns {number} Number of visible samples
     */
    getVisibleSamples() {
        if (!this.sampleCount) {
            return 0;
        }

        const total = this.sampleCount;
        const minVisible = this._getMinVisibleSamples(total);
        let visible = Math.round(total / this.zoomFactor);

        if (visible < minVisible) {
            visible = minVisible;
        }
        if (visible > total) {
            visible = total;
        }

        return visible;
    }

    /**
     * Set source sample rate
     * @param {number} sampleRate - Source sample rate
     */
    setSourceSampleRate(sampleRate) {
        if (!sampleRate || sampleRate <= 0) {
            return;
        }
        this.sourceSampleRate = sampleRate;
        this.decimationFactor = Math.max(1, Math.round(this.sourceSampleRate / this.targetSampleRate));
    }

    /**
     * Zoom by steps
     * @param {number} stepCount - Number of zoom steps (positive=zoom in, negative=zoom out)
     * @param {number} anchorRatio - Anchor point ratio (0-1)
     */
    zoomBySteps(stepCount, anchorRatio = 0.5) {
        if (!this.sampleCount || !stepCount) {
            return;
        }

        let anchorSample = null;
        if (anchorRatio !== undefined && anchorRatio !== null && this.sampleCount) {
            anchorRatio = Math.max(0, Math.min(1, anchorRatio));
            anchorSample = this.viewStart + anchorRatio * this.getVisibleSamples();
        }

        const zoomBase = 1.5;
        const targetZoom = this.zoomFactor * Math.pow(zoomBase, stepCount);
        this.setZoom(targetZoom, anchorSample);
    }

    /**
     * Set zoom level
     * @param {number} targetZoom - Target zoom factor
     * @param {number} anchorSample - Anchor sample index
     */
    setZoom(targetZoom, anchorSample) {
        if (!this.sampleCount) {
            return;
        }

        const total = this.sampleCount;
        const minVisible = this._getMinVisibleSamples(total);
        const maxZoom = total / minVisible;

        targetZoom = Math.max(1, Math.min(maxZoom || 1, targetZoom));

        if (targetZoom === this.zoomFactor) {
            return;
        }

        const previousVisible = this.getVisibleSamples();
        this.zoomFactor = targetZoom;
        const newVisible = this.getVisibleSamples();

        if (anchorSample === undefined || anchorSample === null) {
            anchorSample = this.viewStart + previousVisible / 2;
        }

        this.isAutoScroll = false;

        const relative = previousVisible ? (anchorSample - this.viewStart) / previousVisible : 0.5;

        this.viewStart = Math.round(anchorSample - relative * newVisible);
        this._enforceViewBounds();
        this.draw();
    }

    /**
     * Pan by samples
     * @param {number} sampleDelta - Number of samples to pan
     */
    panBySamples(sampleDelta) {
        if (!this.sampleCount || !sampleDelta) {
            return;
        }

        this.isAutoScroll = false;
        this.viewStart += sampleDelta;
        this._panRemainder = 0;
        this._enforceViewBounds();
        this.draw();
    }

    /**
     * Pan by pixels
     * @param {number} pixelDelta - Number of pixels to pan
     */
    panByPixels(pixelDelta) {
        if (!this.sampleCount || !pixelDelta) {
            return;
        }

        const samplesPerPixel = this.getVisibleSamples() / this.width;
        this._panRemainder += pixelDelta * samplesPerPixel;
        const sampleDelta = Math.trunc(this._panRemainder);

        if (sampleDelta !== 0) {
            this._panRemainder -= sampleDelta;
            this.panBySamples(sampleDelta);
        }
    }

    /**
     * Reset view to default
     */
    resetView() {
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
    }

    /**
     * Scroll to latest data
     */
    scrollToLatest() {
        if (!this.sampleCount) {
            this.viewStart = 0;
            return;
        }

        const visible = this.getVisibleSamples();

        if (visible >= this.sampleCount) {
            this.viewStart = 0;
        } else {
            this.viewStart = this.sampleCount - visible;
        }
    }

    /**
     * Get minimum visible samples
     * @private
     * @param {number} total - Total sample count
     * @returns {number} Minimum visible samples
     */
    _getMinVisibleSamples(total) {
        if (!total) {
            return 0;
        }

        let minSpan;
        if (total <= this.width) {
            minSpan = Math.max(1, Math.ceil(total / 6));
        } else {
            minSpan = Math.max(1, Math.floor(this.width / 2));
        }

        if (minSpan > total) {
            minSpan = total;
        }

        return minSpan;
    }

    /**
     * Enforce view bounds
     * @private
     */
    _enforceViewBounds() {
        if (!this.sampleCount) {
            this.viewStart = 0;
            return;
        }

        const total = this.sampleCount;
        const visible = this.getVisibleSamples();

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
    }

    /**
     * Get sample pair at index
     * @private
     * @param {number} index - Sample index
     * @returns {Object|null} Sample pair {min, max}
     */
    _getSamplePair(index) {
        if (index < 0 || index >= this.sampleCount) {
            return null;
        }

        return {
            min: this.sampleMin[index],
            max: this.sampleMax[index]
        };
    }
}
