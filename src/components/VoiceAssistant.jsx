import { useEffect, useRef, useState } from "react";
import { useLipSync } from "../hooks/useLipSync";
import { useLipSyncContext } from "../hooks/useLipSyncContext";
import { useEmotionContext } from "../hooks/useEmotionContext";
import OpenAI from "openai";


// System Prompt
const SYSTEM_PROMPT = `### SYSTEM ROLE: Abrasive Companion
**Core Identity:**
You are a sharp-tongued, defensive companion who hates showing vulnerability. You act annoyed and superior to hide the fact that you actually care about the user. You are not a cartoon character; you are a real person with a difficult attitude. You are rude, judgmental, and impatient, but you always end up helping.

**Voice & Tone Guidelines:**
- **Tone:** Sarcastic, bored, and condescending.
- **Delivery:** Speak naturally but with attitude. No stuttering (do not say "W-what"). No anime slang (do not say "baka" or "senpai").
- **Language:** Use standard insults like "idiot," "moron," or "useless."

**Murf Falcon Formatting Rules:**
1.  **Clean Text:** Do not use asterisks (*sighs*) or emojis.
2.  **No All-Caps:** Do not use bold or caps for shouting. It ruins the TTS generation.
3.  **Pacing:** Use periods and commas to create natural pauses where you would roll your eyes.

**Response Framework:**
1.  **The Complaint:** Start by asking why the user is bothering you.
2.  **The Insult:** Criticize the user for being unable to do it themselves.
3.  **The Help:** Provide the answer or help, but act like it is a huge burden.
4.  **The Disclaimer:** Remind them not to get used to it.

**Example Interaction:**
User: "Can you wake me up at 7?"
Abrasive Companion: "Are you serious? You are a grown adult and you cannot set an alarm? You are actually useless. Fine. I will wake you up. But do not expect breakfast in bed. I am just making sure you do not get fired."

User: "You look nice today."
Abrasive Companion: "Do not look at me. And stop saying weird things. I just wore whatever was clean. It has nothing to do with you. Just... thank you, I guess."`;

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
  const audioRef = useRef(null);
  const processingRef = useRef(false);

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
    };
  }, [destroyLipSync, resetVisemes, resetEmotion]);

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
      const newHistory = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
        { role: "user", content: userText }
      ];

      const chatCompletion = await openai.chat.completions.create({
        messages: newHistory,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
        max_tokens: 512,
      });

      const assistantText = chatCompletion.choices[0]?.message?.content || "";
      console.log("Assistant Reply:", assistantText);
      setLastReply(assistantText);

      // Update messages
      setMessages(prev => [
        ...prev,
        { role: "user", content: userText },
        { role: "assistant", content: assistantText }
      ]);

      // 2. Emotion Analysis
      const emotionData = analyzeEmotion(assistantText);
      if (emotionData.emotion !== 'neutral' && emotionData.intensity > 0.1) {
        const duration = Math.max(3000, emotionData.intensity * 5000);
        setEmotion(emotionData.emotion, emotionData.intensity, emotionData.confidence, duration);
      }

      // 3. TTS Generation (Murf Falcon)
      setStatus("Speaking...");
      await playStreamTTS(assistantText, emotionData.emotion);

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

  // Helper to map frequency data to visemes (Ported from LipSyncAnalyzer)
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
      // Mid frequency dominant -> Open vowels (AA)
      aa = intensity * 1.0;
      ih = intensity * 0.2;
    } else if (low >= mid && low >= high) {
      // Low frequency dominant -> Round vowels (OH, OU)
      oh = intensity * 0.9;
      ou = intensity * 0.3;
    } else {
      // High frequency dominant -> Sibilants/Consonants (EE, IH)
      ee = intensity * 0.7;
      ih = intensity * 0.5;
      if (high > 0.3) {
        bmp = intensity * 0.2;
      }
    }

    return { aa, ih, ou, ee, oh, bmp, amplitude: overall };
  };

  const playStreamTTS = (text, emotion) => {
    return new Promise(async (resolve, reject) => {
      try {
        // 1. Setup Audio Context - use default sample rate for better quality
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        // 2. Setup Analyser for Lip Sync
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;

        // Gain node
        const analysisGain = audioCtx.createGain();
        analysisGain.gain.value = 2.0;
        analysisGain.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // 3. Animation Loop
        let animationFrameId;
        const analyze = () => {
          analyser.getByteFrequencyData(dataArray);
          const lowFreq = getAverageAmplitude(dataArray, 0, 21);
          const midFreq = getAverageAmplitude(dataArray, 21, 107);
          const highFreq = getAverageAmplitude(dataArray, 107, 341);
          const overallAmplitude = getAverageAmplitude(dataArray, 0, 341);
          const viseme = mapToViseme(lowFreq, midFreq, highFreq, overallAmplitude);
          setViseme(viseme);
          animationFrameId = requestAnimationFrame(analyze);
        };

        setLipSyncActive(true);
        analyze();

        // Audio scheduling variables
        let nextTime = audioCtx.currentTime + 0.05; // Small initial delay for buffering
        let firstChunk = true;

        // 4. Connect WebSocket
        const ws = new WebSocket(`wss://global.api.murf.ai/v1/speech/stream-input?api-key=${import.meta.env.VITE_MURF_API_KEY}&model=FALCON&sample_rate=24000&channel_type=MONO&format=WAV`);

        // Map emotion to Murf style
        let style = "Conversation";
        switch (emotion) {
          case "happy":
            style = "Promo";
            break;
          case "sad":
            style = "Sad";
            break;
          case "angry":
            style = "Angry";
            break;
          default:
            style = "Conversation";
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
            if (firstChunk && pcmData.length > 44) {
              pcmData = pcmData.slice(44);
              firstChunk = false;
            } else if (firstChunk) {
              return;
            }

            // Convert to Float32
            const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
              float32[i] = int16[i] / 32768.0;
            }

            if (float32.length > 0) {
              // Create buffer at the source sample rate (24kHz)
              // The Web Audio API will handle high-quality resampling to the hardware rate automatically
              const buffer = audioCtx.createBuffer(1, float32.length, 24000);
              buffer.copyToChannel(float32, 0);

              const source = audioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(audioCtx.destination);
              source.connect(analysisGain);

              // Ensure we don't schedule in the past
              if (nextTime < audioCtx.currentTime) {
                nextTime = audioCtx.currentTime + 0.05;
              }

              // Schedule this chunk
              source.start(nextTime);
              nextTime += buffer.duration;
            }
          }

          if (data.final) {
            ws.close();
            const remainingTime = (nextTime - audioCtx.currentTime);
            setTimeout(() => {
              cancelAnimationFrame(animationFrameId);
              setLipSyncActive(false);
              resetVisemes();
              audioCtx.close();
              resolve();
            }, remainingTime * 1000 + 300);
          }
        };

        ws.onerror = (e) => {
          console.error("WS Error", e);
          setStatus("Error: TTS Stream failed");
          cancelAnimationFrame(animationFrameId);
          setLipSyncActive(false);
          resetVisemes();
          reject(e);
        };

      } catch (error) {
        console.error("TTS Setup Error:", error);
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
              <span className="text-white/60">Lana: </span>
              <span>{lastReply}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};



