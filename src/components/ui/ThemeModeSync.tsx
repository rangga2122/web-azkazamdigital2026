"use client";

import { useEffect } from "react";

export type ThemeMode = "dark" | "light";

export const THEME_MODE_EVENT = "azkazam:theme-mode-change";

function normalizeThemeMode(mode: string | null | undefined): ThemeMode {
  return mode === "light" ? "light" : "dark";
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;

  const nextTheme = normalizeThemeMode(mode);
  const root = document.documentElement;
  const body = document.body;

  root.setAttribute("data-site-theme", nextTheme);
  root.style.colorScheme = nextTheme;

  if (body) {
    body.setAttribute("data-site-theme", nextTheme);
    body.style.colorScheme = nextTheme;
  }
}

export function emitThemeModeChange(mode: ThemeMode) {
  applyThemeMode(mode);

  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(THEME_MODE_EVENT, {
      detail: { mode: normalizeThemeMode(mode) },
    })
  );
}

export function ThemeModeSync({
  initialThemeMode,
}: {
  initialThemeMode: ThemeMode;
}) {
  useEffect(() => {
    applyThemeMode(initialThemeMode);

    const handleThemeModeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: string }>;
      applyThemeMode(normalizeThemeMode(customEvent.detail?.mode));
    };

    window.addEventListener(
      THEME_MODE_EVENT,
      handleThemeModeChange as EventListener
    );

    return () => {
      window.removeEventListener(
        THEME_MODE_EVENT,
        handleThemeModeChange as EventListener
      );
    };
  }, [initialThemeMode]);

  return null;
}
