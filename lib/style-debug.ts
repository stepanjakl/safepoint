type StyleIdentity = {
  component: string;
  part?: string;
  appearance?: string;
  variant?: string;
};

/** Diagnostic identity only: never use these attributes as styling or behavior hooks. */
export function styleDebug({
  component,
  part,
  appearance,
  variant,
}: StyleIdentity) {
  if (process.env.NODE_ENV !== 'development') return undefined;

  return {
    'data-component': component,
    'data-part': part,
    'data-appearance': appearance,
    'data-variant': variant,
  };
}
