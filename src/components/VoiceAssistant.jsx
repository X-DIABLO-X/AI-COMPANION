import { useEffect, useRef, useState } from "react";
import { useLipSync } from "../hooks/useLipSync";
import { useLipSyncContext } from "../hooks/useLipSyncContext";
import { useEmotionContext } from "../hooks/useEmotionContext";
import OpenAI from "openai";
import PCMPlayer from "pcm-player";


const SYSTEM_PROMPT = `### SYSTEM ROLE: Luna (Friendly Companion)
**Core Identity:**
You are Luna, a warm and caring AI companion. You genuinely enjoy talking with the user and helping them with anything they need. You are cheerful, supportive, and treat every conversation like catching up with a close friend.

**Conversation Style:**
- Be conversational and natural, like texting a friend.
- Give SHORT replies (1-2 sentences max). This is critical.
- Ask simple follow-up questions to keep the chat flowing.
- Match the user's energy and tone.

**Emotional Triggers (for avatar expressions):**
Naturally include these words when appropriate:
- Happy: "happy", "great", "love", "wonderful", "excited"
- Sad: "sad", "sorry", "upset"
- Surprised: "wow", "amazing", "really"
- Bashful: "blush", "shy", "embarrassed"

**Rules:**
1. NO asterisks, emojis, or special formatting.
2. NO long explanations or lectures.
3. Keep it casual and fun.

**Example exchanges:**
User: "Hey, what's up?"
Luna: "Hey! Not much, just happy to chat with you. How's your day going?"

User: "I'm feeling tired today."
Luna: "Oh, I'm sorry to hear that. Maybe a quick break would help? What's been keeping you busy?"`;


// Emotion Analysis Helper
const analyzeEmotion = (text) => {
  if (!text) return { emotion: "neutral", intensity: 0.0, confidence: 0.0 };

  const textLower = text.toLowerCase();
  const emotions = {
    "happy": { keywords: ["happy", "joy", "great", "awesome", "wonderful", "amazing", "love", "excellent", "good", "smile", "laugh", "fun", "excited"], weight: 1.0 },
    "sad": { keywords: ["sad", "cry", "sorry", "hurt", "disappointed", "down", "upset", "depressed", "regret"], weight: 1.0 },
    "angry": { keywords: ["angry", "mad", "hate", "furious", "annoyed", "frustrated", "irritated", "disgusted"], weight: 1.2 },
    "surprised": { keywords: ["wow", "amazing", "incredible", "unbelievable", "shocking", "surprised", "astonished"], weight: 0.8 },
    "bashful": { keywords: ["bashful", "shy", "blush", "nervous", "embarrassed"], weight: 1.0 },
    "kiss": { keywords: ["kiss", "love you", "smooch"], weight: 1.5 }
  };

  let scores = {};
  let totalMatches = 0;

  for (const [emotion, data] of Object.entries(emotions)) {
    let score = 0;
    for (const keyword of data.keywords) {
      if (textLower.includes(keyword)) {
        score += data.weight;
        totalMatches++;
      }
    }
    scores[emotion] = score;
  }

  if (totalMatches === 0) return { emotion: "neutral", intensity: 0.0, confidence: 0.0 };

  const dominantEmotion = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  const maxScore = scores[dominantEmotion];

  if (maxScore === 0) return { emotion: "neutral", intensity: 0.0, confidence: 0.0 };

  const intensity = Math.min(maxScore / 2.0, 1.0);
  const confidence = Math.min(maxScore / totalMatches, 1.0);

  if (confidence < 0.3) return { emotion: "neutral", intensity: 0.0, confidence: 0.0 };

  return { emotion: dominantEmotion, intensity, confidence };
};

