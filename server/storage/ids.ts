import 'server-only';

import { z } from 'zod';

/*
  Server-only. The shape of the ids a request or a file name carries. They are
  written here once: a pattern repeated in several places drifts.
*/

// A bare name, safe to put in a file name: never a path. A read id or a
// rulebook fingerprint, wherever it names a file.
export const FILE_ID = /^[\w-]+$/;

// A read id as a request carries it: a bare name, and not unbounded.
export const READ_ID = /^[\w-]{1,80}$/;
export const readIdSchema = z.string().regex(READ_ID);

// An accepted rulebook's id.
export const RULEBOOK_ID = /^[0-9a-f]{12}$/;
export const rulebookIdSchema = z.string().regex(RULEBOOK_ID);
