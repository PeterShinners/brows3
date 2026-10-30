'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { configureThumbrella } from '@/lib/thumbrella';
import { useSettingsStore } from '@/store/settingsStore';

export type ThumbrellaStatus = 'disabled' | 'connecting' | 'ready' | 'error';

interface ThumbrellaState {
  status: ThumbrellaStatus;
  error: string;
  setResult: (status: ThumbrellaStatus, error?: string) => void;
}

export const useThumbrellaStore = create<ThumbrellaState>((set) => ({
  status: 'disabled',
  error: '',
  setResult: (status, error = '') => set({ status, error }),
}));

/** Connects Thumbrella whenever the configured connect string changes. */
export function useThumbrellaConnection() {
  const connect = useSettingsStore((state) => state.thumbrellaConnect);
  const setResult = useThumbrellaStore((state) => state.setResult);

  useEffect(() => {
    if (!connect) {
      setResult('disabled');
      return;
    }

    let cancelled = false;
    setResult('connecting');
    configureThumbrella(connect).then(
      () => { if (!cancelled) setResult('ready'); },
      (error: unknown) => {
        if (!cancelled) setResult('error', error instanceof Error ? error.message : String(error));
      }
    );

    return () => { cancelled = true; };
  }, [connect, setResult]);
}

/** True once the configured Thumbrella server has accepted the connect string. */
export function useThumbnailsEnabled(): boolean {
  return useThumbrellaStore((state) => state.status === 'ready');
}
