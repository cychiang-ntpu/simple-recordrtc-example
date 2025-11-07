/**
 * Simple Usage Example for SimpleRecordRTC Library
 * This demonstrates the basic usage of the modular library
 */

import SimpleRecordRTC from './lib/index.js';

// Get DOM elements
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const liveCanvas = document.getElementById('live-waveform');
const accumulatedCanvas = document.getElementById('accumulated-waveform');
const audioPlayer = document.getElementById('audio-player');

// Initialize library
const recorder = new SimpleRecordRTC();

// Initialize controls
stopBtn.disabled = true;

// Start recording
startBtn.addEventListener('click', async () => {
    try {
        // Initialize audio context
        recorder.initializeAudioContext();

        // Create waveform visualizers
        if (liveCanvas) {
            recorder.createLiveWaveform(liveCanvas, {
                backgroundColor: '#f0f0f0',
                waveColor: '#4CAF50',
                centerLineColor: '#d0d0d0',
                lineWidth: 2
            });
        }

        if (accumulatedCanvas) {
            recorder.createAccumulatedWaveform(accumulatedCanvas, {
                backgroundColor: '#f0f0f0',
                waveColor: '#1E88E5',
                centerLineColor: '#d0d0d0',
                targetSampleRate: 5000
            });

            // Bind interactive controls
            recorder.bindAccumulatedWaveformInteractions(accumulatedCanvas, {
                zoomIn: document.getElementById('zoom-in'),
                zoomOut: document.getElementById('zoom-out'),
                zoomReset: document.getElementById('zoom-reset'),
                panLeft: document.getElementById('pan-left'),
                panRight: document.getElementById('pan-right')
            });
        }

        // Start recording
        await recorder.startRecording({
            recordingOptions: {
                onDataAvailable: (blob) => {
                    // Append each audio chunk to accumulated waveform
                    recorder.appendBlobToAccumulatedWaveform(blob);
                }
            }
        });

        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        console.log('Recording started');
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Unable to start recording. Please check your microphone permissions.');
    }
});

// Stop recording
stopBtn.addEventListener('click', async () => {
    try {
        const recordingData = await recorder.stopRecording();
        
        // Update UI
        startBtn.disabled = false;
        stopBtn.disabled = true;

        // Play the recorded audio
        if (audioPlayer) {
            audioPlayer.src = recordingData.url;
        }

        console.log('Recording stopped', {
            duration: recordingData.duration,
            blob: recordingData.blob,
            size: recordingData.blob.size
        });
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (recorder) {
        recorder.destroy();
    }
});
