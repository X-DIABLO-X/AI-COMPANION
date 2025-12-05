import { create } from "zustand";

export const useLipSyncContext = create((set, get) => ({
  currentViseme: {
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    bmp: 0,
    amplitude: 0
  },
  isLipSyncActive: false,
  
  setViseme: (viseme) => set({ currentViseme: viseme }),
  setLipSyncActive: (active) => set({ isLipSyncActive: active }),
  
  resetVisemes: () => set({
    currentViseme: {
      aa: 0,
      ih: 0,
      ou: 0,
      ee: 0,
      oh: 0,
      bmp: 0,
      amplitude: 0
    },
    isLipSyncActive: false
  })
}));
