import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { inScratchDirectory } from '@/lib/engine/scratch.fixture';

import { readKept, readKeptSync, StoredFileError, writeKept } from './files';

// Every file the server keeps goes through these two: read through a schema,
// so a broken file is reported, and written whole, so a reader never meets
// half of one.

const scratch = inScratchDirectory();
const schema = z.object({ name: z.string(), count: z.number() });
const at = (name: string) => path.join(scratch(), 'data', name);
const put = (name: string, text: string) => {
  mkdirSync(path.dirname(at(name)), { recursive: true });
  writeFileSync(at(name), text);
};

describe('reading a kept file', () => {
  it('gives null for a file that does not exist', async () => {
    expect(await readKept(at('none.json'), schema)).toBeNull();
    expect(readKeptSync(at('none.json'), schema)).toBeNull();
  });

  it('gives the value of a file that fits', async () => {
    put('ok.json', '{"name":"a","count":2}');
    expect(await readKept(at('ok.json'), schema)).toEqual({
      name: 'a',
      count: 2,
    });
  });

  it('reports a file that is not JSON, naming it from the working directory', async () => {
    put('bad.json', '{ "name": ');
    const error = await readKept(at('bad.json'), schema).catch((e) => e);
    expect(error).toBeInstanceOf(StoredFileError);
    expect(error.message).toBe(
      `${path.join('data', 'bad.json')} is not valid JSON.`,
    );
  });

  it('reports a file of another shape, naming the path and what does not fit', async () => {
    put('shape.json', '{"name":"a","count":"two"}');
    const error = await readKept(at('shape.json'), schema).catch((e) => e);
    expect(error).toBeInstanceOf(StoredFileError);
    expect(error.message).toContain(
      `${path.join('data', 'shape.json')} does not fit the stored shape: count: `,
    );
  });

  it('names at most three things that do not fit', async () => {
    put('many.json', '{}');
    const wide = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
    });
    const error = await readKept(at('many.json'), wide).catch((e) => e);
    expect(error.message.split('; ')).toHaveLength(3);
    expect(error.message).not.toContain('; d:');
  });

  it('reports the same for a read that cannot wait', () => {
    put('bad.json', 'nope');
    expect(() => readKeptSync(at('bad.json'), schema)).toThrow(StoredFileError);
  });

  it('rethrows what is not about the file being missing or wrong', async () => {
    // A folder where a file should be.
    mkdirSync(at('folder.json'), { recursive: true });
    await expect(readKept(at('folder.json'), schema)).rejects.toThrow(/EISDIR/);
  });

  it('counts an unreadable file as missing when the caller says so', async () => {
    const lenient = { unreadableIsMissing: true };
    put('bad.json', 'nope');
    put('shape.json', '{"name":1}');
    mkdirSync(at('folder.json'), { recursive: true });
    for (const name of ['bad.json', 'shape.json', 'folder.json'])
      expect(await readKept(at(name), schema, lenient)).toBeNull();
    expect(readKeptSync(at('bad.json'), schema, lenient)).toBeNull();
    put('ok.json', '{"name":"a","count":2}');
    expect(await readKept(at('ok.json'), schema, lenient)).toEqual({
      name: 'a',
      count: 2,
    });
  });

  it('reads the working directory when called, not when loaded', async () => {
    put('bad.json', 'nope');
    const error = await readKept(at('bad.json'), schema).catch((e) => e);
    expect(error.message.startsWith('data')).toBe(true);
  });
});

describe('writing a kept file', () => {
  it('makes the folder and writes the value, indented, with a newline', async () => {
    await writeKept(at('deep/er/value.json'), { name: 'a', count: 1 });
    expect(readFileSync(at('deep/er/value.json'), 'utf8')).toBe(
      '{\n  "name": "a",\n  "count": 1\n}\n',
    );
  });

  it('writes one line, with no newline, when asked to be compact', async () => {
    await writeKept(
      at('compact.json'),
      { name: 'a', count: 1 },
      { compact: true },
    );
    expect(readFileSync(at('compact.json'), 'utf8')).toBe(
      '{"name":"a","count":1}',
    );
  });

  it('replaces what was there and leaves no temporary file beside it', async () => {
    await writeKept(at('value.json'), { name: 'a', count: 1 });
    await Promise.all(
      [2, 3, 4].map((count) =>
        writeKept(at('value.json'), { name: 'a', count }),
      ),
    );
    expect(readdirSync(at('.'))).toEqual(['value.json']);
    expect(await readKept(at('value.json'), schema)).toMatchObject({
      name: 'a',
    });
  });

  it('leaves no temporary file, and keeps what was there, when it cannot finish', async () => {
    await writeKept(at('value.json'), { name: 'a', count: 1 });
    // A folder where the file should be: the rename cannot land.
    mkdirSync(at('taken.json'));
    await expect(
      writeKept(at('taken.json'), { name: 'b', count: 2 }),
    ).rejects.toThrow();
    expect(readdirSync(at('.')).sort()).toEqual(['taken.json', 'value.json']);
    expect(await readKept(at('value.json'), schema)).toEqual({
      name: 'a',
      count: 1,
    });
  });
});

describe('a file that fails to read', () => {
  it('is left as it was, so it is never overwritten unseen', async () => {
    put('bad.json', '{ "name": ');
    await expect(readKept(at('bad.json'), schema)).rejects.toThrow(
      StoredFileError,
    );
    expect(readFileSync(at('bad.json'), 'utf8')).toBe('{ "name": ');
    expect(readdirSync(at('.'))).toEqual(['bad.json']);
  });
});
