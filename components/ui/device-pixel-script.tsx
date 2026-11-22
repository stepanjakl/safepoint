/*
  Sets --dp on <html> to one device pixel before first paint, and again
  whenever the ratio changes (zoom, a move to another display). The media
  queries in app/styles/geometry.css name only the common ratios; every line
  split into whole device pixels reads this one value.
*/
const SOURCE = `
(function () {
  var root = document.documentElement;
  function apply() {
    var ratio = window.devicePixelRatio || 1;
    root.style.setProperty('--dp', 1 / ratio + 'px');
    window
      .matchMedia('(resolution: ' + ratio + 'dppx)')
      .addEventListener('change', apply, { once: true });
  }
  apply();
})();
`.trim();

export function DevicePixelScript() {
  return <script dangerouslySetInnerHTML={{ __html: SOURCE }} />;
}
