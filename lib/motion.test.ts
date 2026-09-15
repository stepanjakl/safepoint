import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_EMPHASIZED } from './motion';

const tokens = readFileSync(
  new URL('../app/tokens.css', import.meta.url),
  'utf8',
);

// The colon is what separates a definition from a reference in a comment.
function token(name: string) {
  const value = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`--${name} is not defined in app/tokens.css`);
  return value.trim();
}

function seconds(value: string) {
  const ms = value.match(/^(\d+(?:\.\d+)?)ms$/)?.[1];
  if (!ms) throw new Error(`expected a duration in ms, got ${value}`);
  return Number(ms) / 1000;
}

function bezier(value: string) {
  const points = value.match(/^cubic-bezier\(([^)]+)\)$/)?.[1];
  if (!points) throw new Error(`expected a cubic-bezier(), got ${value}`);
  return points.split(',').map(Number);
}

describe('motion tokens', () => {
  it('mirror the durations in app/tokens.css', () => {
    expect(DURATION_STATE).toBe(seconds(token('duration-state')));
    expect(DURATION_PANE).toBe(seconds(token('duration-pane')));
  });

  it('mirror the emphasized curve in app/tokens.css', () => {
    expect([...EASE_OUT_EMPHASIZED]).toEqual(
      bezier(token('ease-out-emphasized')),
    );
  });
});
