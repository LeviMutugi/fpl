import { createContext, useContext, type ReactNode } from 'react';
import { useThemeController, type ThemeController } from '@/lib/theme';

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const controller = useThemeController();
  return <ThemeContext.Provider value={controller}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeController {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}
