import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const THEME_KEY = "library.theme.preference";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function storage(): Storage | null {
  const candidate = typeof window !== "undefined" ? window.localStorage : null;
  return candidate && typeof candidate.getItem === "function" ? candidate : null;
}

function getPreference(key: string): string | null {
  return storage()?.getItem(key) ?? null;
}

function setPreference(key: string, value: string): void {
  storage()?.setItem(key, value);
}

function readThemePreference(): Theme {
  const value = getPreference(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" 
    ? value as Theme 
    : "system";
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(resolveTheme(theme));

  useEffect(() => {
    setPreference(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const updateResolvedTheme = () => {
      setResolvedTheme(resolveTheme(theme));
    };

    updateResolvedTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => updateResolvedTheme();
      
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return context;
}
