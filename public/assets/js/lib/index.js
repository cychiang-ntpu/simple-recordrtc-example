/**
 * SimpleRecordRTC Library
 * A modular audio recording and waveform visualization library
 * 
 * @module SimpleRecordRTC
 * @version 1.0.0
 */

import { LiveWaveform } from './LiveWaveform.js';
import { AccumulatedWaveform } from './AccumulatedWaveform.js';
import { RecordingManager } from './RecordingManager.js';
import { 
    mergeLeftRightBuffers, 
    calculateTimeDuration, 
    decodeAudioBlob 
} from './AudioProcessor.js';

/**
 * Main SimpleRecordRTC class
 * Provides a unified interface for audio recording and waveform visualization
 */
export class SimpleRecordRTC {
    /**
     * Create a SimpleRecordRTC instance
     * @param {Object} config - Configuration object
     * @param {HTMLCanvasElement} config.liveCanvas - Canvas for live waveform
     * @param {HTMLCanvasElement} config.accumulatedCanvas - Canvas for accumulated waveform
     * @param {Object} config.liveWaveformOptions - Options for live waveform
     * @param {Object} config.accumulatedWaveformOptions - Options for accumulated waveform
     * @param {Object} config.recordingOptions - Options for recording manager
     */
    constructor(config = {}) {
        this.config = config;
        this.audioContext = null;
        this.analyser = null;
        this.analyserSilencer = null;
        
        this.liveWaveform = null;
        this.accumulatedWaveform = null;
        this.recordingManager = null;

        this.initialized = false;
    }

