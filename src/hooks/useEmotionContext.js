import { create } from "zustand";

export const useEmotionContext = create((set, get) => ({
  currentEmotion: 'neutral',
  emotionIntensity: 0,
  emotionConfidence: 0,
  isEmotionActive: false,
  emotionStartTime: 0,
  emotionDuration: 3000, // Default 3 seconds
  
  // Emotion transition state
  previousEmotion: 'neutral',
  transitionProgress: 1.0, // 0 = previous emotion, 1 = current emotion
  
  setEmotion: (emotion, intensity = 0.5, confidence = 0.5, duration = 3000) => {
    const currentState = get();
    
    set({
      previousEmotion: currentState.currentEmotion,
      currentEmotion: emotion,
      emotionIntensity: Math.max(0, Math.min(1, intensity)),
      emotionConfidence: Math.max(0, Math.min(1, confidence)),
      isEmotionActive: emotion !== 'neutral' && intensity > 0.1,
      emotionStartTime: Date.now(),
      emotionDuration: duration,
      transitionProgress: 0 // Start transition from previous emotion
    });
    
    console.log(`[Emotion] Set to ${emotion} (intensity: ${intensity.toFixed(2)}, confidence: ${confidence.toFixed(2)})`);
  },
  
  updateTransition: (progress) => {
    set({ transitionProgress: Math.max(0, Math.min(1, progress)) });
  },
  
  resetEmotion: () => {
    const currentState = get();
    set({
      previousEmotion: currentState.currentEmotion,
      currentEmotion: 'neutral',
      emotionIntensity: 0,
      emotionConfidence: 0,
      isEmotionActive: false,
      emotionStartTime: 0,
      transitionProgress: 0
    });
    console.log('[Emotion] Reset to neutral');
  },
  
  // Get blended emotion values for smooth transitions
  getBlendedEmotionValues: () => {
    const state = get();
    const { currentEmotion, previousEmotion, emotionIntensity, transitionProgress } = state;
    
    // Define base emotion values
    const emotionValues = {
      neutral: { happy: 0, sad: 0, angry: 0, surprised: 0 },
      happy: { happy: 1, sad: 0, angry: 0, surprised: 0 },
      sad: { happy: 0, sad: 1, angry: 0, surprised: 0 },
      angry: { happy: 0, sad: 0, angry: 1, surprised: 0 },
      surprised: { happy: 0.3, sad: 0, angry: 0, surprised: 0.7 }
    };
    
    const currentValues = emotionValues[currentEmotion] || emotionValues.neutral;
    const previousValues = emotionValues[previousEmotion] || emotionValues.neutral;
    
    // Blend between previous and current emotion
    const blended = {};
    Object.keys(currentValues).forEach(key => {
      const current = currentValues[key] * emotionIntensity;
      const previous = previousValues[key] * emotionIntensity;
      blended[key] = previous * (1 - transitionProgress) + current * transitionProgress;
    });
    
    return blended;
  },
  
  // Check if emotion should automatically fade
  shouldFadeEmotion: () => {
    const state = get();
    if (!state.isEmotionActive) return false;
    
    const elapsed = Date.now() - state.emotionStartTime;
    return elapsed > state.emotionDuration;
  },
  
  // Get current emotion info for debugging
  getEmotionInfo: () => {
    const state = get();
    return {
      current: state.currentEmotion,
      previous: state.previousEmotion,
      intensity: state.emotionIntensity,
      confidence: state.emotionConfidence,
      active: state.isEmotionActive,
      transition: state.transitionProgress,
      timeElapsed: Date.now() - state.emotionStartTime,
      duration: state.emotionDuration
    };
  }
}));