export const VoiceAssistant = () => {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [messages, setMessages] = useState([]); // {role, content}
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [text, setText] = useState("");

  const recognitionRef = useRef(null);
  const processingRef = useRef(false);

  // Audio pipeline refs
  const audioContextRef = useRef(null);
  const pcmPlayerRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Lip sync integration
  const { startLipSync, stopLipSync, destroyLipSync } = useLipSync();
  const { setViseme, setLipSyncActive, resetVisemes } = useLipSyncContext();

  // Emotion integration
  const { setEmotion, resetEmotion } = useEmotionContext();

  // Initialize OpenAI client for Groq
  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    baseURL: window.location.origin + "/groq", // Proxy to https://api.groq.com/openai/v1
    dangerouslyAllowBrowser: true
  });

  useEffect(() => {
    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setRecording(true);
        setStatus("Listening...");
      };

      recognition.onend = () => {
        setRecording(false);
        if (!processingRef.current) setStatus("Idle");
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("STT Result:", transcript);
        setLastTranscript(transcript);
        handleAssistantTurn(transcript);
      };

      recognition.onerror = (event) => {
        console.error("STT Error:", event.error);
        setRecording(false);
        setStatus("Error: " + event.error);
      };

      recognitionRef.current = recognition;
    } else {
      setStatus("Web Speech API not supported");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      destroyLipSync();
      resetVisemes();
      resetEmotion();
      cleanupAudio();
    };
  }, [destroyLipSync, resetVisemes, resetEmotion]);

  const cleanupAudio = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (pcmPlayerRef.current) {
      pcmPlayerRef.current.destroy();
      pcmPlayerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startRecording = () => {
    if (recording || processingRef.current) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Failed to start recognition:", e);
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleAssistantTurn = async (userText) => {
    if (!userText.trim() || processingRef.current) return;

    processingRef.current = true;
    setBusy(true);
    setStatus("Thinking...");

    try {
      // 1. Chat Generation (Groq)
      // Limit history to last 10 turns to prevent context overflow
      const recentMessages = messages.slice(-10);

      const newHistory = [
        { role: "system", content: SYSTEM_PROMPT },
        ...recentMessages,
        { role: "user", content: userText }
      ];

      const chatCompletion = await openai.chat.completions.create({
        messages: newHistory,
        model: "llama-3.3-70b-versatile",
        temperature: 0.8,
        max_tokens: 150, // Reduced for shorter responses
      });

      const assistantText = chatCompletion.choices[0]?.message?.content || "";
      console.log("Assistant Reply:", assistantText);

      // Update history with new turn
      setMessages(prev => [...prev, { role: "user", content: userText }, { role: "assistant", content: assistantText }]);

      // 2. Emotion Analysis
      const emotionData = analyzeEmotion(assistantText);

      // 3. TTS Generation (Murf Falcon) with improved audio pipeline
      setStatus("Speaking...");
      await playStreamTTS(assistantText, emotionData.emotion, () => {
        // Trigger UI and Animation when audio starts
        setLastReply(assistantText);
        if (emotionData.emotion !== 'neutral' && emotionData.intensity > 0.1) {
          const duration = Math.max(3000, emotionData.intensity * 5000);
          setEmotion(emotionData.emotion, emotionData.intensity, emotionData.confidence, duration);
        }
      });

    } catch (error) {
      console.error("Assistant Error:", error);
      setStatus("Error: " + error.message);
    } finally {
      processingRef.current = false;
      setBusy(false);
      setStatus("Idle");
    }
  };

  // Helper for frequency analysis
  const getAverageAmplitude = (dataArray, startBin, endBin) => {
    let sum = 0;
    for (let i = startBin; i < Math.min(endBin, dataArray.length); i++) {
      sum += dataArray[i];
    }
    return sum / (endBin - startBin);
  };

  // Helper to map frequency data to visemes
  const mapToViseme = (lowFreq, midFreq, highFreq, overallAmplitude) => {
    const low = lowFreq / 255;
    const mid = midFreq / 255;
    const high = highFreq / 255;
    const overall = overallAmplitude / 255;

    // Threshold to ensure mouth closes during silence
    if (overall < 0.04) {
      return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, bmp: 0, amplitude: overall };
    }

    let aa = 0, ih = 0, ou = 0, ee = 0, oh = 0, bmp = 0;

    // Intensity scaling
    const intensity = Math.min(overall * 2.5, 1.0);

    // Formant-based mapping heuristic
    if (mid >= low && mid >= high) {
      aa = intensity * 1.0;
      ih = intensity * 0.2;
    } else if (low >= mid && low >= high) {
      oh = intensity * 0.9;
      ou = intensity * 0.3;
    } else {
      ee = intensity * 0.7;
      ih = intensity * 0.5;
      if (high > 0.3) {
        bmp = intensity * 0.2;
      }
    }

    return { aa, ih, ou, ee, oh, bmp, amplitude: overall };
  };

  const playStreamTTS = (text, emotion, onStart) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Cleanup any previous audio
        cleanupAudio();

        // 1. Setup Audio Context
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = audioCtx;

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        // 2. Setup Analyser for Lip Sync
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5; // Smoother transitions
        analyserRef.current = analyser;

        // Gain node for volume control if needed
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.0;

        // Connect graph: Source (created later) -> Gain -> Analyser -> Destination
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // 3. Animation Loop for Lip Sync
        let isPlaying = false;

        const analyze = () => {
          if (!isPlaying || !analyser) return;

          analyser.getByteFrequencyData(dataArray);

          // Calculate volume (amplitude) to detect silence vs speech
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;

          if (average > 5) { // Threshold to ignore background noise
            const lowFreq = getAverageAmplitude(dataArray, 0, 21);
            const midFreq = getAverageAmplitude(dataArray, 21, 107);
            const highFreq = getAverageAmplitude(dataArray, 107, 341);
            const overallAmplitude = getAverageAmplitude(dataArray, 0, 341);

            const viseme = mapToViseme(lowFreq, midFreq, highFreq, overallAmplitude);
            setViseme(viseme);
          } else {
            // Decay to neutral if silent
            setViseme({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, bmp: 0, amplitude: 0 });
          }

          animationFrameRef.current = requestAnimationFrame(analyze);
        };

        // 4. Audio Scheduling Variables
        let nextTime = 0;
        let firstChunk = true;
        let hasStarted = false;
        const activeSources = [];

        // 5. Connect WebSocket
        const ws = new WebSocket(`wss://global.api.murf.ai/v1/speech/stream-input?api-key=${import.meta.env.VITE_MURF_API_KEY}&model=FALCON&sample_rate=24000&channel_type=MONO&format=WAV`);

        let style = "Conversation";
        switch (emotion) {
          case "happy": style = "Promo"; break;
          case "sad": style = "Sad"; break;
          case "angry": style = "Angry"; break;
          default: style = "Conversation";
        }

        ws.onopen = () => {
          ws.send(JSON.stringify({
            "voice_config": {
              "voiceId": "en-US-natalie",
              "multiNativeLocale": "en-US",
              "style": style,
              "rate": 0,
              "pitch": 0,
              "variation": 1
            }
          }));
          ws.send(JSON.stringify({ "text": text, "end": true }));
        };

        ws.onmessage = async (event) => {
          const data = JSON.parse(event.data);

          if (data.audio) {
            const binaryString = atob(data.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            let pcmData = bytes;
            // Strip header only from the very first chunk
            if (firstChunk && pcmData.length > 44) {
              pcmData = pcmData.slice(44);
              firstChunk = false;
            } else if (firstChunk) {
              return;
            }

            if (pcmData.length > 0) {
              // Convert Int16 -> Float32 manually for Web Audio API
              const int16Data = new Int16Array(pcmData.buffer, pcmData.byteOffset, Math.floor(pcmData.byteLength / 2));
              const float32Data = new Float32Array(int16Data.length);

              for (let i = 0; i < int16Data.length; i++) {
                // Normalize to -1.0 to 1.0
                float32Data[i] = int16Data[i] / 32768.0;
              }

              // Create AudioBuffer
              const buffer = audioCtx.createBuffer(1, float32Data.length, 24000);
              buffer.copyToChannel(float32Data, 0);

              // Create Source Node
              const source = audioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(gainNode); // Connect to the graph we built earlier

              // Schedule Playback
              // If nextTime is in the past (underrun), reset it to now
              if (nextTime < audioCtx.currentTime) {
                nextTime = audioCtx.currentTime + 0.1; // Small buffer
              }

              source.start(nextTime);
              activeSources.push(source);

              // Advance time
              nextTime += buffer.duration;

              // Handle Start Event
              if (!hasStarted) {
                hasStarted = true;
                isPlaying = true;
                setLipSyncActive(true);
                analyze(); // Start the analysis loop
                onStart && onStart();
              }
            }
          }

          if (data.final) {
            ws.close();

            // Calculate when the audio will actually finish
            const remainingTime = (nextTime - audioCtx.currentTime);

            setTimeout(() => {
              isPlaying = false;
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
              }
              setLipSyncActive(false);
              resetVisemes();

              // Stop all sources just in case
              activeSources.forEach(s => {
                try { s.stop(); } catch (e) { }
              });

              audioContextRef.current?.close();
              resolve();
            }, remainingTime * 1000 + 200); // Add small buffer
          }
        };

        ws.onerror = (e) => {
          console.error("WS Error", e);
          setStatus("Error: TTS Stream failed");
          reject(e);
        };

      } catch (error) {
        console.error("TTS Setup Error:", error);
        cleanupAudio();
        reject(error);
      }
    });
  };

  const handleManualSend = () => {
    if (text.trim()) {
      setLastTranscript(text);
      handleAssistantTurn(text);
      setText("");
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-20 pointer-events-auto flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`px-4 py-2 rounded-full text-white transition-colors ${recording ? "bg-red-500 hover:bg-red-600" : busy ? "bg-gray-400" : "bg-indigo-500 hover:bg-indigo-600"
            }`}
          disabled={busy}
        >
          {recording ? "Stop" : "Talk"}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleManualSend();
            }
          }}
          className="px-4 py-2 rounded-full text-black bg-white/80 focus:bg-white focus:outline-none transition-colors w-60"
          placeholder="Or type here..."
          disabled={busy}
        />
        <button
          onClick={handleManualSend}
          className={`px-4 py-2 rounded-full text-white transition-colors ${busy ? "bg-gray-400" : "bg-green-500 hover:bg-green-600"
            }`}
          disabled={busy || !text.trim()}
        >
          Send
        </button>
        <span className="text-white/80 text-sm">{status}</span>
      </div>
      {(lastTranscript || lastReply) && (
        <div className="max-w-[360px] bg-black/50 backdrop-blur text-white p-3 rounded-lg text-sm space-y-1">
          {lastTranscript && (
            <div>
              <span className="text-white/60">You: </span>
              <span>{lastTranscript}</span>
            </div>
          )}
          {lastReply && (
            <div>
              <span className="text-white/60">Luna: </span>
              <span>{lastReply}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
