/**
 * Application using SimpleRecordRTC Library
 * This is a refactored version that uses the modular library API
 */

import SimpleRecordRTC from './lib/index.js';
import { calculateTimeDuration, mergeLeftRightBuffers } from './lib/AudioProcessor.js';

// DOM element references
const audio = document.querySelector('audio');
const audioBlobsContainer = document.querySelector('#audio-blobs-container');
const downloadButton = document.getElementById('btn-download-recording');

// Recording state variables
let is_ready_to_record = true;
let is_recording = false;
let is_recorded = false;

// Library instance
let recordRTC = null;

// Latest recording data
let latestRecordingBlob = null;
let latestRecordingUrl = null;
let dateStarted = null;

// Accumulated waveform controls
const accumulatedControls = {
    zoomIn: document.getElementById('accum-zoom-in'),
    zoomOut: document.getElementById('accum-zoom-out'),
    zoomReset: document.getElementById('accum-zoom-reset'),
    panLeft: document.getElementById('accum-pan-left'),
    panRight: document.getElementById('accum-pan-right'),
    toolbar: document.getElementById('accumulated-toolbar')
};

/**
 * Set accumulated controls enabled state
 * @param {boolean} enabled - Whether controls should be enabled
 */
function setAccumulatedControlsEnabled(enabled) {
    const buttons = [
        accumulatedControls.zoomIn,
        accumulatedControls.zoomOut,
        accumulatedControls.zoomReset,
        accumulatedControls.panLeft,
        accumulatedControls.panRight
    ];

    for (let i = 0; i < buttons.length; i++) {
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
 * Stop recording callback
 * Handles post-recording processing
 */
function stopRecordingCallback() {
    const internalRecorder = recordRTC.recordingManager.getInternalRecorder();
    const leftchannel = internalRecorder.leftchannel;
    const rightchannel = internalRecorder.rightchannel;

    mergeLeftRightBuffers({
        desiredSampRate: internalRecorder.desiredSampRate,
        sampleRate: internalRecorder.sampleRate,
        numberOfAudioChannels: internalRecorder.numberOfAudioChannels,
        internalInterleavedLength: internalRecorder.recordingLength,
        leftBuffers: leftchannel,
        rightBuffers: internalRecorder.numberOfAudioChannels === 1 ? [] : rightchannel
    }, function(buffer, view) {
        const blob = new Blob([buffer], {
            type: 'audio/wav'
        });

        if (latestRecordingUrl) {
            URL.revokeObjectURL(latestRecordingUrl);
            latestRecordingUrl = null;
        }

        latestRecordingBlob = blob;
        latestRecordingUrl = URL.createObjectURL(blob);

        audio.srcObject = null;
        audio.src = latestRecordingUrl;

        if (downloadButton) {
            downloadButton.disabled = false;
        }
    });

    recordRTC.recordingManager.stopMicrophone();
    const button = this;

    uploadToServer(recordRTC.recordingManager.recorder, function(progress, fileURL) {
        if(progress === 'ended') {
            button.disabled = false;
            button.innerHTML = 'Click to download from server';
            button.onclick = function() {
                window.open(fileURL);
            };
            return;
        }
        button.innerHTML = progress;
    });
}

/**
 * Upload recording to server
 * @param {Object} recordRTCInstance - RecordRTC instance or Blob
 * @param {Function} callback - Progress callback
 */
function uploadToServer(recordRTCInstance, callback) {
    const blob = recordRTCInstance instanceof Blob ? recordRTCInstance : recordRTCInstance.blob;
    const fileType = blob.type.split('/')[0] || 'audio';
    
    let fileName = 'xxx_' + (Math.random() * 1000).toString().replace('.', '');
    
    if (fileType === 'audio') {
        fileName += '.' + (!!navigator.mozGetUserMedia ? 'ogg' : 'wav');
    } else {
        fileName += '.webm';
    }

    const formData = new FormData();
    formData.append(fileType + '-filename', fileName);
    formData.append(fileType + '-blob', blob);

    callback('Uploading ' + fileType + ' recording to server.');

    const upload_url = 'save.php';
    const upload_directory = 'uploads/';

    makeXMLHttpRequest(upload_url, formData, function(progress) {
        if (progress !== 'upload-ended') {
            callback(progress);
            return;
        }

        callback('ended', upload_directory + fileName);
    });
}

/**
 * Make XMLHttpRequest for file upload
 * @param {string} url - Upload URL
 * @param {FormData} data - Form data
 * @param {Function} callback - Progress callback
 */
function makeXMLHttpRequest(url, data, callback) {
    const request = new XMLHttpRequest();
    
    request.onreadystatechange = function() {
        if (request.readyState == 4 && request.status == 200) {
            callback('upload-ended');
        }
    };

    request.upload.onloadstart = function() {
        callback('Upload started...');
    };

    request.upload.onprogress = function(event) {
        callback('Upload Progress ' + Math.round(event.loaded / event.total * 100) + "%");
    };

    request.upload.onload = function() {
        callback('progress-about-to-end');
    };

    request.upload.onload = function() {
        callback('progress-ended');
    };

    request.upload.onerror = function(error) {
        callback('Failed to upload to server');
        console.error('XMLHttpRequest failed', error);
    };

    request.upload.onabort = function(error) {
        callback('Upload aborted.');
        console.error('XMLHttpRequest aborted', error);
    };

    request.open('POST', url);
    request.send(data);
}

// Start recording button handler
document.getElementById('btn-start-recording').onclick = function() {
    this.disabled = true;
    is_ready_to_record = false;
    is_recording = true;
    is_recorded = false;

    // Clear previous audio blobs
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

    // Initialize library
    recordRTC = new SimpleRecordRTC();
    recordRTC.initializeAudioContext();

    // Create waveforms
    const liveCanvas = document.getElementById('waveform');
    const accumulatedCanvas = document.getElementById('accumulated-waveform');

    if (liveCanvas) {
        recordRTC.createLiveWaveform(liveCanvas);
    }

    if (accumulatedCanvas) {
        recordRTC.createAccumulatedWaveform(accumulatedCanvas);
        recordRTC.bindAccumulatedWaveformInteractions(accumulatedCanvas, accumulatedControls);
        setAccumulatedControlsEnabled(false);
    }

    // Start recording with microphone
    recordRTC.startRecording({
        recordingOptions: {
            onDataAvailable: function(blob) {
                // Create audio container for each chunk
                const audioContainer = document.createElement('div');
                audioContainer.style.cssText = 'margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;';
                
                const au = document.createElement('audio');
                au.controls = true;
                au.srcObject = null;
                au.src = URL.createObjectURL(blob);
                
                audioContainer.appendChild(au);
                audioBlobsContainer.appendChild(audioContainer);
                audioBlobsContainer.appendChild(document.createElement('hr'));

                // Update accumulated waveform
                recordRTC.appendBlobToAccumulatedWaveform(blob);
                
                if (recordRTC.accumulatedWaveform && recordRTC.accumulatedWaveform.sampleCount > 0) {
                    setAccumulatedControlsEnabled(true);
                }
            }
        }
    }).then(() => {
        audio.srcObject = recordRTC.recordingManager.microphone;
        dateStarted = new Date().getTime();

        // Recording time display loop
        (function looper() {
            if(!recordRTC || !recordRTC.recordingManager || !recordRTC.recordingManager.isCurrentlyRecording()) {
                return;
            }

            document.querySelector('h3').innerHTML = 'Recording Duration: ' + 
                calculateTimeDuration((new Date().getTime() - dateStarted) / 1000);

            setTimeout(looper, 1000);
        })();

        document.getElementById('btn-stop-recording').disabled = false;
    }).catch(error => {
        alert('Unable to capture your microphone. Please check console logs.');
        console.error(error);
        this.disabled = false;
    });
};

// Stop recording button handler
document.getElementById('btn-stop-recording').onclick = function() {
    this.disabled = true;
    
    recordRTC.stopRecording().then(recordingData => {
        is_ready_to_record = true;
        is_recording = false;
        is_recorded = true;
        
        document.getElementById('btn-start-recording').disabled = false;
        
        // Call the stop recording callback
        stopRecordingCallback.call(this);
    }).catch(error => {
        console.error('Error stopping recording:', error);
        this.disabled = false;
    });
};

// Download button handler
if (downloadButton) {
    downloadButton.onclick = function() {
        if (!latestRecordingBlob) {
            return;
        }

        const downloadUrl = URL.createObjectURL(latestRecordingBlob);
        const anchor = document.createElement('a');
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
