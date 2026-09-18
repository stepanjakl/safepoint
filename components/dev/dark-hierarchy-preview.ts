// Development-only comparison; keep the established token definitions intact
// until the proposal is accepted. Selectors rely on development style markers.
const proposal = `
  & [data-component='InitialAnalysis'] {
    --control-face-top: var(--sp-neutral-875);
    --control-face-bottom: var(--sp-neutral-875);
    --control-ring-top: var(--sp-neutral-725);
    --control-ring-bottom: var(--sp-neutral-775);
    --control-highlight: var(--sp-face-highlight-medium);
  }
  & [data-component='InitialAnalysis'] .border-rule-faint {
    border-color: var(--sp-neutral-775);
  }
  & .header-button {
    --sp-header-button-face-top: var(--sp-neutral-775);
    --sp-header-button-face-bottom: var(--sp-neutral-825);
    --sp-header-button-face-top-blocked: color-mix(in oklab, var(--sp-state-blocked) 4%, var(--sp-neutral-775));
    --sp-header-button-face-bottom-blocked: color-mix(in oklab, var(--sp-state-blocked) 6%, var(--sp-neutral-825));
    --sp-header-button-face-top-caution: color-mix(in oklab, var(--sp-state-caution) 4%, var(--sp-neutral-775));
    --sp-header-button-face-bottom-caution: color-mix(in oklab, var(--sp-state-caution) 6%, var(--sp-neutral-825));
  }
  & .sheet-row[data-current] {
    background: var(--sp-neutral-750);
    --sheet-ink: var(--sp-neutral-100);
  }
  & .sheet-row[data-run-status='completed']:not([data-current]) .sheet-row-status {
    color: var(--sp-text-muted);
  }
  & .sheet-row[data-run-status='completed'] .sheet-row-status svg {
    color: var(--sp-state-verified);
  }
  & .sheet-row[data-run-status='superseded']:not([data-current]) .sheet-seg[data-severity] {
    background: var(--severity-5);
    color: var(--severity-11);
  }
  & [data-component='ReleaseCard'][data-part='commit-state'][data-simulated='true'] {
    background: var(--sp-neutral-800);
    color: var(--sp-neutral-250);
  }
  & [data-component='ReleaseCard'][data-part='bucket-bar'][data-severity='3']:not([data-active]) {
    background: var(--sp-state-verified-7);
  }
`;

export const DARK_HIERARCHY_CSS = `
@media (forced-colors: none) {
  :root[data-dark-hierarchy='proposed'][data-theme='dark'] { ${proposal} }
  @media (prefers-color-scheme: dark) {
    :root[data-dark-hierarchy='proposed']:not([data-theme]) { ${proposal} }
  }
}
`;
