import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { hashOf } from '@/lib/definitions/fingerprint';
import { inScratchDatabase, rowsOf } from '@/lib/definitions/scratch.fixture';
import { normalisedInstructions } from '@/lib/shell/instruction-diff';
import { instructionVersions, processes } from '@/server/db/schema';
import { keptProcess, keptProcesses } from '@/server/operations/kept-processes';

import {
  declaredAt,
  declaredOf,
  ensureDeclared,
  listVersions,
  publishVersion,
  versionByHash,
} from './instructions';

// Instruction versions, kept and labelled by the server, on a scratch database.

const brunch = keptProcess('brunch-orders');
// By number: the declaration lists v2 before v1.
const declared = declaredOf(brunch).sort((a, b) =>
  a.version.localeCompare(b.version),
);

// Text the browser could hold: accents, a ligature, an emoji outside the
// basic plane, a non-breaking space and a line's trailing spaces.
const AWKWARD = 'Café — naïve ﬁsh, 🥑 ripe. \nKeep the spaces   \nhere.';

describe('instruction versions', () => {
  const db = inScratchDatabase();

  it('keep every declaration, each date read and each text already as published', () => {
    for (const kept of keptProcesses())
      for (const version of declaredOf(kept)) {
        expect(declaredAt(version.updatedAt).getUTCFullYear()).toBe(2026);
        // A publish of the declared text changes nothing about it.
        expect(normalisedInstructions(version.text)).toBe(version.text);
      }
    expect(declaredAt('Written 30 Oct 2026').toISOString()).toBe(
      '2026-10-30T00:00:00.000Z',
    );
    expect(() => declaredAt('Recently')).toThrow(/cannot be read/);
  });

  it('are made sure of on first need, by requests arriving together too', async () => {
    await Promise.all([
      ensureDeclared(db(), brunch),
      ensureDeclared(db(), brunch),
      listVersions(brunch),
    ]);
    const { versions, next } = await listVersions(brunch);
    expect(versions.map((v) => [v.version, v.origin, v.hash])).toEqual(
      declared.map((v) => [v.version, 'declared', hashOf(v.text)]),
    );
    expect(next).toBe('v4');
    // What only a declaration says comes with it.
    expect(versions.at(-1)).toMatchObject({
      publishedBy: 'Project owner',
      publishedAt: '2026-10-30T00:00:00.000Z',
      updatedLabel: 'Written 30 Oct 2026',
      changes: declared.at(-1)!.changes,
    });
    expect(await db().select().from(processes)).toHaveLength(1);
  });

  it('are named by the hash the browser and the database work out alike', async () => {
    const texts = [
      ...declared.map((v) => v.text),
      AWKWARD,
      `${AWKWARD}\n\n  `,
      'Trailing whitespace \t',
    ];
    await db().insert(processes).values({ id: 'hashes' });
    for (const [index, text] of texts.entries())
      // The table's check refuses a row whose hash is not its text's.
      await db()
        .insert(instructionVersions)
        .values({
          process: 'hashes',
          hash: hashOf(text),
          version: `v${index + 1}`,
          text,
          origin: 'published',
          publishedAt: new Date(),
        });
    const rows = await rowsOf<{ text: string; sql: string; hash: string }>(
      db(),
      sql`select text, hash, left(encode(sha256(convert_to(text, 'UTF8')), 'hex'), 12) as sql from instruction_versions where process = 'hashes' order by version`,
    );
    // Byte for byte back, and the same hash both ways.
    expect(rows.map((row) => row.text).sort()).toEqual([...texts].sort());
    for (const row of rows) {
      expect(row.sql).toBe(row.hash);
      expect(hashOf(row.text)).toBe(row.hash);
    }
  });

  it('publish as the browser normalises, under the next label, and answer an existing text with its version', async () => {
    const first = await publishVersion(
      brunch,
      `  ${AWKWARD}  \n\n\n\nA second paragraph.\n`,
      'Because.',
      null,
    );
    expect(first).toMatchObject({
      created: true,
      version: {
        version: 'v4',
        origin: 'published',
        // Each paragraph trimmed, one blank line between; inside one, the
        // text as written, its non-breaking space and line ends too.
        text: `${AWKWARD}\n\nA second paragraph.`,
        note: 'Because.',
        publishedBy: null,
        updatedLabel: null,
        changes: [],
      },
    });
    expect(first.version.hash).toBe(hashOf(first.version.text));
    // The same text after normalising, or a declared one: no new version.
    expect(
      await publishVersion(brunch, `${first.version.text}\n\n`, null, null),
    ).toMatchObject({ created: false, version: { version: 'v4' } });
    expect(
      await publishVersion(brunch, declared[0]!.text, null, null),
    ).toMatchObject({ created: false, version: { version: 'v1' } });
    expect((await listVersions(brunch)).next).toBe('v5');
    expect(await versionByHash(brunch, first.version.hash)).toEqual(
      first.version,
    );
    expect(await versionByHash(brunch, '000000000000')).toBeNull();
    await expect(publishVersion(brunch, ' \n\n ', null, null)).rejects.toThrow(
      'Instructions need some text.',
    );
  });

  it('get two labels for two publishes at once, one after the other', async () => {
    const [a, b, again] = await Promise.all([
      publishVersion(brunch, 'One text.', null, null),
      publishVersion(brunch, 'Another text.', null, null),
      publishVersion(brunch, 'One text.', null, null),
    ]);
    expect([a.version.version, b.version.version].sort()).toEqual(['v4', 'v5']);
    expect(again).toMatchObject({ version: { hash: a.version.hash } });
    const { versions } = await listVersions(brunch);
    expect(versions.map((v) => v.version)).toEqual([
      'v1',
      'v2',
      'v3',
      'v4',
      'v5',
    ]);
  });

  it('are kept per process: each numbers its own', async () => {
    await publishVersion(brunch, 'One text.', null, null);
    const direct = keptProcess('brunch-orders-direct');
    expect(await publishVersion(direct, 'One text.', null, null)).toMatchObject(
      { created: true, version: { version: 'v2' } },
    );
  });

  it('are never changed or removed, once kept', async () => {
    await ensureDeclared(db(), brunch);
    const v1 = and(
      eq(instructionVersions.process, 'brunch-orders'),
      eq(instructionVersions.version, 'v1'),
    );
    for (const work of [
      db().update(instructionVersions).set({ note: 'Edited.' }).where(v1),
      db().delete(instructionVersions).where(v1),
    ])
      await expect(work).rejects.toMatchObject({
        cause: { code: '23000' },
      });
  });

  it('say so when a declared label was published here with other text first', async () => {
    await ensureDeclared(db(), brunch);
    const growing = {
      ...brunch,
      summary: {
        ...brunch.summary,
        instructions: {
          ...brunch.summary.instructions,
          version: 'v4',
          text: 'Declared later.',
          previous: [
            ...brunch.summary.instructions.previous,
            brunch.summary.instructions,
          ],
        },
      },
    };
    await publishVersion(brunch, 'Published first.', null, null);
    await expect(ensureDeclared(db(), growing)).rejects.toThrow(
      'brunch-orders declares instructions v4, but v4 is kept with other text.',
    );
  });
});
