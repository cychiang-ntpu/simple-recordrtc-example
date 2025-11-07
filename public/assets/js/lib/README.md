# SimpleRecordRTC Library

A modular audio recording and waveform visualization library based on RecordRTC. This library provides an easy-to-use API for recording audio, displaying real-time waveforms, and managing accumulated audio visualizations.

## Features

- **Modular Architecture**: Separated into independent, reusable modules
- **ES6 Module Support**: Import as ES modules or CommonJS
- **Real-time Waveform Visualization**: Display live audio waveforms during recording
- **Accumulated Waveform Display**: View complete recorded audio with zoom and pan controls
- **Recording Management**: Simple API for audio recording with RecordRTC
- **Audio Processing Utilities**: Tools for audio buffer manipulation and WAV generation
- **Configurable**: Customizable colors, styles, and behavior

## Installation

### Using as ES Module

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';
```

### Using Individual Modules

```javascript
import { LiveWaveform } from './public/assets/js/lib/LiveWaveform.js';
import { AccumulatedWaveform } from './public/assets/js/lib/AccumulatedWaveform.js';
import { RecordingManager } from './public/assets/js/lib/RecordingManager.js';
import { calculateTimeDuration } from './public/assets/js/lib/AudioProcessor.js';
```

## Quick Start

### Basic Usage

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';

// Create library instance
const recorder = new SimpleRecordRTC();

// Initialize audio context
recorder.initializeAudioContext();

// Create waveforms
const liveCanvas = document.getElementById('live-waveform');
const accumulatedCanvas = document.getElementById('accumulated-waveform');

recorder.createLiveWaveform(liveCanvas);
recorder.createAccumulatedWaveform(accumulatedCanvas);

// Start recording
await recorder.startRecording({
    recordingOptions: {
        onDataAvailable: (blob) => {
            // Handle recorded audio chunks
            recorder.appendBlobToAccumulatedWaveform(blob);
        }
    }
});

// Stop recording
const recordingData = await recorder.stopRecording();
console.log('Recording completed:', recordingData);
```

## API Documentation

### SimpleRecordRTC Class

Main class that provides a unified interface for all library features.

#### Constructor

```javascript
const recorder = new SimpleRecordRTC(config);
```

**Parameters:**
- `config` (Object, optional): Configuration object
  - `liveCanvas` (HTMLCanvasElement): Canvas for live waveform
  - `accumulatedCanvas` (HTMLCanvasElement): Canvas for accumulated waveform
  - `liveWaveformOptions` (Object): Options for live waveform
  - `accumulatedWaveformOptions` (Object): Options for accumulated waveform
  - `recordingOptions` (Object): Options for recording manager

#### Methods

##### `initializeAudioContext()`

Initialize Web Audio API context and components.

##### `createLiveWaveform(canvas, options)`

Create a live waveform visualizer.

**Parameters:**
- `canvas` (HTMLCanvasElement): Canvas element for drawing
- `options` (Object, optional): Waveform options
  - `backgroundColor` (string): Background color (default: '#f0f0f0')
  - `waveColor` (string): Waveform color (default: '#4CAF50')
  - `centerLineColor` (string): Center line color (default: '#d0d0d0')
  - `lineWidth` (number): Line width (default: 2)

**Returns:** `LiveWaveform` instance

##### `createAccumulatedWaveform(canvas, options)`

Create an accumulated waveform visualizer.

**Parameters:**
- `canvas` (HTMLCanvasElement): Canvas element for drawing
- `options` (Object, optional): Waveform options
  - `backgroundColor` (string): Background color (default: '#f0f0f0')
  - `waveColor` (string): Waveform color (default: '#1E88E5')
  - `centerLineColor` (string): Center line color (default: '#d0d0d0')
  - `targetSampleRate` (number): Target sample rate (default: 5000)

**Returns:** `AccumulatedWaveform` instance

##### `startRecording(options)`

Start recording with optional live waveform.

**Parameters:**
- `options` (Object, optional): Recording options
  - `recordingOptions` (Object): Options passed to RecordingManager
  - `microphoneConstraints` (Object): Microphone constraints

**Returns:** `Promise<void>`

##### `stopRecording()`

Stop recording and return recording data.

**Returns:** `Promise<Object>` - Recording data including blob, URL, and duration

##### `appendBlobToAccumulatedWaveform(blob)`

Append audio blob to accumulated waveform.

**Parameters:**
- `blob` (Blob): Audio blob to append

**Returns:** `Promise<void>`

##### `destroy()`

Clean up all resources and destroy the instance.

### LiveWaveform Class

