import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Research preferences that outlive a page visit: which of the run's models
 * drives the numbers, and how far ahead to plan. Kept apart from `uiStore`,
 * which holds transient chrome state (drawer open, palette open).
 */

export type ModelId = 'ensemble' | 'structural' | 'lgbm';

type PrefsState = {
  model: ModelId;
  horizon: number;
  /** Opt out of motion beyond what the OS setting already suppresses. */
  reduceMotion: boolean;
  setModel: (model: ModelId) => void;
  setHorizon: (horizon: number) => void;
  setReduceMotion: (value: boolean) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      model: 'ensemble',
      horizon: 5,
      reduceMotion: false,
      setModel: (model) => set({ model }),
      setHorizon: (horizon) => set({ horizon: Math.max(1, Math.min(12, horizon)) }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    { name: 'fpl-prefs' },
  ),
);

export const MODEL_LABELS: Record<ModelId, string> = {
  ensemble: 'Ensemble',
  structural: 'Structural',
  lgbm: 'LightGBM',
};
