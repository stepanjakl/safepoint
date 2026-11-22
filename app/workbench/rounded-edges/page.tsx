/*
  Four ways to draw a rounded control's 0.75px ring and its sheen, on the
  app's own widths and colours, side by side. Open it in Chrome and in Safari;
  `pnpm check:lines -- --route /workbench/rounded-edges --browser
  chromium,safari --loupe` measures every specimen and writes each one
  enlarged, the browsers side by side. See docs/interface/LINE-TESTING.md.
*/

const OPTIONS = [
  {
    id: 'native',
    title: 'Before: fractional shadows',
    note: 'As the app drew rings until now. Chrome antialiases the half pixel; Safari rounds each side on its own, so a ring is one device pixel on two sides and two on the others.',
  },
  {
    id: 'layered',
    title: 'Layered shadows (current)',
    note: 'Each edge a solid layer and a soft one, in whole device pixels. Even in every browser; inside a radius Safari softens the inner edge by about four levels.',
  },
  {
    id: 'border',
    title: '0.5px border ring',
    note: 'The ring as a border, which no browser softens, with the sheen inside it. Exact, but the ring is one device pixel rather than one and a half.',
  },
  {
    id: 'hybrid',
    title: 'Border and soft shadow',
    note: 'The ring’s solid pixel as a border, only its soft pixel and the sheen as shadows. The ring’s weight as layered, the solid pixel exact.',
  },
] as const;

const SHAPES = [
  { id: 'button', sheen: 'hairline', sides: 'all' },
  { id: 'icon', sheen: 'hairline', sides: 'all' },
  { id: 'pill', sheen: 'hairline', sides: 'horizontal' },
  { id: 'card', sheen: 'pane', sides: 'all' },
  { id: 'pane', sheen: 'pane', sides: 'all' },
] as const;

export default function RoundedEdgesPage() {
  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-8 p-6"
    >
      <header className="grid max-w-3xl gap-1">
        <h1 className="text-display font-semibold">Rounded edges</h1>
        <p className="text-meta text-muted">
          A rounded control&rsquo;s ring and sheen, drawn four ways at the
          app&rsquo;s widths. The differences are a device pixel or a few levels
          of grey: compare this page in Chrome and in Safari, or run the line
          checker with <code>--loupe</code> to see them enlarged.
        </p>
      </header>
      {OPTIONS.map((option) => (
        <section
          key={option.id}
          className="rounded-edges-row"
          aria-labelledby={`option-${option.id}`}
        >
          <div className="grid gap-1">
            <h2 id={`option-${option.id}`} className="font-medium">
              {option.title}
            </h2>
            <p className="text-meta text-muted">{option.note}</p>
          </div>
          <div className="rounded-edges-shapes">
            {SHAPES.map((shape) => (
              <div
                key={shape.id}
                className="rounded-edges-specimen"
                aria-hidden="true"
                data-specimen={`${option.id}/${shape.id}`}
                data-kind="ring"
                data-approach="live"
                data-sides={shape.sides}
                data-option={option.id}
                data-shape={shape.id}
                data-sheen={shape.sheen}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
