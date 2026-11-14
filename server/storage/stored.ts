import 'server-only';

import type { z } from 'zod';

import { StoredFileError } from './files';

/*
  Server-only. A body kept in a database column, read through the schema its
  kind is read with, as a kept file is (files.ts, readKept): one that does not
  fit is reported, not half-read. `where` names it for a person.
*/
export function parseStored<T>(
  body: unknown,
  schema: z.ZodType<T>,
  where: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new StoredFileError(
      `${where} does not fit the stored shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
    );
  return parsed.data;
}
