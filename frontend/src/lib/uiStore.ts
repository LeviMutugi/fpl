import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToastTone = 'neutral' | 'good' | 'warning' | 'critical';

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  /** ms; `0` keeps it until dismissed. */
  duration: number;
};

type UiState = {
  /** Sidebar collapsed to icon rail (desktop). Persisted. */
  sidebarCollapsed: boolean;
  /** Mobile drawer open. Not persisted. */
  drawerOpen: boolean;
  /** Cmd+K palette. Not persisted. */
  paletteOpen: boolean;
  /** Dense table mode. Persisted. */
  dense: boolean;
  toasts: Toast[];

  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setDrawerOpen: (value: boolean) => void;
  setPaletteOpen: (value: boolean) => void;
  togglePalette: () => void;
  setDense: (value: boolean) => void;

  pushToast: (toast: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => string;
  dismissToast: (id: string) => void;
};

let toastSeq = 0;

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      drawerOpen: false,
      paletteOpen: false,
      dense: false,
      toasts: [],

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setDrawerOpen: (value) => set({ drawerOpen: value }),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
      setDense: (value) => set({ dense: value }),

      pushToast: (toast) => {
        const id = `t${++toastSeq}`;
        const next: Toast = {
          id,
          title: toast.title,
          tone: toast.tone ?? 'neutral',
          duration: toast.duration ?? 4500,
          ...(toast.description === undefined ? {} : { description: toast.description }),
        };
        set({ toasts: [...get().toasts, next] });
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'fpl.ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, dense: state.dense }),
    },
  ),
);
