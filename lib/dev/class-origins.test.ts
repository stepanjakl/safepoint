import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { classOrigins, type Step } from './class-origins';

const root = mkdtempSync(join(tmpdir(), 'class-origins-'));
const write = (file: string, text: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      jsx: 'react-jsx',
      moduleResolution: 'bundler',
      module: 'esnext',
      paths: { '@/*': ['./*'] },
    },
  }),
);
write('lib/cx.ts', 'export function cx(...c: unknown[]) { return c; }\n');
write(
  'components/table.tsx',
  [
    "import { cx } from '@/lib/cx';",
    "export const NAME = 'font-semibold';",
    "export const STYLES = { quiet: 'text-muted', loud: 'text-primary' };",
    'export function Table({ className }: { className?: string }) {',
    "  return <div className={cx('p-2', className)} />;",
    '}',
    'export function Bare() {',
    "  return <div className='p-4' />;",
    '}',
  ].join('\n'),
);
write(
  'app/page.tsx',
  [
    "import { cx } from '@/lib/cx';",
    "import { NAME, STYLES, Table } from '@/components/table';",
    'export default function Page({ open }: { open: boolean }) {',
    "  const face = (kind: 'quiet' | 'loud') => STYLES[kind];",
    '  return (',
    '    <>',
    "      <b className={cx(face('loud'))} />",
    '      <span className={cx(NAME, open && `bg-x ${open}`, STYLES.quiet)} />',
    '      <Table className="mt-2" />',
    '    </>',
    '  );',
    '}',
  ].join('\n'),
);

const at = (file: string, line: number, text: string): Step => ({
  file,
  line,
  column: 1 + (readLine(file, line).indexOf(text) || 0),
});
const readLine = (file: string, line: number) =>
  readFileSync(join(root, file), 'utf8').split('\n')[line - 1] as string;

describe('classOrigins', () => {
  it('follows constants, members and conditions to the line that spells them', () => {
    const { found, unresolved } = classOrigins(
      root,
      [at('app/page.tsx', 8, '<span')],
      ['font-semibold', 'bg-x', 'text-muted', 'rounded'],
    );
    expect(found['font-semibold']).toMatchObject({
      file: 'components/table.tsx',
      line: 2,
      via: 'NAME',
    });
    expect(found['text-muted']).toMatchObject({
      file: 'components/table.tsx',
      line: 3,
    });
    expect(found['bg-x']).toMatchObject({ file: 'app/page.tsx', line: 8 });
    expect(unresolved).toEqual(['rounded']);
  });

  it('reads through a helper the app wrote', () => {
    const { found } = classOrigins(
      root,
      [at('app/page.tsx', 7, '<b')],
      ['text-primary', 'text-muted'],
    );
    // Every entry the helper could return is a candidate; the element's own
    // classes decide which one shows.
    expect(found['text-primary']).toMatchObject({
      file: 'components/table.tsx',
      line: 3,
    });
    expect(found['text-muted']).toMatchObject({ line: 3 });
  });

  it('continues a forwarded className at the next owner', () => {
    const { found } = classOrigins(
      root,
      [at('components/table.tsx', 5, '<div'), at('app/page.tsx', 9, '<Table')],
      ['p-2', 'mt-2'],
    );
    expect(found['p-2']).toMatchObject({
      file: 'components/table.tsx',
      line: 5,
    });
    expect(found['mt-2']).toMatchObject({ file: 'app/page.tsx', line: 9 });
  });

  it('stops where className is not forwarded rather than guess', () => {
    const { found, unresolved } = classOrigins(
      root,
      [at('components/table.tsx', 8, '<div'), at('app/page.tsx', 9, '<Table')],
      ['p-4', 'mt-2'],
    );
    expect(found['p-4']).toMatchObject({ line: 8 });
    expect(unresolved).toEqual(['mt-2']);
  });
});
