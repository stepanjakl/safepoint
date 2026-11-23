/*
  rule-below and rule-above (app/styles/controls.css) three ways, on cards
  drawn with the app's own surfaces: as the app draws them, as the pane's
  edge would, and as they were. The other two are scoped to this page
  (section-rules.css). Each card's own edge runs beside its rules.

  Below them, where a column divider meets a band's rule, three ways, on the
  app's pane in small (edge-junctions/junction-pane.tsx) with the row under
  the start column's head lit, as v3 is in Instructions: before, the app's
  own, and without the highlight in the corner.
*/

import { JunctionPane } from '../edge-junctions/junction-pane';

const OPTIONS = [
  {
    id: 'pane',
    title: '0.75px, like the pane',
    note: 'Solid, the soft row mixed with the sheen, then one row of sheen: the card’s own edge, turned inward. Slightly lighter than now.',
  },
  {
    id: 'heavy',
    title: '1px, one-row sheen (the app)',
    note: 'Two solid rows, then one row of sheen. The rule ends at the card’s solid ring, which it joins; the sheen at its soft row.',
  },
  {
    id: 'before',
    title: 'Before',
    note: 'Two solid rows, then the sheen as two lines of its own, a full row and a half one, running across the card’s ring.',
  },
] as const;

const JUNCTIONS = [
  {
    id: 'now',
    title: 'Before',
    note: 'As the app drew it until November 2026. A doubled pixel where the divider meets the header’s rule. Under the band the rule is two solid rows left of the divider, solid and soft right of it. The highlight under the rule and beside the divider makes an L inside the corner.',
  },
  {
    id: 'fixed',
    title: 'Fixed, the L kept (the app)',
    note: 'The divider’s soft column starts below the header rule’s soft row, so the two no longer stack. The band’s rule is solid then soft, except over a lit row, whose fill reaches the rule’s solid row as it reaches the pane’s. Below the band the rule and the divider keep their highlights, which meet in the L.',
  },
  {
    id: 'plain',
    title: 'Fixed, no highlight in the corner',
    note: 'The same fixes, and neither the band’s rule nor the divider carries a highlight: both are solid then soft, and the corner is plain.',
  },
] as const;

function Card({ option }: { option: (typeof OPTIONS)[number]['id'] }) {
  return (
    <div
      className="section-rules-card ground-raised relative isolate"
      data-rule={option}
    >
      <div
        aria-hidden="true"
        className="control-face surface-raised rounded-shell pointer-events-none absolute inset-0 -z-10"
      />
      <div className="rule-below px-4 py-3 font-semibold">A card’s header</div>
      <p className="text-muted px-4 py-6">
        The body, lit by the rules on either side of it. Each rule meets the
        card’s edge at both ends.
      </p>
      <div className="rule-above text-muted px-4 py-3">A card’s footer</div>
    </div>
  );
}

export default function SectionRulesPage() {
  return (
    <main id="main" className="section-rules bg-canvas min-h-dvh">
      <h1 className="text-title font-semibold">Section rules</h1>
      <p className="section-rules-intro text-muted">
        The divider under a header and above a footer, three ways. Zoom in, or
        look at the ends where each rule meets the card’s side.
      </p>
      <div className="section-rules-options">
        {OPTIONS.map((option) => (
          <figure key={option.id} className="section-rules-option">
            <figcaption>
              <span className="font-semibold">{option.title}</span>
              <span className="text-muted block">{option.note}</span>
            </figcaption>
            <Card option={option.id} />
          </figure>
        ))}
      </div>
      <h2 className="text-title font-semibold">
        Where a column divider meets a band’s rule
      </h2>
      <p className="section-rules-intro text-muted">
        The divider between Instructions’ versions and its text, three ways.
        Look at the two places it meets a rule: the header’s at the top, the
        band’s below it. Compare in both themes; in dark the highlight is darker
        than the face.
      </p>
      <div className="section-rules-junctions">
        {JUNCTIONS.map((option) => (
          <figure
            key={option.id}
            className="section-rules-junction"
            data-junction={option.id}
          >
            <figcaption>
              <span className="font-semibold">{option.title}</span>
              <span className="text-muted block">{option.note}</span>
            </figcaption>
            <div aria-hidden="true">
              <JunctionPane
                name={`section-rules-${option.id}`}
                endHead
                firstCurrent
              />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
