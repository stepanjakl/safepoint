/*
  Lightning CSS polyfills light-dark() into a space toggle, because Tailwind v4
  hardcodes its targets at Chrome 111 and reads no browserslist. The result is
  correct but unreadable in DevTools, which is where the themes get tuned:

    --sp-canvas: var(--lightningcss-light, var(--sp-neutral-200))
                 var(--lightningcss-dark, var(--sp-neutral-900));

  This folds it back, so a value read in the browser is a value that can be
  searched for in app/styles/. Development only -- the production build keeps
  the polyfill and the browser support that comes with it.
*/

const LIGHT = '--lightningcss-light';
const DARK = '--lightningcss-dark';

/*
  Read one `var(--name, <fallback>)` starting at `open` (the index of its
  `(`). Returns the fallback and the index just past the closing paren, or
  null if the parens do not balance.
*/
function readVarFallback(value, open) {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') {
      depth--;
      if (depth === 0) {
        const inner = value.slice(open + 1, i);
        const comma = inner.indexOf(',');
        if (comma === -1) return null;
        return { fallback: inner.slice(comma + 1).trim(), end: i + 1 };
      }
    }
  }
  return null;
}

function fold(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf(`var(${LIGHT}`, i);
    if (at === -1) return out + value.slice(i);

    const light = readVarFallback(value, at + 3);
    if (!light) return out + value.slice(i);

    // The dark half follows immediately, separated only by whitespace.
    const rest = value.slice(light.end);
    const gap = rest.length - rest.trimStart().length;
    if (!rest.trimStart().startsWith(`var(${DARK}`))
      return out + value.slice(i);

    const darkOpen = light.end + gap + 3;
    const dark = readVarFallback(value, darkOpen);
    if (!dark) return out + value.slice(i);

    out += value.slice(i, at);
    out += `light-dark(${fold(light.fallback)}, ${fold(dark.fallback)})`;
    i = dark.end;
  }
  return out;
}

const plugin = () => ({
  postcssPlugin: 'safepoint-light-dark',
  Declaration(decl) {
    if (!decl.value.includes(LIGHT)) return;
    const folded = fold(decl.value);
    if (folded !== decl.value) decl.value = folded;
  },
});

plugin.postcss = true;

module.exports = plugin;
