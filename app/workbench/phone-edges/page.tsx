/*
  A pane's ring and sheen, and a button's ring, drawn five ways in whole
  device pixels for a 3x phone. Each version is its own layers here
  (phone-edges.css), not the app's edge tokens, so they sit side by side.
*/

const OPTIONS = [
  {
    id: 'before',
    title: 'Before',
    layers: 'ring · ring · blend · sheen · half sheen',
    note: 'The desktop widths, 0.75px each: 2¼ device pixels, so each layer blends a quarter row into the next.',
  },
  {
    id: 'now',
    title: 'Whole pixels (the app now)',
    layers: 'ring · ring · sheen · sheen',
    note: 'Two device pixels each, nothing blended: 1.33px in all.',
  },
  {
    id: 'pattern',
    title: 'Desktop’s pattern',
    layers: 'ring · ring · half and half · sheen · sheen',
    note: 'A deliberate middle row between ring and sheen, as a 2× screen draws: 1.67px in all.',
  },
  {
    id: 'slim',
    title: 'Desktop’s pattern, slim',
    layers: 'ring · ring · half and half · sheen',
    note: 'The middle row with a one-pixel sheen: 1.33px, as now.',
  },
  {
    id: 'desktop',
    title: 'Desktop’s pixels',
    layers: 'ring · half and half · sheen',
    note: 'The same three device pixels a 2× screen paints, finer here: 1px in all.',
  },
] as const;

export default function PhoneEdgesPage() {
  return (
    <main id="main" className="phone-edges bg-canvas text-primary min-h-dvh">
      <h1 className="text-title font-semibold">Phone edges</h1>
      <p className="phone-edges-intro text-muted">
        Open on a 3× phone and zoom in. Each card is a pane’s ring and sheen,
        each pill a button’s ring; the layers are listed from the outside in.
      </p>
      <div className="phone-edges-options">
        {OPTIONS.map((option) => (
          <figure
            key={option.id}
            className="phone-edges-option"
            data-variant={option.id}
          >
            <div className="phone-edges-specimens" aria-hidden="true">
              <div className="phone-edges-card surface-raised" />
              <span className="phone-edges-button control-button-secondary text-dense font-medium">
                Review
              </span>
            </div>
            <figcaption className="phone-edges-caption">
              <span className="font-semibold">{option.title}</span>
              <span className="text-meta block">{option.layers}</span>
              <span className="text-meta text-muted block">{option.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
