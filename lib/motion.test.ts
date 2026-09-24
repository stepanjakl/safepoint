import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_EMPHASIZED } from './motion';

// The whole folder, so a token moving between its files does not break this.
const dir = new URL('../app/styles/', import.meta.url);
const tokens = readdirSync(dir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => readFileSync(new URL(file, dir), 'utf8'))
  .join('\n');

// The colon is what separates a definition from a reference in a comment.
function token(name: string) {
  const value = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`--${name} is not defined in app/styles/`);
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
  it('mirror the durations in app/styles/', () => {
    expect(DURATION_STATE).toBe(seconds(token('duration-state')));
    expect(DURATION_PANE).toBe(seconds(token('duration-pane')));
  });

  it('mirror the emphasized curve in app/styles/', () => {
    expect([...EASE_OUT_EMPHASIZED]).toEqual(
      bezier(token('ease-out-emphasized')),
    );
  });
});
