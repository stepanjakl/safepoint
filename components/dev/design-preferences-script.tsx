import {
  COLOUR_SYSTEMS,
  COLOUR_SYSTEM_STORAGE_KEY,
  CORNER_BALANCE_STORAGE_KEY,
  CUSTOM_NEUTRALS,
  CUSTOM_NEUTRAL_STORAGE_KEY,
  DEFAULT_COLOUR_SYSTEM,
  DEFAULT_CUSTOM_NEUTRAL,
  DEFAULT_CORNER_BALANCE,
  DEFAULT_EDGE_TREATMENT,
  DEFAULT_MOTION_SPEED,
  DEFAULT_TILE_CHROMA_SCALE,
  MOTION_SPEEDS,
  MOTION_STORAGE_KEY,
  NEUTRAL_PALETTES,
  NEUTRAL_STORAGE_KEY,
  RAIL_GUIDES_STORAGE_KEY,
  DEFAULT_SLANT_RADIUS,
  EDGE_TREATMENTS,
  EDGE_TREATMENT_STORAGE_KEY,
  SLANT_RADIUS_MAX,
  SLANT_RADIUS_MIN,
  SLANT_RADIUS_STORAGE_KEY,
  TILE_CHROMA_SCALE_MAX,
  TILE_CHROMA_SCALE_MIN,
  TILE_CHROMA_SCALE_STORAGE_KEY,
  STATE_PALETTES,
  STATE_PALETTE_STORAGE_KEY,
  TILE_PALETTE_STORAGE_KEY,
  TILE_PALETTES,
} from './design-preferences';
import {
  MONO_CHOICES,
  TYPESCALES,
  TYPESCALE_STORAGE_KEY,
  MONO_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TYPEFACE_PICKER_SETS,
  TYPEFACE_STORAGE_KEY,
} from '@/lib/typography';

