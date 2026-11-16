import 'server-only';

import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { z } from 'zod';

/*
  Server-only. The one place a file the server keeps is read or written: kept
  JSON is read through a schema, so a broken file is reported rather than
  half-read or taken for "nothing kept", and written whole beside itself then
  renamed over, so a reader never sees half of one.
*/

export class StoredFileError extends Error {}

export type ReadOptions = {
  // For a file that is only a convenience: one that cannot be read or does not
  // fit counts as not kept, rather than being reported.
  unreadableIsMissing?: boolean;
};

export type WriteOptions = {
  // One line, with no newline after it, for a file nobody reads by eye.
  compact?: boolean;
};

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

// The kept value; null when there is no such file.
export async function readKept<T>(
  file: string,
  schema: z.ZodType<T>,
  { unreadableIsMissing = false }: ReadOptions = {},
): Promise<T | null> {
  try {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return parseKept(raw, file, schema);
  } catch (error) {
    if (unreadableIsMissing) return null;
    throw error;
  }
}

// For state that is needed where nothing can wait, as a module starts.
export function readKeptSync<T>(
  file: string,
  schema: z.ZodType<T>,
  { unreadableIsMissing = false }: ReadOptions = {},
): T | null {
  try {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return parseKept(raw, file, schema);
  } catch (error) {
    if (unreadableIsMissing) return null;
    throw error;
  }
}

function parseKept<T>(raw: string, file: string, schema: z.ZodType<T>): T {
  // Read when called, so a test can work in a scratch directory.
  const where = path.relative(process.cwd(), file);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new StoredFileError(`${where} is not valid JSON.`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new StoredFileError(
      `${where} does not fit the stored shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
    );
  return parsed.data;
}

// Writes calls make in the same instant must not share a temporary file.
let writes = 0;

export async function writeKept(
  file: string,
  value: unknown,
  { compact = false }: WriteOptions = {},
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.${(writes += 1)}.tmp`;
  try {
    await writeFile(
      temporary,
      compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`,
    );
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
