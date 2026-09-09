"use client";

import Link from "./Link";
import { useEffect, useState } from "react";

type Preferences = {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
};

const defaultPreferences: Preferences = {
  largeText: false,
  highContrast: false,
  reducedMotion: false,
};

const storageKey = "bravo-accessibility-preferences";

export default function AccessibilityTools() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const restorePreferences = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setPreferences({ ...defaultPreferences, ...JSON.parse(saved) });
      } catch {
        // The controls still work when browser storage is unavailable.
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(restorePreferences);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.toggle("access-large-text", preferences.largeText);
    root.classList.toggle("access-high-contrast", preferences.highContrast);
    root.classList.toggle("access-reduced-motion", preferences.reducedMotion);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // Preferences remain active for the current page visit.
    }
  }, [preferences, ready]);

  function toggle(key: keyof Preferences, label: string) {
    setPreferences((current) => {
      const enabled = !current[key];
      setAnnouncement(`${label} ${enabled ? "enabled" : "disabled"}.`);
      return { ...current, [key]: enabled };
    });
  }

  return (
    <aside className="accessibility-tools" aria-label="Accessibility options">
      <button className="accessibility-trigger" type="button" aria-expanded={open} aria-controls="accessibility-panel" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">Aa</span> Accessibility
      </button>
      <div className="accessibility-panel" id="accessibility-panel" hidden={!open}>
        <strong>Make this site easier to use</strong>
        <button type="button" aria-pressed={preferences.largeText} onClick={() => toggle("largeText", "Larger text")}>Larger text <span>{preferences.largeText ? "On" : "Off"}</span></button>
        <button type="button" aria-pressed={preferences.highContrast} onClick={() => toggle("highContrast", "High contrast")}>High contrast <span>{preferences.highContrast ? "On" : "Off"}</span></button>
        <button type="button" aria-pressed={preferences.reducedMotion} onClick={() => toggle("reducedMotion", "Reduced motion")}>Reduce motion <span>{preferences.reducedMotion ? "On" : "Off"}</span></button>
        <Link href="/learn#accessible-media">Captions & transcripts</Link>
        <small>These settings stay on this device.</small>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </aside>
  );
}
