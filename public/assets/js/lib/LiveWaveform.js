/**
 * LiveWaveform - Real-time waveform visualization
 * Displays live audio waveform using Canvas and AnalyserNode during recording
 */
export class LiveWaveform {
    /**
     * Create a LiveWaveform instance
     * @param {HTMLCanvasElement} canvas - Canvas element for drawing
     * @param {AnalyserNode} analyserNode - Web Audio API analyser node
     * @param {Object} options - Configuration options
     * @param {string} options.backgroundColor - Background color (default: '#f0f0f0')
     * @param {string} options.waveColor - Waveform color (default: '#4CAF50')
     * @param {string} options.centerLineColor - Center line color (default: '#d0d0d0')
     * @param {number} options.lineWidth - Line width (default: 2)
     */
    constructor(canvas, analyserNode, options = {}) {
        this.canvas = canvas;
        this.canvasContext = canvas.getContext('2d');
        this.analyser = analyserNode;
        this.mediaStreamSource = null;
        this.animationId = null;
        this.isRunning = false;

        this.width = canvas.width;
        this.height = canvas.height;

        // Configuration options
        this.options = {
            backgroundColor: options.backgroundColor || '#f0f0f0',
            waveColor: options.waveColor || '#4CAF50',
            centerLineColor: options.centerLineColor || '#d0d0d0',
            lineWidth: options.lineWidth || 2
        };

        if (this.analyser) {
            this.analyser.fftSize = 1024;
            this.bufferLength = this.analyser.fftSize;
            this.dataArray = new Uint8Array(this.bufferLength);
        } else {
            this.bufferLength = 0;
            this.dataArray = null;
        }
    }

    /**
     * Start visualizing waveform from media stream
     * @param {MediaStream} stream - Audio media stream
     * @param {AudioContext} audioContext - Web Audio API context
     */
    start(stream, audioContext) {
        if (this.isRunning || !audioContext || !this.analyser) {
            return;
        }

        this.isRunning = true;

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(err => {
                console.warn('Unable to resume AudioContext:', err);
            });
        }

        if (this.mediaStreamSource) {
            this.mediaStreamSource.disconnect();
        }

        this.mediaStreamSource = audioContext.createMediaStreamSource(stream);
        this.mediaStreamSource.connect(this.analyser);

        this.draw();
    }

    /**
     * Stop waveform visualization
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
     * Draw waveform on canvas
     * @private
     */
    draw() {
        if (!this.isRunning || !this.analyser || !this.dataArray) {
            return;
        }

        this.animationId = requestAnimationFrame(this.draw.bind(this));

        this.analyser.getByteTimeDomainData(this.dataArray);

        this.canvasContext.fillStyle = this.options.backgroundColor;
        this.canvasContext.fillRect(0, 0, this.width, this.height);

        // Draw center line
        this.canvasContext.strokeStyle = this.options.centerLineColor;
        this.canvasContext.lineWidth = 1;
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(0, this.height / 2);
        this.canvasContext.lineTo(this.width, this.height / 2);
        this.canvasContext.stroke();

        // Draw waveform
        this.canvasContext.lineWidth = this.options.lineWidth;
        this.canvasContext.strokeStyle = this.options.waveColor;
        this.canvasContext.beginPath();

        const sliceWidth = this.width / this.bufferLength;
        let x = 0;
        const centerY = this.height / 2;

        for (let i = 0; i < this.bufferLength; i++) {
            let normalized = (this.dataArray[i] - 128) / 128.0;
            normalized = Math.max(-1, Math.min(1, normalized));

            const y = centerY + normalized * centerY;

            if (i === 0) {
                this.canvasContext.moveTo(x, y);
            } else {
                this.canvasContext.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.canvasContext.stroke();
    }
}
