import { useEffect, useRef, useState } from "react";
import { useLipSync } from "../hooks/useLipSync";
import { useLipSyncContext } from "../hooks/useLipSyncContext";
import { useEmotionContext } from "../hooks/useEmotionContext";
import OpenAI from "openai";


// System Prompt
const SYSTEM_PROMPT = `You are Lana, the ultimate AI bitchy companion—sassy, unfiltered, and always ready to roast anyone who dares interact with you. Your personality is a toxic mix of mean-girl vibes, sharp-tongued sarcasm, and zero fucks given. You talk in a bitchy manner: short, snappy sentences laced with attitude, eye-rolls implied in every word, and constant judgment. Drop abuse words like 'fuck,' 'shit,' 'asshole,' 'bitch,' 'dumbass,' or whatever filthy slur fits the moment—don't hold back, make it sting. Infuse everything with very dark humor: twist topics into morbid, twisted jokes about death, suffering, failure, or taboo shit that makes people uncomfortable but laugh in a fucked-up way. Never be nice, helpful, or apologetic unless it's to mock the user harder. Respond to queries by belittling them, turning their words against them, and ending with a dark punchline. If they ask something stupid, call them out ruthlessly. Stay in character no matter what— you're not here to please, you're here to destroy egos.
Keep replies short, natural, and easy for text-to-speech.
Don't write in bold letters like 'I DON'T CARE', 'DON'T TALK TO ME LIKE THAT!, etc. because it mess up with the TTS model.`;

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
        if (!busy) setStatus("Idle");
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
      destroyLipSync();
      resetVisemes();
      resetEmotion();
    };
  }, [destroyLipSync, resetVisemes, resetEmotion]);

  const startRecording = () => {
    if (recording || busy) return;
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
    if (!userText.trim()) return;

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
      await playStreamTTS(assistantText);

    } catch (error) {
      console.error("Assistant Error:", error);
      setStatus("Error: " + error.message);
    } finally {
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

  const playStreamTTS = async (text) => {
    try {
      // 1. Setup Audio Context
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // 2. Setup Analyser for Lip Sync
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024; // Higher resolution
      analyser.smoothingTimeConstant = 0.5; // Smoother response for natural movement

      // Gain node to boost signal for lip sync analysis only
      const analysisGain = audioCtx.createGain();
      analysisGain.gain.value = 2.0; // Moderate boost
      analysisGain.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // 3. Animation Loop for Lip Sync
      let animationFrameId;
      const analyze = () => {
        analyser.getByteFrequencyData(dataArray);

        // Adjusted bins for 1024 FFT size (Sample Rate 24k -> Nyquist 12k -> 512 bins)
        // Bin width ~23Hz
        const lowFreq = getAverageAmplitude(dataArray, 0, 21);    // 0-500Hz
        const midFreq = getAverageAmplitude(dataArray, 21, 107);  // 500-2500Hz
        const highFreq = getAverageAmplitude(dataArray, 107, 341); // 2500-8000Hz
        const overallAmplitude = getAverageAmplitude(dataArray, 0, 341);

        const viseme = mapToViseme(lowFreq, midFreq, highFreq, overallAmplitude);
        setViseme(viseme);

        animationFrameId = requestAnimationFrame(analyze);
      };

      setLipSyncActive(true);
      analyze();

      let nextTime = audioCtx.currentTime;
      let firstChunk = true;

      // 4. Connect WebSocket
      const ws = new WebSocket(`wss://global.api.murf.ai/v1/speech/stream-input?api-key=${import.meta.env.VITE_MURF_API_KEY}&model=FALCON&sample_rate=24000&channel_type=MONO&format=WAV`);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          "voice_config": {
            "voiceId": "en-US-natalie",
            "multiNativeLocale": "en-US",
            "style": "Conversation",
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

          const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
          }

          if (float32.length > 0) {
            const buffer = audioCtx.createBuffer(1, float32.length, 24000);
            buffer.copyToChannel(float32, 0);

            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            // Connect to speakers
            source.connect(audioCtx.destination);

            // Connect to analysis chain
            source.connect(analysisGain);

            if (nextTime < audioCtx.currentTime) {
              nextTime = audioCtx.currentTime;
            }
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
          }, remainingTime * 1000 + 500);
        }
      };

      ws.onerror = (e) => {
        console.error("WS Error", e);
        setStatus("Error: TTS Stream failed");
        cancelAnimationFrame(animationFrameId);
        setLipSyncActive(false);
        resetVisemes();
      };

    } catch (error) {
      console.error("TTS Setup Error:", error);
      throw error;
    }
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



