import { Pane } from 'tweakpane';
import {
  DEFAULT_TYPEFACE_SET,
  DEFAULT_TYPESCALE,
  TYPEFACE_SETS,
  TYPEFACE_SET_LABELS,
  MONO_CHOICES,
  MONO_CHOICE_LABELS,
  TYPESCALES,
  TYPESCALE_LABELS,
  THEME_CHOICES,
} from '@/lib/typography';
import {
  readTypeface,
  readMono,
  readTypescale,
  readTheme,
  readMotionSpeed,
  readRailGuides,
  setRailGuides,
  setTypeface,
  setMono,
  setTypescale,
  setTheme,
  setMotionSpeed,
  DEFAULT_MOTION_SPEED,
  MOTION_SPEEDS,
  subscribe,
} from './design-preferences';
import { startMotionDebug } from './motion-debug';

function readPreferences() {
  return {
    typeface: readTypeface(),
    mono: readMono(),
    typescale: readTypescale(),
    theme: readTheme(),
    speed: readMotionSpeed(),
    railGuides: readRailGuides(),
  };
}

export function mountDesignPane(host: HTMLElement) {
  const model = readPreferences();
  const pane = new Pane({
    container: host,
    title: 'Design controls',
    expanded: true,
  });
  const appearance = pane.addFolder({ title: 'Appearance' });
  const bindings = [
    appearance
      .addBinding(model, 'theme', {
        label: 'Theme',
        options: THEME_CHOICES.map((value) => ({ text: value, value })),
      })
      .on('change', (event) => setTheme(event.value)),
    appearance
      .addBinding(model, 'typeface', {
        label: 'Typeface',
        options: TYPEFACE_SETS.map((value) => ({
          text: TYPEFACE_SET_LABELS[value],
          value,
        })),
      })
      .on('change', (event) => setTypeface(event.value)),
    appearance
      .addBinding(model, 'mono', {
        label: 'Utility font',
        options: MONO_CHOICES.map((value) => ({
          text: MONO_CHOICE_LABELS[value],
          value,
        })),
      })
      .on('change', (event) => setMono(event.value)),
    appearance
      .addBinding(model, 'typescale', {
        label: 'Type scale',
        options: TYPESCALES.map((value) => ({
          text: `${value}: ${TYPESCALE_LABELS[value]}`,
          value,
        })),
      })
      .on('change', (event) => setTypescale(event.value)),
  ];
  const motion = pane.addFolder({ title: 'Motion' });
  const speedBinding = motion
    .addBinding(model, 'speed', {
      label: 'Playback',
      options: MOTION_SPEEDS.map((value) => ({
        text: value === '1' ? 'Normal' : `${1 / Number(value)}× slower`,
        value,
      })),
    })
    .on('change', (event) => setMotionSpeed(event.value));
  speedBinding.element.title =
    'CSS transitions and animations; respects reduced motion. Timers keep normal speed.';

  const debug = pane.addFolder({ title: 'Debug' });
  const railBinding = debug
    .addBinding(model, 'railGuides', { label: 'Icon axis' })
    .on('change', (event) => setRailGuides(event.value));
  railBinding.element.title =
    'Draws the sidebar icon axis and a crosshair through each icon centred on it.';
  railBinding.element
    .querySelector('input')
    ?.setAttribute('aria-label', 'Icon axis guides');

  // Bindings use native selects. Name them explicitly for screen readers.
  for (const binding of [...bindings, speedBinding]) {
    binding.element
      .querySelector('select')
      ?.setAttribute('aria-label', binding.label ?? 'Design preference');
  }

  pane.addButton({ title: 'Reset defaults' }).on('click', () => {
    setTypeface(DEFAULT_TYPEFACE_SET);
    setMono('match');
    setTypescale(DEFAULT_TYPESCALE);
    setTheme('system');
    setMotionSpeed(DEFAULT_MOTION_SPEED);
    setRailGuides(false);
  });

  let activeSpeed = model.speed;
  let stopMotion = startMotionDebug(Number(activeSpeed));
  function sync() {
    Object.assign(model, readPreferences());
    if (model.speed !== activeSpeed) {
      stopMotion();
      activeSpeed = model.speed;
      stopMotion = startMotionDebug(Number(activeSpeed));
    }
    pane.title =
      model.speed === '1'
        ? 'Design controls'
        : `Design controls · ${1 / Number(model.speed)}× slower`;
    pane.refresh();
  }
  sync();
  const unsubscribe = subscribe(sync);
  const toggle = pane.element.querySelector('button');
  function syncExpanded() {
    for (const folder of [pane, appearance, motion, debug]) {
      folder.element
        .querySelector('button')
        ?.setAttribute('aria-expanded', String(folder.expanded));
      // Remove folded controls from navigation immediately, even while the
      // library is still animating its height.
      for (const child of folder.children)
        child.element.inert = !folder.expanded;
    }
  }
  for (const folder of [pane, appearance, motion, debug])
    folder.on('fold', syncExpanded);
  syncExpanded();
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !pane.expanded) return;
    event.stopPropagation();
    toggle?.focus();
    pane.expanded = false;
  }
  host.addEventListener('keydown', onKeyDown);
  return () => {
    unsubscribe();
    stopMotion();
    host.removeEventListener('keydown', onKeyDown);
    pane.dispose();
  };
}
