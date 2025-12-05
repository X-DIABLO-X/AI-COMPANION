import { useRef, useCallback } from 'react';
import { LipSyncAnalyzer } from '../utils/lipSync';
import { useLipSyncContext } from './useLipSyncContext';

export const useLipSync = () => {
  const lipSyncRef = useRef(null);
  const currentVisemeRef = useRef({
    aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, bmp: 0, amplitude: 0
  });

  const initializeLipSync = useCallback(async () => {
    if (!lipSyncRef.current) {
      lipSyncRef.current = new LipSyncAnalyzer();
      await lipSyncRef.current.initialize();
    }
    return lipSyncRef.current;
  }, []);

  const startLipSync = useCallback(async (audioElement, onVisemeChange) => {
    const lipSync = await initializeLipSync();
    if (lipSync) {
      const wrappedCallback = (viseme) => {
        currentVisemeRef.current = viseme;
        if (onVisemeChange) {
          onVisemeChange(viseme);
        }
      };
      return await lipSync.startAnalysis(audioElement, wrappedCallback);
    }
    return false;
  }, [initializeLipSync]);

  const stopLipSync = useCallback(() => {
    if (lipSyncRef.current) {
      lipSyncRef.current.stopAnalysis();
    }
    // Reset visemes to neutral
    currentVisemeRef.current = {
      aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, bmp: 0, amplitude: 0
    };
    //
    // Also explicitly tell the context to reset, ensuring the render loop gets the zero targets
    const { resetVisemes } = useLipSyncContext.getState();
    resetVisemes();
  }, []);

  const getCurrentViseme = useCallback(() => {
    return currentVisemeRef.current;
  }, []);

  const destroyLipSync = useCallback(() => {
    if (lipSyncRef.current) {
      lipSyncRef.current.destroy();
      lipSyncRef.current = null;
    }
  }, []);

  return {
    startLipSync,
    stopLipSync,
    getCurrentViseme,
    destroyLipSync
  };
};
