# Kokoro TTS Server

A Next.js-based Text-to-Speech server using the Kokoro-82M model with server-side GPU acceleration.

## Features

- **Server-side TTS**: Model loads once on server startup and runs inference on the server
- **Streaming audio**: Real-time audio streaming via Server-Sent Events
- **Multiple voices**: 25+ voices with different accents and genders
- **Download support**: Generate and download complete audio files
- **Modern UI**: Clean React-based interface with TailwindCSS

## Prerequisites

- Node.js 18+ 
- (Optional) CUDA-compatible GPU for faster inference

## Installation

```bash
cd next-app
npm install
```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

The server will start at `http://localhost:3000`.

## API Endpoints

### GET /api/tts
Check model status and get available voices.

**Response:**
```json
{
  "ready": true,
  "voices": { ... },
  "sampleRate": 24000
}
```

### POST /api/tts
Stream TTS audio using Server-Sent Events.

**Request:**
```json
{
  "text": "Hello, world!",
  "voice": "af_heart",
  "speed": 1
}
```

**Response:** SSE stream with audio chunks in base64 format.

### POST /api/tts/download
Generate a complete WAV file for download.

**Request:**
```json
{
  "text": "Hello, world!",
  "voice": "af_heart",
  "speed": 1
}
```

**Response:** WAV audio file.

## Architecture

```
next-app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── tts/          # TTS API routes
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Main page
│   │   └── globals.css       # Global styles
│   ├── components/           # React components
│   │   ├── TTSClient.tsx     # Main TTS client
│   │   ├── VoiceSelector.tsx # Voice dropdown
│   │   ├── ProgressBar.tsx   # Progress indicator
│   │   └── Icons.tsx         # SVG icons
│   ├── lib/
│   │   ├── tts-model.ts      # TTS model singleton
│   │   ├── voices.ts         # Voice definitions
│   │   ├── phonemize.ts      # Text normalization
│   │   └── text-splitter.ts  # Text chunking
│   └── instrumentation.ts    # Model preloading on startup
```

## Model

Uses the [Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) model from Hugging Face.

- **Size**: ~300MB
- **Sample Rate**: 24kHz
- **Format**: Mono audio

## License

MIT
