# Simple RecordRTC Example

This is a reorganized version of the RecordRTC audio recording example project, now featuring a **modular library** that can be reused across different projects.

## Project Structure

```
project/
├── public/              # Frontend files
│   ├── index.html       # Main HTML file (original implementation)
│   ├── index-new.html   # Demo using the modular library
│   ├── assets/          # Static assets
│   │   ├── css/         # Stylesheets
│   │   │   └── style.css
│   │   └── js/          # JavaScript files
│   │       ├── RecordRTC.js      # RecordRTC library
│   │       ├── app.js            # Original application code
│   │       ├── app-new.js        # Application using modular library
│   │       └── lib/              # Modular library
│   │           ├── index.js                 # Main library entry point
│   │           ├── LiveWaveform.js          # Real-time waveform visualization
│   │           ├── AccumulatedWaveform.js   # Accumulated waveform display
│   │           ├── RecordingManager.js      # Recording management
│   │           ├── AudioProcessor.js        # Audio processing utilities
│   │           └── README.md                # Library documentation
│   └── uploads/        # Audio file uploads
├── backend/            # PHP backend
│   ├── save.php        # Save audio files
│   ├── delete.php      # Delete audio files
│   └── index.php       # PHP version of main page
├── docs/               # Documentation
│   ├── README.md       # Original README
│   └── LICENSE         # License file
└── package.json        # Package configuration for ES modules
```

## Setup

1. Make sure you have a web server with PHP support
2. Place the project files in your web server directory
3. Access `public/index.html` for the frontend
4. The backend PHP files are in the `backend/` directory

## Features

### Original Application (index.html)
- Audio recording using RecordRTC
- Real-time audio visualization
- Save and delete recorded audio files
- Clean, organized file structure

### Modular Library (public/assets/js/lib/)
- **Modular Architecture**: Separated into independent, reusable modules
- **ES6 Module Support**: Import as ES modules or CommonJS
- **Configurable**: Customizable colors, styles, and behavior
- **Type-safe**: JSDoc annotations for better IDE support
- **Well-documented**: Comprehensive API documentation

#### Library Components:
1. **LiveWaveform**: Real-time waveform visualization during recording
2. **AccumulatedWaveform**: Complete recorded audio visualization with zoom/pan
3. **RecordingManager**: Simplified audio recording management
4. **AudioProcessor**: Utilities for audio buffer manipulation and WAV generation

## Quick Start

### Using the Original Application
1. Make sure you have a web server with PHP support
2. Place the project files in your web server directory
3. Access `public/index.html` for the original implementation

### Using the Modular Library
1. Open `public/index-new.html` for a demo of the modular library
2. See `public/assets/js/lib/README.md` for complete API documentation
3. Import the library in your project:

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';

const recorder = new SimpleRecordRTC();
await recorder.startRecording();
// ... your code
await recorder.stopRecording();
```

## Library Usage Example

```javascript
import SimpleRecordRTC from './public/assets/js/lib/index.js';

// Initialize library
const recorder = new SimpleRecordRTC();
recorder.initializeAudioContext();

// Create waveforms
const liveCanvas = document.getElementById('live-waveform');
const accumulatedCanvas = document.getElementById('accumulated-waveform');

recorder.createLiveWaveform(liveCanvas);
recorder.createAccumulatedWaveform(accumulatedCanvas);

// Start recording with callbacks
await recorder.startRecording({
    recordingOptions: {
        onDataAvailable: (blob) => {
            recorder.appendBlobToAccumulatedWaveform(blob);
        }
    }
});

// Stop recording
const recordingData = await recorder.stopRecording();
console.log('Recording completed:', recordingData);
```

For detailed API documentation, see [Library Documentation](public/assets/js/lib/README.md).

## Note

The PHP files have been updated to work with the new directory structure. The uploads path now points to `../public/uploads/` relative to the backend files.