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
  DEFAULT_THEME,
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
  CONTROL_NEUTRAL_CHOICES,
  DEFAULT_NEUTRAL,
  NEUTRAL_PALETTES,
  readControlNeutral,
  readNeutral,
  setControlNeutral,
  setNeutral,
  DEFAULT_TILE_PALETTE,
  TILE_PALETTES,
  TILE_PALETTE_LABELS,
  readTilePalette,
  setTilePalette,
  DEFAULT_TILE_CHROMA_SCALE,
  TILE_CHROMA_SCALE_MAX,
  TILE_CHROMA_SCALE_MIN,
  readTileChromaScale,
  setTileChromaScale,
  DEFAULT_CORNER_BALANCE,
  readCornerBalance,
  setCornerBalance,
  DEFAULT_SLANT_RADIUS,
  SLANT_RADIUS_MAX,
  SLANT_RADIUS_MIN,
  readSlantRadius,
  setSlantRadius,
} from './design-preferences';
import { startMotionDebug } from './motion-debug';

function readPreferences() {
  return {
    typeface: readTypeface(),
    mono: readMono(),
    typescale: readTypescale(),
    theme: readTheme(),
    neutral: readNeutral(),
    controlNeutral: readControlNeutral(),
    tilePalette: readTilePalette(),
    tileChromaScale: readTileChromaScale(),
    slantRadius: readSlantRadius(),
    cornerBalance: readCornerBalance(),
    speed: readMotionSpeed(),
    railGuides: readRailGuides(),
  };
}

export function mountDesignPane(host: HTMLElement) {
  const model = readPreferences();
  const pane = new Pane({
    container: host,
    title: 'Design controls',
    expanded: false,
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
      .addBinding(model, 'neutral', {
        label: 'Neutrals',
        options: NEUTRAL_PALETTES.map((value) => ({ text: value, value })),
      })
      .on('change', (event) => setNeutral(event.value)),
    appearance
      .addBinding(model, 'controlNeutral', {
        label: 'Control neutrals',
        options: CONTROL_NEUTRAL_CHOICES.map((value) => ({
          text: value === 'match' ? 'Match neutrals' : value,
          value,
        })),
      })
      .on('change', (event) => setControlNeutral(event.value)),
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
  const radiusBinding = appearance
    .addBinding(model, 'slantRadius', {
      label: 'Corner radius',
      min: SLANT_RADIUS_MIN,
      max: SLANT_RADIUS_MAX,
      step: 0.5,
    })
    .on('change', (event) => setSlantRadius(event.value));
  radiusBinding.element.title =
    'The radius a slanted control’s corners start from, in px. Corner balance then scales each corner by its angle, and the notch’s foot follows.';
  for (const input of radiusBinding.element.querySelectorAll('input')) {
    input.setAttribute('aria-label', 'Slanted corner radius');
  }
  const cornerBinding = appearance
    .addBinding(model, 'cornerBalance', {
      label: 'Corner balance',
      min: 0,
      max: 1,
      step: 0.05,
    })
    .on('change', (event) => setCornerBalance(event.value));
  cornerBinding.element.title =
    'How far a slanted corner’s radius follows its angle. 0 is one radius everywhere; 1 gives every corner the same bite out of its edges.';
  for (const input of cornerBinding.element.querySelectorAll('input')) {
    input.setAttribute('aria-label', 'Slanted corner balance');
  }

  // The workspace menu's tiles: which palette they read, and how hard the
  // saturation ceilings in tokens.css hold it back.
  const tiles = pane.addFolder({ title: 'Menu tiles' });
  const paletteBinding = tiles
    .addBinding(model, 'tilePalette', {
      label: 'Palette',
      options: TILE_PALETTES.map((value) => ({
        text: TILE_PALETTE_LABELS[value],
        value,
      })),
    })
    .on('change', (event) => setTilePalette(event.value));
  const chromaBinding = tiles
    .addBinding(model, 'tileChromaScale', {
      label: 'Saturation cap',
      min: TILE_CHROMA_SCALE_MIN,
      max: TILE_CHROMA_SCALE_MAX,
      step: 0.05,
    })
    .on('change', (event) => setTileChromaScale(event.value));
  chromaBinding.element.title =
    '1 is the ceilings in tokens.css. Lower mutes every tile, at rest and under the pointer; the far right leaves them uncapped.';
  for (const input of chromaBinding.element.querySelectorAll('input')) {
    input.setAttribute('aria-label', 'Tile saturation cap');
  }

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
  for (const binding of [...bindings, paletteBinding, speedBinding]) {
    binding.element
      .querySelector('select')
      ?.setAttribute('aria-label', binding.label ?? 'Design preference');
  }

  pane.addButton({ title: 'Reset defaults' }).on('click', () => {
    setTypeface(DEFAULT_TYPEFACE_SET);
    setMono('match');
    setTypescale(DEFAULT_TYPESCALE);
    setTheme(DEFAULT_THEME);
    setNeutral(DEFAULT_NEUTRAL);
    setControlNeutral('match');
    setTilePalette(DEFAULT_TILE_PALETTE);
    setTileChromaScale(DEFAULT_TILE_CHROMA_SCALE);
    setSlantRadius(DEFAULT_SLANT_RADIUS);
    setCornerBalance(DEFAULT_CORNER_BALANCE);
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
  const folders = [pane, appearance, tiles, motion, debug];
  function syncExpanded() {
    for (const folder of folders) {
      folder.element
        .querySelector('button')
        ?.setAttribute('aria-expanded', String(folder.expanded));
      // Remove folded controls from navigation immediately, even while the
      // library is still animating its height.
      for (const child of folder.children)
        child.element.inert = !folder.expanded;
    }
  }
  for (const folder of folders) folder.on('fold', syncExpanded);
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
