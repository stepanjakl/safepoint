/* One measured colour: where it was read, what it is, and what it sits on. */
export type Reading = {
  component: string;
  theme: 'light' | 'dark';
  /* The neutral family on <html data-neutral>. */
  family: string;
  /* The surface the component sits on. */
  surface: 'canvas' | 'primary' | 'floating';
  /* A named variant of the component, e.g. 'default' or 'small'. */
  strip: string;
  /* The part's colour family: 'blocked', 'all', ... */
  group: string;
  /* What it is: 'rest-chip', 'hover-wash', 'pill-top', ... */
  state: string;
  /* CSS colour as the browser computed it. */
  colour: string;
  /* The colour it is read against: a ground, a face, another part. */
  ref: string;
};

export type Severity = 'blocking' | 'advisory';

/* One verdict, with the numbers that produced it, so a failure explains itself. */
export type Finding = {
  id: string;
  severity: Severity;
  pass: boolean;
  where: string;
  detail: string;
};
