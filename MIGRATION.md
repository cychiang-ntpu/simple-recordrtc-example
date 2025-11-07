# Migration Guide: From app.js to SimpleRecordRTC Library

This guide helps you migrate from the original monolithic `app.js` implementation to the modular SimpleRecordRTC library.

## Overview of Changes

### Before (Original app.js)
- Single file with ~1600 lines of tightly coupled code
- Global variables scattered throughout
- DOM-dependent implementation
- Hard to reuse in other projects
- Difficult to test individual components

### After (SimpleRecordRTC Library)
- Modular architecture with separate components
- Clean API with encapsulation
- Configurable and reusable
- Easy to test and maintain
- Works across different projects

## Step-by-Step Migration

### Step 1: Include the Library

**Before:**
```html
<script src="assets/js/app.js"></script>
```

**After:**
```html
<script src="assets/js/RecordRTC.js"></script>
<script type="module" src="your-app.js"></script>
```

### Step 2: Import the Library

**After (in your-app.js):**
```javascript
import SimpleRecordRTC from './assets/js/lib/index.js';
```

### Step 3: Replace Global Variables

**Before:**
```javascript
var recorder;
var liveWaveform;
var accumulatedWaveform;
var audioContext;
var analyser;
```

**After:**
```javascript
const recordRTC = new SimpleRecordRTC();
// Audio context, analyser, and waveforms are managed internally
```

### Step 4: Initialize Audio Context

**Before:**
```javascript
function initializeAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        // ... more setup
    }
}
```

**After:**
```javascript
recordRTC.initializeAudioContext();
// That's it! Everything is handled internally
```

### Step 5: Create Waveforms

**Before:**
```javascript
var liveCanvas = document.getElementById('waveform');
liveWaveform = liveCanvas ? new LiveWaveform(liveCanvas, analyser) : null;

var accumulatedCanvas = document.getElementById('accumulated-waveform');
accumulatedWaveform = accumulatedCanvas ? new AccumulatedWaveform(accumulatedCanvas) : null;
```

**After:**
```javascript
const liveCanvas = document.getElementById('waveform');
recordRTC.createLiveWaveform(liveCanvas, {
    backgroundColor: '#f0f0f0',
    waveColor: '#4CAF50'
});

const accumulatedCanvas = document.getElementById('accumulated-waveform');
recordRTC.createAccumulatedWaveform(accumulatedCanvas);
```

### Step 6: Start Recording

**Before:**
```javascript
captureMicrophone(function(microphone) {
    initializeAudioContext();
    audio.srcObject = microphone;
    
    liveWaveform = new LiveWaveform(liveCanvas, analyser);
    if (liveWaveform) {
        liveWaveform.start(microphone);
    }
    
    recorder = RecordRTC(microphone, {
        type: 'audio',
        mimeType: 'audio/wav',
        // ... lots of configuration
        ondataavailable: function(blob) {
            // ... handle blob
        }
    });
    
    recorder.startRecording();
    recorder.microphone = microphone;
});
```

**After:**
```javascript
await recordRTC.startRecording({
    recordingOptions: {
        onDataAvailable: (blob) => {
            recordRTC.appendBlobToAccumulatedWaveform(blob);
        }
    }
});
```

### Step 7: Stop Recording

**Before:**
```javascript
recorder.stopRecording(stopRecordingCallback);
// ... complex callback with manual audio processing
```

**After:**
```javascript
const recordingData = await recordRTC.stopRecording();
console.log('Recording:', recordingData.blob, recordingData.duration);
```

### Step 8: Handle Audio Data

**Before:**
```javascript
function stopRecordingCallback() {
    var internalRecorder = recorder.getInternalRecorder();
    var leftchannel = internalRecorder.leftchannel;
    var rightchannel = internalRecorder.rightchannel;
    
    mergeLeftRightBuffers({
        desiredSampRate: internalRecorder.desiredSampRate,
        sampleRate: internalRecorder.sampleRate,
        // ... lots of configuration
    }, function(buffer, view) {
        var blob = new Blob([buffer], { type: 'audio/wav' });
        audio.src = URL.createObjectURL(blob);
    });
}
```

**After:**
```javascript
// The library handles this automatically
// You get the final blob in the recording data
const recordingData = await recordRTC.stopRecording();
audio.src = recordingData.url;
```

### Step 9: Cleanup

**Before:**
```javascript
// Manual cleanup scattered throughout the code
if (liveWaveform) {
    liveWaveform.stop();
    liveWaveform = null;
}
if (recorder) {
    recorder.microphone.stop();
}
// ... more cleanup
```

**After:**
```javascript
recordRTC.destroy();
// Clean up everything with one call
```

## Complete Example Comparison

### Before (Original Implementation)