    /**
     * Initialize audio context and components
     */
    initializeAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            this.analyserSilencer = this.audioContext.createGain();
            this.analyserSilencer.gain.value = 0;
            this.analyser.connect(this.analyserSilencer);
            this.analyserSilencer.connect(this.audioContext.destination);
        }
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.initialized = true;
    }

    /**
     * Create live waveform visualizer
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} options - Waveform options
     * @returns {LiveWaveform} LiveWaveform instance
     */
    createLiveWaveform(canvas, options = {}) {
        if (!this.initialized) {
            this.initializeAudioContext();
        }
        this.liveWaveform = new LiveWaveform(canvas, this.analyser, options);
        return this.liveWaveform;
    }

    /**
     * Create accumulated waveform visualizer
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} options - Waveform options
     * @returns {AccumulatedWaveform} AccumulatedWaveform instance
     */
    createAccumulatedWaveform(canvas, options = {}) {
        this.accumulatedWaveform = new AccumulatedWaveform(canvas, options);
        return this.accumulatedWaveform;
    }

    /**
     * Create recording manager
     * @param {Object} options - Recording options
     * @returns {RecordingManager} RecordingManager instance
     */
    createRecordingManager(options = {}) {
        this.recordingManager = new RecordingManager(options);
        return this.recordingManager;
    }

    /**
     * Start recording with live waveform
     * @param {Object} options - Options
     * @returns {Promise<void>}
     */
    async startRecording(options = {}) {
        if (!this.initialized) {
            this.initializeAudioContext();
        }

        if (!this.recordingManager) {
            this.recordingManager = this.createRecordingManager(options.recordingOptions || {});
        }

        const stream = await RecordingManager.captureMicrophone(options.microphoneConstraints);

        if (this.liveWaveform) {
            this.liveWaveform.start(stream, this.audioContext);
        }

        await this.recordingManager.startRecording(stream);
    }

    /**
     * Stop recording
     * @returns {Promise<Object>} Recording data
     */
    async stopRecording() {
        if (!this.recordingManager) {
            throw new Error('No recording in progress');
        }

        const recordingData = await this.recordingManager.stopRecording();

        if (this.liveWaveform) {
            this.liveWaveform.stop();
        }

        this.recordingManager.stopMicrophone();

        return recordingData;
    }

    /**
     * Append blob to accumulated waveform
     * @param {Blob} blob - Audio blob
     * @returns {Promise<void>}
     */
    async appendBlobToAccumulatedWaveform(blob) {
        if (!this.accumulatedWaveform || !this.audioContext) {
            return;
        }

        try {
            const audioBuffer = await decodeAudioBlob(blob, this.audioContext);
            this.accumulatedWaveform.setSourceSampleRate(audioBuffer.sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            this.accumulatedWaveform.append(channelData);
        } catch (error) {
            console.warn('Unable to decode audio chunk for accumulated waveform:', error);
        }
    }

    /**
     * Bind accumulated waveform interactions
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} controls - Control elements
     */
    bindAccumulatedWaveformInteractions(canvas, controls = {}) {
        if (!canvas || !this.accumulatedWaveform) {
            return;
        }

        let isDragging = false;
        let lastX = 0;
        let activePointerId = null;

        canvas.addEventListener('pointerdown', (event) => {
            isDragging = true;
            activePointerId = event.pointerId;
            lastX = event.clientX;
            this.accumulatedWaveform.isAutoScroll = false;
            try {
                canvas.setPointerCapture(activePointerId);
            } catch (err) {
                // Ignore if not supported
            }
        });

        canvas.addEventListener('pointermove', (event) => {
            if (!isDragging || event.pointerId !== activePointerId) {
                return;
            }

            const deltaX = event.clientX - lastX;
            if (deltaX !== 0) {
                this.accumulatedWaveform.panByPixels(-deltaX);
                lastX = event.clientX;
            }
        });

        const endDrag = (event) => {
            if (event && event.pointerId !== activePointerId) {
                return;
            }
            isDragging = false;
            if (activePointerId !== null) {
                try {
                    canvas.releasePointerCapture(activePointerId);
                } catch (err) {
                    // Ignore
                }
            }
            activePointerId = null;
        };

        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);
        canvas.addEventListener('pointerleave', endDrag);

        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();

            if (event.ctrlKey || event.metaKey) {
                const step = event.deltaY > 0 ? -1 : 1;
                if (step !== 0) {
                    const rect = canvas.getBoundingClientRect();
                    const anchorRatio = (event.clientX - rect.left) / rect.width;
                    this.accumulatedWaveform.zoomBySteps(step, anchorRatio);
                }
            } else {
                let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                if (event.shiftKey && event.deltaY !== 0) {
                    delta = event.deltaY;
                }
                if (delta !== 0) {
                    this.accumulatedWaveform.panByPixels(delta);
                }
            }
        }, { passive: false });

        // Bind control buttons if provided
        if (controls.zoomIn) {
            controls.zoomIn.addEventListener('click', () => {
                this.accumulatedWaveform.zoomBySteps(1, 0.5);
            });
        }

        if (controls.zoomOut) {
            controls.zoomOut.addEventListener('click', () => {
                this.accumulatedWaveform.zoomBySteps(-1, 0.5);
            });
        }

        if (controls.zoomReset) {
            controls.zoomReset.addEventListener('click', () => {
                this.accumulatedWaveform.resetView();
            });
        }

        if (controls.panLeft) {
            controls.panLeft.addEventListener('click', () => {
                const step = Math.round(this.accumulatedWaveform.getVisibleSamples() * 0.25);
                this.accumulatedWaveform.panBySamples(-step);
            });
        }

        if (controls.panRight) {
            controls.panRight.addEventListener('click', () => {
                const step = Math.round(this.accumulatedWaveform.getVisibleSamples() * 0.25);
                this.accumulatedWaveform.panBySamples(step);
            });
        }
    }

    /**
     * Get audio context
     * @returns {AudioContext} Audio context
     */
    getAudioContext() {
        return this.audioContext;
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.liveWaveform) {
            this.liveWaveform.stop();
            this.liveWaveform = null;
        }

        if (this.accumulatedWaveform) {
            this.accumulatedWaveform.reset();
            this.accumulatedWaveform = null;
        }

        if (this.recordingManager) {
            this.recordingManager.reset();
            this.recordingManager = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.initialized = false;
    }
}

// Export individual classes and utilities
export {
    LiveWaveform,
    AccumulatedWaveform,
    RecordingManager,
    mergeLeftRightBuffers,
    calculateTimeDuration,
    decodeAudioBlob
};

// Default export
export default SimpleRecordRTC;