/*
  Applies the stored development preferences to <html> before first paint, so
  a chosen typeface or theme does not flash the default first. Server-rendered
  and synchronous by design; it must run ahead of hydration.

  Keep <html suppressHydrationWarning> in the layout: this deliberately edits
  attributes React rendered, which is a mismatch React would otherwise report.
*/
export function DesignPreferencesScript() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const source = `
var root = document.documentElement;
var params = new URLSearchParams(location.search);
var colourSystems = ${JSON.stringify(COLOUR_SYSTEMS)};
var colourSystem = params.get('colours');
if (colourSystems.indexOf(colourSystem) === -1) {
  try {
    colourSystem = localStorage.getItem(${JSON.stringify(COLOUR_SYSTEM_STORAGE_KEY)});
  } catch (error) {
    colourSystem = null;
  }
}
if (colourSystem && colourSystem !== ${JSON.stringify(DEFAULT_COLOUR_SYSTEM)}
    && colourSystems.indexOf(colourSystem) !== -1) {
  root.dataset.colourSystem = colourSystem;
} else {
  delete root.dataset.colourSystem;
}
var customNeutrals = ${JSON.stringify(CUSTOM_NEUTRALS)};
var customNeutral = params.get('customNeutral');
if (customNeutrals.indexOf(customNeutral) === -1) {
  try {
    customNeutral = localStorage.getItem(${JSON.stringify(CUSTOM_NEUTRAL_STORAGE_KEY)});
  } catch (error) {
    customNeutral = null;
  }
}
if (customNeutral && customNeutral !== ${JSON.stringify(DEFAULT_CUSTOM_NEUTRAL)}
    && customNeutrals.indexOf(customNeutral) !== -1) {
  root.dataset.customNeutral = customNeutral;
} else {
  delete root.dataset.customNeutral;
}
var edgeTreatments = ${JSON.stringify(EDGE_TREATMENTS)};
var edgeTreatment = params.get('edges');
if (edgeTreatments.indexOf(edgeTreatment) === -1) {
  try {
    edgeTreatment = localStorage.getItem(${JSON.stringify(EDGE_TREATMENT_STORAGE_KEY)});
  } catch (error) {
    edgeTreatment = null;
  }
}
if (edgeTreatment === 'opaque') {
  root.dataset.edgeTreatment = 'opaque';
} else if (edgeTreatment === ${JSON.stringify(DEFAULT_EDGE_TREATMENT)}) {
  delete root.dataset.edgeTreatment;
}
try {
  var sets = ${JSON.stringify([...TYPEFACE_PICKER_SETS])};
  var monos = ${JSON.stringify(MONO_CHOICES.filter((choice) => choice !== 'match'))};
  var typeface = params.get('font')
    || localStorage.getItem(${JSON.stringify(TYPEFACE_STORAGE_KEY)});
  if (sets.indexOf(typeface) !== -1) {
    root.dataset.typeface = typeface;
  }
  var mono = params.get('mono')
    || localStorage.getItem(${JSON.stringify(MONO_STORAGE_KEY)});
  if (monos.indexOf(mono) !== -1) {
    root.dataset.mono = mono;
  }
  var motionSpeeds = ${JSON.stringify(MOTION_SPEEDS)};
  var motionSpeed = localStorage.getItem(${JSON.stringify(MOTION_STORAGE_KEY)});
  root.dataset.motionSpeed = motionSpeeds.indexOf(motionSpeed) !== -1
    ? motionSpeed : ${JSON.stringify(DEFAULT_MOTION_SPEED)};
  var scales = ${JSON.stringify([...TYPESCALES])};
  var scale = params.get('scale')
    || localStorage.getItem(${JSON.stringify(TYPESCALE_STORAGE_KEY)});
  if (scales.indexOf(scale) !== -1) {
    root.dataset.typescale = scale;
  }
  var palettes = ${JSON.stringify(NEUTRAL_PALETTES)};
  var neutral = params.get('neutral')
    || localStorage.getItem(${JSON.stringify(NEUTRAL_STORAGE_KEY)});
  if (palettes.indexOf(neutral) !== -1) {
    root.dataset.neutral = neutral;
  }
  var tilePalette = params.get('tiles')
    || localStorage.getItem(${JSON.stringify(TILE_PALETTE_STORAGE_KEY)});
  var statePalette = params.get('states')
    || localStorage.getItem(${JSON.stringify(STATE_PALETTE_STORAGE_KEY)});
  if (${JSON.stringify(STATE_PALETTES)}.indexOf(statePalette) !== -1) {
    root.dataset.statePalette = statePalette;
  }
  // The layout renders the default; a stored or linked choice replaces it.
  if (${JSON.stringify(TILE_PALETTES)}.indexOf(tilePalette) !== -1) {
    root.dataset.tilePalette = tilePalette;
  }
  // Number(null) is 0, so an unset key falls outside the range and is skipped.
  var chromaScale = Number(
    localStorage.getItem(${JSON.stringify(TILE_CHROMA_SCALE_STORAGE_KEY)})
  );
  if (
    chromaScale >= ${TILE_CHROMA_SCALE_MIN} &&
    chromaScale <= ${TILE_CHROMA_SCALE_MAX} &&
    chromaScale !== ${DEFAULT_TILE_CHROMA_SCALE}
  ) {
    root.style.setProperty('--tile-chroma-scale', String(chromaScale));
  }
  // An unset key is null, which the range check below would read as 0.
  var balanceValue = localStorage.getItem(${JSON.stringify(CORNER_BALANCE_STORAGE_KEY)});
  var balance = balanceValue === null ? NaN : Number(balanceValue);
  if (balance >= 0 && balance <= 1 && balance !== ${DEFAULT_CORNER_BALANCE}) {
    root.style.setProperty('--slant-corner-balance', String(balance));
  }
  var radiusValue = localStorage.getItem(${JSON.stringify(SLANT_RADIUS_STORAGE_KEY)});
  var radius = radiusValue === null ? NaN : Number(radiusValue);
  if (
    radius >= ${SLANT_RADIUS_MIN} &&
    radius <= ${SLANT_RADIUS_MAX} &&
    radius !== ${DEFAULT_SLANT_RADIUS}
  ) {
    root.style.setProperty('--slant-radius', radius + 'px');
  }
  if (localStorage.getItem(${JSON.stringify(RAIL_GUIDES_STORAGE_KEY)}) === 'on') {
    root.dataset.railGuides = 'on';
  }
  var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  // The layout renders the default theme; 'system' is the absence of one.
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
  } else if (theme === 'system') {
    delete root.dataset.theme;
  }
} catch (error) {
  // No stored preference is readable; the token defaults stand.
}
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