```javascript
// Global variables
var recorder;
var liveWaveform;
var accumulatedWaveform;
var audioContext;
var analyser;

// Start recording button
document.getElementById('btn-start-recording').onclick = function() {
    this.disabled = true;
    
    captureMicrophone(function(microphone) {
        initializeAudioContext();
        audio.srcObject = microphone;
        
        var liveCanvas = document.getElementById('waveform');
        liveWaveform = liveCanvas ? new LiveWaveform(liveCanvas, analyser) : null;
        if (liveWaveform) {
            liveWaveform.start(microphone);
        }
        
        recorder = RecordRTC(microphone, {
            type: 'audio',
            mimeType: 'audio/wav',
            recorderType: StereoAudioRecorder,
            numberOfAudioChannels: 1,
            bufferSize: 2048,
            timeSlice: 20,
            ondataavailable: function(blob) {
                // Handle blob
                appendBlobToAccumulatedWaveform(blob);
            }
        });
        
        recorder.startRecording();
        recorder.microphone = microphone;
        
        document.getElementById('btn-stop-recording').disabled = false;
    });
};

// Stop recording button
document.getElementById('btn-stop-recording').onclick = function() {
    this.disabled = true;
    recorder.stopRecording(stopRecordingCallback);
    document.getElementById('btn-start-recording').disabled = false;
};
```

### After (Using Library)

```javascript
import SimpleRecordRTC from './assets/js/lib/index.js';

const recordRTC = new SimpleRecordRTC();
const audio = document.querySelector('audio');

// Start recording button
document.getElementById('btn-start-recording').onclick = async function() {
    this.disabled = true;
    
    try {
        recordRTC.initializeAudioContext();
        
        const liveCanvas = document.getElementById('waveform');
        const accumulatedCanvas = document.getElementById('accumulated-waveform');
        
        recordRTC.createLiveWaveform(liveCanvas);
        recordRTC.createAccumulatedWaveform(accumulatedCanvas);
        
        await recordRTC.startRecording({
            recordingOptions: {
                onDataAvailable: (blob) => {
                    recordRTC.appendBlobToAccumulatedWaveform(blob);
                }
            }
        });
        
        document.getElementById('btn-stop-recording').disabled = false;
    } catch (error) {
        console.error('Error starting recording:', error);
        this.disabled = false;
    }
};

// Stop recording button
document.getElementById('btn-stop-recording').onclick = async function() {
    this.disabled = true;
    
    try {
        const recordingData = await recordRTC.stopRecording();
        audio.src = recordingData.url;
        
        document.getElementById('btn-start-recording').disabled = false;
    } catch (error) {
        console.error('Error stopping recording:', error);
        this.disabled = false;
    }
};
```

## Key Benefits of Migration

1. **Less Code**: ~70% reduction in application code
2. **Cleaner API**: No need to manage global variables
3. **Error Handling**: Built-in error handling with Promises
4. **Maintainability**: Easier to understand and modify
5. **Reusability**: Use the same library across different projects
6. **Testability**: Each component can be tested independently
7. **Type Safety**: JSDoc annotations provide better IDE support

## Custom Configuration

The library supports extensive configuration. Here are common use cases:

### Custom Waveform Colors

```javascript
recordRTC.createLiveWaveform(canvas, {
    backgroundColor: '#000000',
    waveColor: '#00FF00',
    centerLineColor: '#333333',
    lineWidth: 3
});
```

### Custom Recording Options

```javascript
await recordRTC.startRecording({
    recordingOptions: {
        onDataAvailable: (blob) => { /* handle */ },
        recordRTCConfig: {
            type: 'audio',
            mimeType: 'audio/wav',
            numberOfAudioChannels: 2, // stereo
            bufferSize: 4096
        }
    },
    microphoneConstraints: {
        audio: {
            echoCancellation: true,
            noiseSuppression: true
        }
    }
});
```

## Using Individual Components

You can also use individual components without the main class:

```javascript
import { LiveWaveform, RecordingManager } from './assets/js/lib/index.js';

const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();

const waveform = new LiveWaveform(canvas, analyser);
const manager = new RecordingManager({
    onDataAvailable: (blob) => console.log('Audio chunk:', blob)
});

const stream = await RecordingManager.captureMicrophone();
waveform.start(stream, audioContext);
await manager.startRecording(stream);
```

## Troubleshooting

### Issue: "RecordRTC is not defined"
**Solution**: Make sure to load RecordRTC library before your module:
```html
<script src="assets/js/RecordRTC.js"></script>
<script type="module" src="your-app.js"></script>
```

### Issue: Module import errors
**Solution**: Ensure you're serving the files through a web server (not file:// protocol)

### Issue: Microphone not accessible
**Solution**: The library requires HTTPS or localhost to access the microphone

## Need Help?

- Check the [Library Documentation](public/assets/js/lib/README.md)
- Look at [Simple Example](public/example-simple.html)
- Review [Full Demo](public/index-new.html)
- Compare with [Original Implementation](public/index.html)
