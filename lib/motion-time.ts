/*
  A duration that paces motion, at the speed motion is playing. The design
  pane can slow every animation (data-motion-speed on <html>, development
  only); timers that sequence those animations -- when a stage moves on, when
  a count ticks, how long to wait for a mark -- must slow with them, or they
  run ahead of what is on screen. Without the attribute it is 1, so in
  production a duration is itself.
*/
export function motionTime(ms: number) {
  if (typeof document === 'undefined') return ms;
  const speed = Number(document.documentElement.dataset.motionSpeed);
  return speed > 0 ? ms / speed : ms;
}