Real-time waveform visualization using Canvas and AnalyserNode.

#### Constructor

```javascript
const liveWaveform = new LiveWaveform(canvas, analyserNode, options);
```

#### Methods

- `start(stream, audioContext)`: Start visualizing waveform
- `stop()`: Stop visualization
- `draw()`: Draw waveform (called automatically)

### AccumulatedWaveform Class

Accumulated audio waveform visualization with zoom and pan capabilities.

#### Constructor

```javascript
const accumulatedWaveform = new AccumulatedWaveform(canvas, options);
```

#### Methods

- `append(audioSamples)`: Append new audio samples
- `reset()`: Reset accumulated data
- `draw()`: Draw waveform
- `zoomBySteps(stepCount, anchorRatio)`: Zoom in/out
- `panBySamples(sampleDelta)`: Pan by samples
- `panByPixels(pixelDelta)`: Pan by pixels
- `resetView()`: Reset to default view
- `setSourceSampleRate(sampleRate)`: Set source sample rate

### RecordingManager Class

Manages audio recording with RecordRTC.

#### Constructor

```javascript
const manager = new RecordingManager(options);
```

**Parameters:**
- `options` (Object, optional): Configuration options
  - `onDataAvailable` (Function): Callback for audio chunks
  - `onRecordingStart` (Function): Callback when recording starts
  - `onRecordingStop` (Function): Callback when recording stops
  - `recordRTCConfig` (Object): RecordRTC configuration

#### Methods

- `startRecording(stream)`: Start recording
- `stopRecording()`: Stop recording
- `stopMicrophone()`: Stop microphone stream
- `getBlob()`: Get recording blob
- `getDuration()`: Get recording duration
- `isCurrentlyRecording()`: Check if recording

#### Static Methods

- `RecordingManager.captureMicrophone(constraints)`: Capture microphone with constraints

### Audio Processor Utilities

#### `mergeLeftRightBuffers(config, callback)`

Merge left and right channel buffers and create WAV file.

#### `calculateTimeDuration(secs)`

Convert seconds to formatted time string (HH:MM:SS or MM:SS).

#### `decodeAudioBlob(blob, audioContext)`

Decode audio blob to audio buffer.

## Examples

### Example 1: Simple Recording

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';

const recorder = new SimpleRecordRTC();
recorder.initializeAudioContext();

// Start recording
document.getElementById('start').addEventListener('click', async () => {
    await recorder.startRecording();
});

// Stop recording
document.getElementById('stop').addEventListener('click', async () => {
    const data = await recorder.stopRecording();
    console.log('Recording blob:', data.blob);
});
```

### Example 2: Custom Waveform Colors

```javascript
const liveCanvas = document.getElementById('live-waveform');
const recorder = new SimpleRecordRTC();
recorder.initializeAudioContext();

recorder.createLiveWaveform(liveCanvas, {
    backgroundColor: '#000000',
    waveColor: '#00FF00',
    centerLineColor: '#333333',
    lineWidth: 3
});
```

### Example 3: Using Individual Modules

```javascript
import { LiveWaveform, RecordingManager } from './public/assets/js/lib/index.js';

// Initialize Web Audio API
const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();

// Create live waveform
const canvas = document.getElementById('waveform');
const waveform = new LiveWaveform(canvas, analyser);

// Create recording manager
const manager = new RecordingManager({
    onDataAvailable: (blob) => {
        console.log('Audio chunk received:', blob);
    }
});

// Start recording
const stream = await RecordingManager.captureMicrophone();
waveform.start(stream, audioContext);
await manager.startRecording(stream);
```

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires support for:
- Web Audio API
- MediaStream API
- ES6 Modules
- Canvas API

## Dependencies

- **RecordRTC** (peer dependency): Required for audio recording functionality

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Migration Guide

If you're migrating from the original `app.js` implementation:

### Before (Original app.js)

```javascript
// Global variables and tightly coupled code
var recorder;
var liveWaveform;
var accumulatedWaveform;

document.getElementById('btn-start-recording').onclick = function() {
    // Complex initialization code...
};
```

### After (Using Library)

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';

const recorder = new SimpleRecordRTC();
recorder.initializeAudioContext();

document.getElementById('btn-start-recording').onclick = async function() {
    await recorder.startRecording({
        recordingOptions: {
            onDataAvailable: (blob) => {
                recorder.appendBlobToAccumulatedWaveform(blob);
            }
        }
    });
};
```

The library provides:
- Cleaner API with proper encapsulation
- Better separation of concerns
- Easier to test and maintain
- Reusable across different projects
- Type-safe with JSDoc annotations
