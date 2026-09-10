/** Scale browser animations without rewriting the application's timing rules. */
export function startMotionDebug(speed: number) {
  if (speed === 1) return () => {};

  const originalRates = new WeakMap<Animation, number>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  function restore() {
    for (const animation of document.getAnimations()) {
      const original = originalRates.get(animation);
      if (original !== undefined) {
        // Restore synchronously so a new speed effect cannot read a stale
        // playbackRate while an asynchronous update is still pending.
        animation.playbackRate = original;
        originalRates.delete(animation);
      }
    }
  }

  function scan() {
    // New hover transitions and portalled overlays appear after mount. Scan
    // only in slow mode; normal mode has no animation-frame loop.
    for (const animation of document.getAnimations()) {
      const target =
        animation.effect instanceof KeyframeEffect
          ? animation.effect.target
          : null;
      if (target instanceof Element && target.closest('.sp-devctl')) continue;
      if (originalRates.has(animation)) continue;
      originalRates.set(animation, animation.playbackRate);
      animation.updatePlaybackRate(animation.playbackRate * speed);
    }
    frame = requestAnimationFrame(scan);
  }

  function syncPreference() {
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) restore();
    else scan();
  }

  syncPreference();
  reducedMotion.addEventListener('change', syncPreference);
  return () => {
    cancelAnimationFrame(frame);
    reducedMotion.removeEventListener('change', syncPreference);
    restore();
  };
}
