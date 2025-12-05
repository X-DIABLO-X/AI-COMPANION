# LunaAI

A real-time 3D AI companion running entirely in the browser using React, Three.js, and cloud AI services.

## Overview

This project implements a fully interactive 3D avatar that can listen, think, and speak in real-time. It has been migrated from a complex local Python backend to a streamlined, frontend-only architecture.

**Note on Architecture & Voice:**
> Previously, this project used a local Python backend with **Faster-Whisper** for STT, a local **Llama** model, and **GPT-SoVITS** with a custom fine-tuned voice model for TTS.
>
> We have transitioned to a cloud-based pipeline for simplicity and performance. However, **Murf AI does not provide voice cloning for free**, so replicating the exact previous voice was difficult. We are now using Murf's "Natalie" (en-US) voice via their Falcon model.
>
> All functionalities (STT, Chat, TTS, Lip Sync, Emotions) now run directly in the browser, connected via simple APIs and WebSockets.

## Walkthrough
[![Luna Demo](./public/thumbnail/luna.jpg)](https://youtu.be/fMGMmm3KJ2c)

## Features

- **3D Avatar**: Interactive VRM avatar with real-time lip sync and facial expressions.
- **Speech-to-Text (STT)**: Uses the browser's native **Web Speech API** for fast, local transcription.
- **LLM (Chat)**: Integrates **Groq API** (Llama 3.3 70b) for extremely fast, conversational responses.
- **Text-to-Speech (TTS)**: Uses **Murf Falcon API** with **WebSocket streaming** for low-latency audio playback.
- **Lip Sync**: Real-time audio frequency analysis (Formant-based mapping) to drive avatar mouth movements.
- **Emotion Analysis**: Analyzes chat content to trigger appropriate facial expressions (Happy, Sad, Angry, etc.).

## Prerequisites

- **Node.js** (v16 or higher)
- **Groq API Key**: [Get one here](https://console.groq.com/)
- **Murf AI API Key**: [Get one here](https://murf.ai/)

## Setup & Usage

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd "AI COMPANION"
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**
    Create a `.env` file in the root directory (or rename `.env.example`) and add your API keys:

    ```env
    VITE_GROQ_API_KEY=your_groq_api_key_here
    VITE_MURF_API_KEY=your_murf_api_key_here
    ```

    *Note: Since this is a client-side app, keys are exposed in the build. For production, use a proxy server.*

4.  **Run the Application**
    ```bash
    npm run dev
    ```
    Open your browser to `http://localhost:5173` (or the port shown in the terminal).

## Configuration

### Vite Proxy
To bypass CORS restrictions when calling Groq and Murf APIs directly from the browser, we use a Vite proxy configuration in `vite.config.js`:

```javascript
server: {
  proxy: {
    "/groq": {
      target: "https://api.groq.com/openai/v1",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/groq/, ""),
    },
    "/murf": {
      target: "https://global.api.murf.ai/v1",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/murf/, ""),
    },
  },
}
```

### Voice Customization
The voice is configured in `src/components/VoiceAssistant.jsx` inside the `playStreamTTS` function:

```javascript
"voiceId": "en-US-natalie",
// ... other settings
```

## Troubleshooting

- **No Audio/Lip Sync**: Ensure you have interacted with the page (clicked "Talk") to unlock the AudioContext.
- **CORS Errors**: Ensure you are accessing the app via `localhost` and that the Vite proxy is running.
- **STT Not Working**: Ensure you are using a browser that supports the Web Speech API (Chrome, Edge, Safari).
