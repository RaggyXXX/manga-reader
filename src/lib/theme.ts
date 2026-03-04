export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "manga-theme";

export function resolveInitialTheme(saved: ThemeMode | null, prefersDark: boolean): "light" | "dark" {
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return prefersDark ? "dark" : "light";
}

export function applyThemeClass(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

