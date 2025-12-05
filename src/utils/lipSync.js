// Lip sync utility for VRM avatars
// Maps audio amplitude to VRM mouth shapes (visemes)

export class LipSyncAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.isAnalyzing = false;
    this.onVisemeChange = null;
    this.animationFrame = null;
  }

  async initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      console.log("[LipSync] Initialized audio context");
      return true;
    } catch (error) {
      console.error("[LipSync] Failed to initialize:", error);
      return false;
    }
  }

  async startAnalysis(audioElement, onVisemeChange) {
    if (!this.audioContext) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    try {
      // Resume audio context if suspended (Chrome autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.onVisemeChange = onVisemeChange;
      
      // Check if audio element already has a source node attached
      // If so, we'll use a different approach with MediaStream
      try {
        this.source = this.audioContext.createMediaElementSource(audioElement);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      } catch (error) {
        if (error.name === 'InvalidStateError') {
          // Audio element already connected, try alternative approach
          console.log("[LipSync] Audio element already connected, using alternative method");
          return await this.startAnalysisAlternative(audioElement, onVisemeChange);
        }
        throw error;
      }
      
      this.isAnalyzing = true;
      this.analyze();
      
      console.log("[LipSync] Started analysis");
      return true;
    } catch (error) {
      console.error("[LipSync] Failed to start analysis:", error);
      return false;
    }
  }

  async startAnalysisAlternative(audioElement, onVisemeChange) {
    try {
      // Alternative method: capture audio using getUserMedia and analyzeAudioData
      // This is a fallback when MediaElementSource fails
      this.onVisemeChange = onVisemeChange;
      this.isAnalyzing = true;
      
      // Start a simple amplitude-based analysis using the audio element's volume
      this.analyzeFromVolume(audioElement);
      
      console.log("[LipSync] Started alternative analysis (volume-based)");
      return true;
    } catch (error) {
      console.error("[LipSync] Alternative analysis failed:", error);
      return false;
    }
  }

  analyzeFromVolume(audioElement) {
    if (!this.isAnalyzing) return;

    // Simple volume-based lip sync as fallback
    // This won't be as accurate as frequency analysis but will provide basic mouth movement
    const currentTime = audioElement.currentTime;
    const duration = audioElement.duration;
    
    if (duration && currentTime < duration && !audioElement.paused) {
      // Generate pseudo-random mouth movements based on time
      // This creates a basic talking animation
      const intensity = 0.3 + Math.sin(currentTime * 15) * 0.2 + Math.sin(currentTime * 25) * 0.1;
      const clampedIntensity = Math.max(0, Math.min(1, intensity));
      
      const viseme = {
        aa: clampedIntensity * 0.6,
        ih: clampedIntensity * 0.4,
        ou: clampedIntensity * 0.3,
        ee: clampedIntensity * 0.2,
        oh: clampedIntensity * 0.5,
        bmp: Math.random() > 0.8 ? clampedIntensity * 0.8 : 0, // Occasional lip closure
        amplitude: clampedIntensity
      };
      
      if (this.onVisemeChange) {
        this.onVisemeChange(viseme);
      }
    } else {
      // Audio ended or paused, reset visemes
      const neutralViseme = {
        aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, bmp: 0, amplitude: 0
      };
      if (this.onVisemeChange) {
        this.onVisemeChange(neutralViseme);
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.analyzeFromVolume(audioElement));
  }

  analyze() {
    if (!this.isAnalyzing) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate amplitude in different frequency ranges for more realistic lip sync
    const lowFreq = this.getAverageAmplitude(0, 10);     // 0-430Hz (vowels)
    const midFreq = this.getAverageAmplitude(10, 30);    // 430-1290Hz (consonants)
    const highFreq = this.getAverageAmplitude(30, 60);   // 1290-2580Hz (sibilants)
    
    // Overall amplitude
    const overallAmplitude = this.getAverageAmplitude(0, 60);
    
    // Map to VRM visemes based on frequency analysis
    const viseme = this.mapToViseme(lowFreq, midFreq, highFreq, overallAmplitude);
    
    if (this.onVisemeChange) {
      this.onVisemeChange(viseme);
    }

    this.animationFrame = requestAnimationFrame(() => this.analyze());
  }

  getAverageAmplitude(startBin, endBin) {
    let sum = 0;
    for (let i = startBin; i < Math.min(endBin, this.dataArray.length); i++) {
      sum += this.dataArray[i];
    }
    return sum / (endBin - startBin);
  }

  mapToViseme(lowFreq, midFreq, highFreq, overallAmplitude) {
    // Normalize amplitudes (0-255 range from analyser)
    const low = lowFreq / 255;
    const mid = midFreq / 255;
    const high = highFreq / 255;
    const overall = overallAmplitude / 255;
    
    // Threshold for detecting speech
    const speechThreshold = 0.1;
    
    if (overall < speechThreshold) {
      return {
        aa: 0,    // mouth open (ah)
        ih: 0,    // mouth slightly open (ih)
        ou: 0,    // mouth rounded (oh, oo)
        ee: 0,    // mouth wide (ee)
        oh: 0,    // mouth open rounded (oh)
        bmp: 0,   // lips closed (b, m, p)
        amplitude: overall
      };
    }

    // Simple mapping based on frequency content
    // This is a basic implementation - more sophisticated phoneme detection would be better
    let aa = 0, ih = 0, ou = 0, ee = 0, oh = 0, bmp = 0;

    if (low > 0.3) {
      // Strong low frequencies suggest vowels like "ah", "oh"
      if (mid > 0.2) {
        aa = Math.min(low * 1.2, 1.0);  // "ah" sound
      } else {
        oh = Math.min(low * 1.0, 1.0);  // "oh" sound
      }
    } else if (mid > 0.3) {
      // Mid frequencies suggest "ee", "ih" sounds
      if (high > 0.2) {
        ee = Math.min(mid * 1.0, 1.0);  // "ee" sound
      } else {
        ih = Math.min(mid * 1.0, 1.0);  // "ih" sound
      }
    } else if (high > 0.3) {
      // High frequencies suggest consonants or "oo" sounds
      if (overall < 0.3) {
        bmp = Math.min(high * 0.8, 1.0);  // Consonants like b, m, p
      } else {
        ou = Math.min(high * 0.8, 1.0);   // "oo" sound
      }
    } else {
      // General speech - use overall amplitude for basic mouth movement
      ih = Math.min(overall * 0.8, 1.0);
    }

    return {
      aa: aa,
      ih: ih,
      ou: ou,
      ee: ee,
      oh: oh,
      bmp: bmp,
      amplitude: overall
    };
  }

  stopAnalysis() {
    this.isAnalyzing = false;
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        // Source might already be disconnected
      }
      this.source = null;
    }
    
    this.onVisemeChange = null;
    console.log("[LipSync] Stopped analysis");
  }

  destroy() {
    this.stopAnalysis();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.dataArray = null;
  }
}
