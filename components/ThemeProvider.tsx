'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'calculator-max-theme';
const USER_SET_KEY = 'calculator-max-user-theme-set';

function applyThemeToDom(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
  if (document.body) {
    document.body.dataset.theme = mode;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyThemeToDom(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(USER_SET_KEY, 'true');
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      window.dispatchEvent(new CustomEvent('calcmax:theme-changed', { detail: { theme: next } }));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    let resolved: ThemeMode = 'light';
    try {
      const userSet = localStorage.getItem(USER_SET_KEY) === 'true';
      const saved = localStorage.getItem(STORAGE_KEY);
      if (userSet && (saved === 'light' || saved === 'dark')) {
        resolved = saved;
      } else {
        localStorage.setItem(STORAGE_KEY, 'light');
      }
    } catch {
      resolved = 'light';
    }
    setThemeState(resolved);
    applyThemeToDom(resolved);

    const handleCustomTheme = (e: Event) => {
      const next = (e as CustomEvent)?.detail?.theme;
      if (next === 'light' || next === 'dark') {
        try {
          localStorage.setItem(USER_SET_KEY, 'true');
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore storage errors
        }
        setThemeState(next);
        applyThemeToDom(next);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyThemeToDom(e.newValue);
      }
    };

    window.addEventListener('calcmax:theme-changed', handleCustomTheme);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('calcmax:theme-changed', handleCustomTheme);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
