/**
 * AudioProcessor - Utilities for processing audio data
 * Provides functions for audio buffer merging, WAV file generation, and other audio processing tasks
 */

/**
 * Merge left and right channel buffers and create WAV file
 * @param {Object} config - Audio configuration
 * @param {number} config.desiredSampRate - Target sample rate
 * @param {number} config.sampleRate - Source sample rate
 * @param {number} config.numberOfAudioChannels - Number of channels (1 or 2)
 * @param {number} config.internalInterleavedLength - Recording length
 * @param {Array} config.leftBuffers - Left channel buffers
 * @param {Array} config.rightBuffers - Right channel buffers
 * @param {Function} callback - Callback function with (buffer, view)
 */
export function mergeLeftRightBuffers(config, callback) {
    function mergeAudioBuffers(config, cb) {
        const numberOfAudioChannels = config.numberOfAudioChannels;
        let leftBuffers = config.leftBuffers.slice(0);
        let rightBuffers = config.rightBuffers.slice(0);
        let sampleRate = config.sampleRate;
        const internalInterleavedLength = config.internalInterleavedLength;
        const desiredSampRate = config.desiredSampRate;

        // Process stereo audio
        if (numberOfAudioChannels === 2) {
            leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
            rightBuffers = mergeBuffers(rightBuffers, internalInterleavedLength);
            
            if (desiredSampRate) {
                leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
                rightBuffers = interpolateArray(rightBuffers, desiredSampRate, sampleRate);
            }
        }

        // Process mono audio
        if (numberOfAudioChannels === 1) {
            leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
            
            if (desiredSampRate) {
                leftBuffers = interpolateArray(leftBuffers, desiredSampRate, sampleRate);
            }
        }

        if (desiredSampRate) {
            sampleRate = desiredSampRate;
        }

        /**
         * Interpolate array for sample rate conversion
         * @param {Array} data - Source audio data
         * @param {number} newSampleRate - Target sample rate
         * @param {number} oldSampleRate - Source sample rate
         * @returns {Array} Interpolated data
         */
        function interpolateArray(data, newSampleRate, oldSampleRate) {
            const fitCount = Math.round(data.length * (newSampleRate / oldSampleRate));
            const newData = [];
            const springFactor = Number((data.length - 1) / (fitCount - 1));
            
            newData[0] = data[0];
            
            for (let i = 1; i < fitCount - 1; i++) {
                const tmp = i * springFactor;
                const before = Number(Math.floor(tmp)).toFixed();
                const after = Number(Math.ceil(tmp)).toFixed();
                const atPoint = tmp - before;
                newData[i] = linearInterpolate(data[before], data[after], atPoint);
            }
            
            newData[fitCount - 1] = data[data.length - 1];
            return newData;
        }

        /**
         * Linear interpolation
         * @param {number} before - Value before
         * @param {number} after - Value after
         * @param {number} atPoint - Interpolation point (0-1)
         * @returns {number} Interpolated value
         */
        function linearInterpolate(before, after, atPoint) {
            return before + (after - before) * atPoint;
        }

        /**
         * Merge multiple audio buffers
         * @param {Array} channelBuffer - Array of buffers
         * @param {number} rLength - Result length
         * @returns {Float64Array} Merged buffer
         */
        function mergeBuffers(channelBuffer, rLength) {
            const result = new Float64Array(rLength);
            let offset = 0;
            const lng = channelBuffer.length;

            for (let i = 0; i < lng; i++) {
                const buffer = channelBuffer[i];
                result.set(buffer, offset);
                offset += buffer.length;
            }

            return result;
        }

        /**
         * Interleave left and right channels
         * @param {Array} leftChannel - Left channel data
         * @param {Array} rightChannel - Right channel data
         * @returns {Float64Array} Interleaved data
         */
        function interleave(leftChannel, rightChannel) {
            const length = leftChannel.length + rightChannel.length;
            const result = new Float64Array(length);
            let inputIndex = 0;

            for (let index = 0; index < length;) {
                result[index++] = leftChannel[inputIndex];
                result[index++] = rightChannel[inputIndex];
                inputIndex++;
            }
            return result;
        }

        /**
         * Write UTF-8 string to DataView
         * @param {DataView} view - DataView to write to
         * @param {number} offset - Write offset
         * @param {string} string - String to write
         */
        function writeUTFBytes(view, offset, string) {
            const lng = string.length;
            for (let i = 0; i < lng; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        // Interleave channels
        let interleaved;
        if (numberOfAudioChannels === 2) {
            interleaved = interleave(leftBuffers, rightBuffers);
        } else {
            interleaved = leftBuffers;
        }

        const interleavedLength = interleaved.length;

        // Create WAV file
        const resultingBufferLength = 44 + interleavedLength * 2;
        const buffer = new ArrayBuffer(resultingBufferLength);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 44 + interleavedLength * 2, true);
        writeUTFBytes(view, 8, 'WAVE');

        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfAudioChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, numberOfAudioChannels * 2, true);
        view.setUint16(34, 16, true);

        // Data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleavedLength * 2, true);

        // Write PCM samples
        const lng = interleavedLength;
        let index = 44;
        const volume = 1;
        for (let i = 0; i < lng; i++) {
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

    // Check if Chrome browser
    const isChrome = typeof window !== 'undefined' && window.navigator && 
                     /chrome/i.test(window.navigator.userAgent) && 
                     !/edge/i.test(window.navigator.userAgent);

    if (!isChrome) {
        mergeAudioBuffers(config, function(data) {
            callback(data.buffer, data.view);
        });
        return;
    }

    // Use Web Worker for Chrome
    const webWorker = processInWebWorker(mergeAudioBuffers);

    webWorker.onmessage = function(event) {
        callback(event.data.buffer, event.data.view);
        URL.revokeObjectURL(webWorker.workerURL);
    };

    webWorker.postMessage(config);
}

/**
 * Process function in Web Worker
 * @param {Function} _function - Function to execute in worker
 * @returns {Worker} Web Worker instance
 */
function processInWebWorker(_function) {
    const workerURL = URL.createObjectURL(new Blob([
        _function.toString(),
        ';this.onmessage = function (eee) {' + _function.name + '(eee.data);}'
    ], {
        type: 'application/javascript'
    }));

    const worker = new Worker(workerURL);
    worker.workerURL = workerURL;
    return worker;
}

/**
 * Calculate time duration from seconds
 * @param {number} secs - Total seconds
 * @returns {string} Formatted time string (HH:MM:SS or MM:SS)
 */
export function calculateTimeDuration(secs) {
    const hr = Math.floor(secs / 3600);
    let min = Math.floor((secs - (hr * 3600)) / 60);
    let sec = Math.floor(secs - (hr * 3600) - (min * 60));

    if (min < 10) {
        min = "0" + min;
    }

    if (sec < 10) {
        sec = "0" + sec;
    }

    if (hr <= 0) {
        return min + ':' + sec;
    }

    return hr + ':' + min + ':' + sec;
}

/**
 * Decode audio blob to audio buffer
 * @param {Blob} blob - Audio blob to decode
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Promise<AudioBuffer>} Promise resolving to audio buffer
 */
export function decodeAudioBlob(blob, audioContext) {
    return blob.arrayBuffer()
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
}
