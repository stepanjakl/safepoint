'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { startMotionDebug } from './motion-debug';

import {
  readMotionSpeed,
  serverMotionSpeed,
  setMotionSpeed,
  MOTION_SPEEDS,
  readMono,
  readTheme,
  readTypeface,
  serverMono,
  serverTheme,
  serverTypeface,
  setMono,
  setTheme,
  setTypeface,
  subscribe,
} from './design-preferences';
import {
  MONO_CHOICE_LABELS,
  MONO_CHOICES,
  THEME_CHOICES,
  TYPEFACE_SET_LABELS,
  TYPEFACE_SETS,
} from '@/lib/typography';

/**
 * Development-only picker for the provisional parts of the visual language:
 * typeface set, utility family, and theme. Each is already driven by an
 * attribute, so this only writes to <html>.
 *
 * Next's own dev indicator has no extension point -- `DevToolsConfig` is a
 * closed schema and its panels are internal components -- so this is a separate
 * control, parked opposite Next's default bottom-left position.
 *
 * Deliberately styled with fixed values rather than the app's own tokens: it
 * has to stay legible while the tokens it edits change underneath it.
 */
export function DesignControls() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const motionSpeed = useSyncExternalStore(
    subscribe,
    readMotionSpeed,
    serverMotionSpeed,
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    return startMotionDebug(Number(motionSpeed));
  }, [motionSpeed]);
  const typeface = useSyncExternalStore(
    subscribe,
    readTypeface,
    serverTypeface,
  );
  const mono = useSyncExternalStore(subscribe, readMono, serverMono);
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div
      className="sp-devctl"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <style>{PANEL_CSS}</style>
      <button
        type="button"
        ref={toggleRef}
        className="sp-devctl-toggle"
        aria-label="Design and motion controls"
        aria-expanded={open}
        aria-controls="sp-devctl-panel"
        title="Design controls"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {motionSpeed === '1' ? 'Aa' : `${1 / Number(motionSpeed)}×`}
      </button>

      <div id="sp-devctl-panel" className="sp-devctl-panel" hidden={!open}>
        <fieldset>
          <legend>Motion speed</legend>
          {MOTION_SPEEDS.map((speed) => (
            <label key={speed}>
              <input
                type="radio"
                name="sp-devctl-motion"
                checked={motionSpeed === speed}
                onChange={() => setMotionSpeed(speed)}
              />
              <span>
                {speed === '1' ? 'Normal' : `${1 / Number(speed)}× slower`}
              </span>
            </label>
          ))}
          <p className="sp-devctl-note">
            CSS transitions and animations. Respects reduced motion; timers keep
            normal speed.
          </p>
        </fieldset>
        <fieldset>
          <legend>Typeface</legend>
          {TYPEFACE_SETS.map((set) => (
            <label key={set}>
              <input
                type="radio"
                name="sp-devctl-typeface"
                value={set}
                checked={typeface === set}
                onChange={() => setTypeface(set)}
              />
              <span>
                {set}
                <small>{TYPEFACE_SET_LABELS[set]}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Utility role</legend>
          {MONO_CHOICES.map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="sp-devctl-mono"
                value={choice}
                checked={mono === choice}
                onChange={() => setMono(choice)}
              />
              <span>
                {choice}
                <small>{MONO_CHOICE_LABELS[choice]}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Theme</legend>
          {THEME_CHOICES.map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="sp-devctl-theme"
                value={choice}
                checked={theme === choice}
                onChange={() => setTheme(choice)}
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

const PANEL_CSS = `
.sp-devctl {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: #ededed;
}
.sp-devctl-toggle {
  width: 36px;
  height: 36px;
  border: 1px solid #333;
  border-radius: 9999px;
  background: #0a0a0a;
  color: #ededed;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sp-devctl-toggle:hover { background: #1a1a1a; }
.sp-devctl-panel {
  width: 232px;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #333;
  border-radius: 10px;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sp-devctl-panel[hidden] { display: none; }
.sp-devctl-note { font-size: 11px; line-height: 1.5; color: #aaa; margin-top: 6px; }
.sp-devctl fieldset { border: 0; margin: 0; padding: 0; }
.sp-devctl legend {
  padding: 0 0 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8f8f8f;
}
.sp-devctl label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  cursor: pointer;
}
.sp-devctl label span { display: flex; flex-direction: column; }
.sp-devctl label small {
  color: #8f8f8f;
  font-size: 10px;
}
.sp-devctl input[type='radio'] { margin: 2px 0 0; accent-color: #ededed; }
.sp-devctl :focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
`;
