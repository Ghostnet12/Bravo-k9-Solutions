"use client";

import Link from "./Link";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent) {
      if (!toolsRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [open]);

  function closePanel(returnFocus = false) {
    setOpen(false);
    if (returnFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function toggle(key: keyof Preferences, label: string) {
    setPreferences((current) => {
      const enabled = !current[key];
      setAnnouncement(`${label} ${enabled ? "enabled" : "disabled"}.`);
      return { ...current, [key]: enabled };
    });
  }

  return (
    <aside ref={toolsRef} className="accessibility-tools" aria-label="Accessibility options" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        closePanel(true);
      }
    }}>
      <button ref={triggerRef} className="accessibility-trigger" type="button" aria-expanded={open} aria-controls="accessibility-panel" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">Aa</span> Accessibility
      </button>
      <div ref={panelRef} className="accessibility-panel" id="accessibility-panel" role="region" aria-labelledby="accessibility-panel-title" hidden={!open}>
        <div className="accessibility-panel-heading">
          <strong id="accessibility-panel-title">Make this site easier to use</strong>
          <button className="accessibility-panel-close" type="button" aria-label="Close accessibility options" onClick={() => closePanel(true)}>Close</button>
        </div>
        <button type="button" aria-pressed={preferences.largeText} onClick={() => toggle("largeText", "Larger text")}>Larger text <span>{preferences.largeText ? "On" : "Off"}</span></button>
        <button type="button" aria-pressed={preferences.highContrast} onClick={() => toggle("highContrast", "High contrast")}>High contrast <span>{preferences.highContrast ? "On" : "Off"}</span></button>
        <button type="button" aria-pressed={preferences.reducedMotion} onClick={() => toggle("reducedMotion", "Reduced motion")}>Reduce motion <span>{preferences.reducedMotion ? "On" : "Off"}</span></button>
        <Link href="/accessibility">Accessibility statement</Link>
        <Link href="/learn#accessible-media">Captions & transcripts</Link>
        <small>These settings stay on this device.</small>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </aside>
  );
}
