/**
 * RecordingManager - Manages audio recording with RecordRTC
 * Handles microphone capture, recording control, and audio processing
 */
export class RecordingManager {
    /**
     * Create a RecordingManager instance
     * @param {Object} options - Configuration options
     * @param {Function} options.onDataAvailable - Callback for audio data chunks
     * @param {Function} options.onRecordingStart - Callback when recording starts
     * @param {Function} options.onRecordingStop - Callback when recording stops
     * @param {Object} options.recordRTCConfig - RecordRTC configuration
     */
    constructor(options = {}) {
        this.options = {
            onDataAvailable: options.onDataAvailable || null,
            onRecordingStart: options.onRecordingStart || null,
            onRecordingStop: options.onRecordingStop || null,
            recordRTCConfig: options.recordRTCConfig || {
                type: 'audio',
                mimeType: 'audio/wav',
                recorderType: typeof StereoAudioRecorder !== 'undefined' ? StereoAudioRecorder : null,
                numberOfAudioChannels: 1,
                bufferSize: 2048,
                timeSlice: 20
            }
        };

        this.recorder = null;
        this.microphone = null;
        this.isRecording = false;
        this.dateStarted = null;
    }

    /**
     * Capture microphone with specified constraints
     * @param {Object} constraints - Media constraints
     * @returns {Promise<MediaStream>} Promise resolving to media stream
     */
    static captureMicrophone(constraints = {}) {
        const defaultConstraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        };

        const finalConstraints = {
            ...defaultConstraints,
            audio: { ...defaultConstraints.audio, ...(constraints.audio || {}) },
            video: constraints.video || false
        };

        return navigator.mediaDevices.getUserMedia(finalConstraints);
    }

    /**
     * Start recording
     * @param {MediaStream} stream - Audio media stream
     * @returns {Promise<void>} Promise resolving when recording starts
     */
    async startRecording(stream) {
        if (this.isRecording) {
            throw new Error('Recording already in progress');
        }

        if (!stream) {
            throw new Error('Media stream is required');
        }

        this.microphone = stream;
        this.isRecording = true;
        this.dateStarted = new Date().getTime();

        // Check if RecordRTC is available
        if (typeof RecordRTC === 'undefined') {
            throw new Error('RecordRTC library is not loaded');
        }

        const config = {
            ...this.options.recordRTCConfig,
            ondataavailable: this.options.onDataAvailable || undefined
        };

        this.recorder = RecordRTC(stream, config);
        this.recorder.startRecording();
        this.recorder.microphone = stream;

        if (this.options.onRecordingStart) {
            this.options.onRecordingStart();
        }

        return Promise.resolve();
    }

    /**
     * Stop recording
     * @returns {Promise<Object>} Promise resolving to recording data
     */
    stopRecording() {
        return new Promise((resolve, reject) => {
            if (!this.isRecording || !this.recorder) {
                reject(new Error('No recording in progress'));
                return;
            }

            this.recorder.stopRecording(() => {
                const internalRecorder = this.recorder.getInternalRecorder();
                const recordingData = {
                    blob: this.recorder.blob,
                    url: this.recorder.toURL(),
                    internalRecorder: internalRecorder,
                    duration: (new Date().getTime() - this.dateStarted) / 1000
                };

                this.isRecording = false;

                if (this.options.onRecordingStop) {
                    this.options.onRecordingStop(recordingData);
                }

                resolve(recordingData);
            });
        });
    }

    /**
     * Stop microphone stream
     */
    stopMicrophone() {
        if (this.microphone) {
            this.microphone.getTracks().forEach(track => track.stop());
            this.microphone = null;
        }
    }

    /**
     * Get recording blob
     * @returns {Blob|null} Recording blob
     */
    getBlob() {
        return this.recorder ? this.recorder.blob : null;
    }

    /**
     * Get recording URL
     * @returns {string|null} Recording URL
     */
    getURL() {
        return this.recorder ? this.recorder.toURL() : null;
    }

    /**
     * Get internal recorder instance
     * @returns {Object|null} Internal recorder
     */
    getInternalRecorder() {
        return this.recorder ? this.recorder.getInternalRecorder() : null;
    }

    /**
     * Get recording duration
     * @returns {number} Recording duration in seconds
     */
    getDuration() {
        if (!this.dateStarted) {
            return 0;
        }
        return (new Date().getTime() - this.dateStarted) / 1000;
    }

    /**
     * Check if currently recording
     * @returns {boolean} True if recording
     */
    isCurrentlyRecording() {
        return this.isRecording;
    }

    /**
     * Reset recording manager
     */
    reset() {
        this.stopMicrophone();
        this.recorder = null;
        this.isRecording = false;
        this.dateStarted = null;
    }
}
