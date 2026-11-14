# Database

Status: designed and migrated, not yet used. Written 14 November 2026. `server/db/` holds the client, the schema and its tests; `drizzle/` holds the migrations. No storage function reads or writes a table yet, and the app opens no database during normal use. The next phases move the functions in `server/storage/` and `server/jobs/` onto these tables, keeping their signatures.

## Opening it

`database()` in `server/db/client.ts` is the only way in. It chooses once per server process, holds the result on `globalThis` (as `server/jobs/run-job.ts` holds the job map), and connects only when first asked:

| Where          | Driver                                                       | Why                                                                                                                                                     |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | node-postgres `Pool`, 5 connections, idle 10 s, timeout 10 s | Interactive transactions need a connection; Fluid compute reuses an instance. Use Neon's pooled URL (`-pooler`). Each setting's reason is in `poolFor`. |
| No URL         | PGlite on disk, `data/pglite/`, migrated on first use        | The app starts with no credentials (the README's promise, CI's browser job). A development dependency, loaded by dynamic import only on this path.      |
| Tests          | PGlite in memory, fresh per test (`inScratchDatabase()`)     | No network, no files. Migrated once per test file and copied per test (`clone()`): about 150 ms a test, against 600 ms to create and migrate one.       |

Storage functions take a `Database`, which a Drizzle transaction also is, so a caller can run one inside its own `db.transaction(...)`. Plain SQL's result type depends on the driver; prefer the query builder.

```sh
pnpm db:generate   # a migration from server/db/schema.ts; review the SQL, commit it
pnpm db:migrate    # applies drizzle/ to DATABASE_URL_UNPOOLED, DATABASE_URL, or data/pglite
pnpm db:reset      # drops everything and migrates; refuses any target not marked (below)
pnpm db:studio     # migrates, then browses it; not while pnpm dev holds data/pglite
```

Migrations run over the direct connection (`DATABASE_URL_UNPOOLED`): Neon's pooler is PgBouncer in transaction mode, which a migration's session state does not survive. In production they are to run in the Vercel build, production only; that step is not wired yet. `db:reset` refuses on Vercel and under `NODE_ENV=production`, and on any server unless `SAFEPOINT_RESETTABLE_DATABASE_URL` is that exact URL. Every module in `server/` begins with `import 'server-only'`, which throws outside a React server build; the scripts run Node and drizzle-kit with `--conditions=react-server`, under which the package resolves to its empty module, as Vitest's alias does.

`drizzle/0000_tables.sql` is generated. `drizzle/0001_guards.sql` is written by hand (`drizzle-kit generate --custom`): drizzle-kit cannot write functions or triggers and keeps no record of them, so regenerating neither drops nor repeats it, and `server/db/schema.test.ts` fails if a guard is missing.

## Tables

Every table carries its scope: `process` (a key into `processes`), except `source_reads` (by `source`: a source knows no process) and `model_limits` (a quota is the API key's). A future workspace or session is an attribute of a `processes` row, not a column on every key: a process belongs to one workspace, the same template in two workspaces is two process ids, and no key or foreign key changes.

| Table                  | Holds                                                                                          | Key                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `processes`            | The scope                                                                                      | `id`                                                                  |
| `instruction_versions` | Each version's text, label, note, who and when; written once                                   | `(process, hash)`; `version` unique; `hash` checked against the text  |
| `reads`                | A run's read, whole; written once                                                              | `(process, id)`                                                       |
| `source_reads`         | A source's own read, every resource; written once                                              | `(source, read_id)`                                                   |
| `data_profiles`        | Each confirmed profile; written once                                                           | `(process, id)`, the `profileFingerprint`                             |
| `current_profiles`     | The profile under review, with a compare-and-set `revision`                                    | `process`                                                             |
| `current_rulebooks`    | The rulebook under review per instructions, with a compare-and-set `revision`                  | `(process, instructions_hash)`                                        |
| `rulebook_revisions`   | Each accepted rulebook: body, parent, reason, time, shape version, note, profile; written once | `(process, instructions_hash, id)`, the `fingerprintOf`; `seq` orders |
| `rulebook_heads`       | The revision in use per instructions                                                           | `(process, instructions_hash)`                                        |
| `runs`                 | Instructions, read and pinned revision (each a foreign key), stage, status, trigger, who, when | `(process, id)`                                                       |
| `proposals`            | Each proposal made, whole, by run key; written once                                            | `id`; `(process, read_id, fingerprint, proposed_at)` unique           |
| `cross_checks`         | The model's cross-check by run key; replaced on a new check                                    | `(process, read_id, fingerprint)`                                     |
| `answer_parts`         | A proposal or cross-check still being answered (the `.part` files)                             | `(process, kind, read_id, fingerprint)`                               |
| `record_decisions`     | Approve, change (with values), reject or withdraw, on one record of one proposal, in one run   | `id`; appended only                                                   |
| `rule_decisions`       | Confirm intent, accept, deny (note), choose (version), applies to, confirm profile             | `id`; appended only                                                   |
| `applications`         | A write and its undo: status, range, before, after, changes, decisions, undo marker            | `id`; one standing per run key                                        |
| `jobs`                 | A job's progress as columns, its holder and lease                                              | `(process, kind, key)`                                                |
| `model_limits`         | Per model: shared quota, learned limits, today's count                                         | `model`                                                               |
| `model_attempts`       | One model call: purpose, model, what it was part of, outcome, duration, tokens, asked, answer  | `id`                                                                  |

Every foreign key restricts deletes; nothing cascades. A decision points at the exact proposal row it was made on, and a rule decision keeps the definition as it was shown and the rulebook's `revision` it was read at, so what was approved stays readable after the rulebook moves on. A profile's and a rulebook's `read_id` are not keys: the reads they came from are run data, and a database seeded from `fixtures/` has none. A proposal's fingerprint is not a key either: a process with no rulebook proposes under the empty rulebook's (`noRules`).

## What moves where

| Kept today                                                           | Table                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `fixtures/<process>/rulebooks/<version>-<hash>/current.json`         | `current_rulebooks`; the folder's version and hash are `instruction_versions`                   |
| `fixtures/<process>/rulebooks/<version>-<hash>/<rulebook id>.json`   | `rulebook_revisions.body`                                                                       |
| `fixtures/<process>/rulebooks/<version>-<hash>/revisions.json`       | `rulebook_revisions` rows in `seq` order, and `rulebook_heads`                                  |
| `fixtures/<process>/profile/current.json`, `<profile id>.json`       | `current_profiles`, `data_profiles`                                                             |
| `fixtures/<process>/sheet-snapshot.json`                             | Stays in git: the captured stand-in for a live read                                             |
| Instructions declared in `lib/processes/<process>/process.ts`        | `instruction_versions`, `origin = 'declared'`, seeded                                           |
| `data/<process>/reads/<read>.json`                                   | `reads`                                                                                         |
| `data/sources/<source>/reads/<read>.json`                            | `source_reads`                                                                                  |
| `data/<process>/cross-checks/<read>.<fp>.json`, `….part.json`        | `cross_checks`; `answer_parts` (`cross-check`)                                                  |
| `data/<process>/proposals/<read>.<fp>.json`, `….part.json`           | `proposals`; `answer_parts` (`proposal`)                                                        |
| `data/<process>/proposals/<read>.<fp>-progress.json`                 | `jobs` (`proposals`, key `<read>:<fp>`)                                                         |
| `data/<process>/drafts/<hash>.json`                                  | `jobs` (`drafts`, key `<hash>`)                                                                 |
| `data/<process>/applied/<read>.<fp>.json`, an array                  | `applications`, one row per entry                                                               |
| `data/model-limits.json`                                             | `model_limits`, one row per model                                                               |
| The job map on `globalThis` (`serverJobs`)                           | `jobs.holder`, `jobs.heartbeat_at`                                                              |
| `approvedAt`, `deniedAt`, `denial`, `intentConfirmedAt` on a set     | Kept on the body (the fingerprint reads `approvedAt`), and each act also a `rule_decisions` row |
| `safepoint.live-runs.v1`: `run`                                      | `runs`; `additionalInstructions` too                                                            |
| `safepoint.live-runs.v1`: `data.propose.decisions`                   | `record_decisions`                                                                              |
| `safepoint.live-runs.v1`: `data.read`, `rules`, `calculate`, `apply` | Not kept: worked out from `reads`, `current_rulebooks`, `cross_checks`, `applications`          |
| `safepoint.instructions.v2`: `published`                             | `instruction_versions`, `origin = 'published'`                                                  |
| Nothing (what the model did on each attempt)                         | `model_attempts`                                                                                |

Stay in the browser: `safepoint.instructions.v2`'s unpublished `draft`, and the preferences and previews (`assistant`, `calculate-revealed`, `inputs`, `last-process`, `process-names`, `process-order`, `process-tab`, `review-filter`, `schedules`, `sidebar`, `safepoint.dev.*`).

## Bodies are `json`, not `jsonb`

PostgreSQL's `jsonb` "does not preserve the order of object keys" (manual, 8.14); `json` keeps the input text exactly. `server/db/round-trip.test.ts` holds this against all 14 files under `fixtures/brunch-orders/rulebooks/`, `fixtures/brunch-orders/profile/` and `e2e/fixtures/`: as `jsonb` every one comes back reordered (shorter keys first, then by byte); as `json` every one comes back to the byte. Read through its Zod schema, a `jsonb` body happens to come back exact for every rulebook, profile and index kept today, because Zod rebuilds an object in its schema's order and those files were arranged that way. It is luck, not design: a record's keys (`z.record`) keep `jsonb`'s order, so a proposal's records lose the read's order, and an example setting two fields (as the conformance process's do) no longer round-trips; the test shows both.

So every body is `json`, and the export to `fixtures/` the plan depends on is possible: the test imports both rulebook folders and the profile folder into their tables, exports them, and gets every file back byte for byte, every id reproduced from its body. Times are `timestamptz` read as `Date`, which gives back the files' ISO strings at millisecond precision. What `json` costs: no equality operator, no GIN index, slower `->>`. Nothing queries inside a body; where a column repeats a body's field (an id, a hash, a run key) a check holds them equal.

## What the database enforces, and what is left to code

The database: every key and uniqueness above; a row written once in `instruction_versions`, `reads`, `source_reads`, `data_profiles`, `rulebook_revisions`, `proposals`, `record_decisions` and `rule_decisions` (a trigger refuses update and delete); an instruction version's hash is its text's; a revision's parent, head and profile exist; columns agree with the body fields they repeat; every update of `current_rulebooks` or `current_profiles` moves `revision` on by one, whatever the statement set; at most one pending or written application per run key (a partial unique index); an application's written content never changes, its status moves only forward (pending to verified, mismatch or failed; verified or mismatch to undone), undone has its time, and it is never removed; closed sets of values, as checks; a running job names its holder and lease; deletes of what anything points at are refused.

Code: a revision's id is `fingerprintOf(body)` and a profile's `profileFingerprint(body)` (SQL cannot repeat `JSON.stringify`); every body is read and written through its Zod schema; the head moves in the same transaction as the revision it names, and a new revision's parent is the head read under the lock below; a run's proposal and its decisions share its run key; the current decision is the latest per run, proposal and record, a withdrawal meaning none; a job's lease is renewed and judged.

## Replacing `inTurn` and the job map

`inTurn` (`server/storage/files.ts`) and the job map serialise within one process. With several instances:

- **`updateSet`, a profile under review**: compare-and-set on `revision`: read, apply the pure change, `update … where revision = $seen`, and on no row read again and retry, a few times. No lock is held, it works through the pooler, and the change functions are already pure. `saveSet` replaces by design: an upsert.
- **`putRevision`**: one transaction under `pg_advisory_xact_lock` on the process and instructions hash: read the head, insert the revision `on conflict do nothing`, and if it was new, move the head. An advisory lock because the head row may not exist yet, so there is nothing to lock with `for update`; transaction-scoped because Neon's pooler cannot hold a session lock.
- **`applyDecisions`, `undoApplication`, settling**: no lock across the call to the sheet, which can take seconds on a pooled connection. Inserting the pending row is the claim (the unique index refuses a second); settling is `update … where id = $1 and status = 'pending'`; an undo claims with `undo_started_at` where it is null and finishes where it is still that value. A refused claim is answered as today's "already written" or "not read back".
- **Parts, cross-checks, model limits**: single-statement upserts; a count is `used_count + 1` in the statement.
- **Jobs**: starting is `insert … on conflict do update … where not running or heartbeat_at < now() - lease returning *`: a row back means this instance holds the job. The holder is one id per server process, renewed with each note and at least every 15 s; a job kept as running whose lease (60 s) has run out is reported as interrupted, as today's job that "is not held in this process".

## Open questions for the owner

1. **Order of the move.** The proposal's review (13 November) puts rulebooks last, after runs, decisions and writes. The schema carries both; the export test shows `fixtures/` can stay the reviewed copy. Which phase moves rulebooks?
2. **Instruction text before a rulebook.** `current_rulebooks` and `rulebook_revisions` require the instructions version to be kept. `saveSet` and `putRevision` receive the set, not the text, so the text must be kept where it is in hand (drafting, publishing). Acceptable, or relax the key?
3. **Version labels** are unique per process. Two browsers can each publish a `v4` today; on the server the number must be assigned there.
4. **Keeping everything.** Reads, proposals and decisions are never deleted. Is there a retention limit, and should model answers in `model_attempts`, which hold the sheet's data, have one?
5. **Decisions per run or per run key.** Two runs on one read and rulebook share a proposal and a standing write today. Decisions are designed per run; the write stays per run key.
6. **Background work on Vercel.** A job started without `after()` or Workflow may be frozen with its instance. `@vercel/functions`' `attachDatabasePool` releases idle connections before suspension; it is not installed.
7. **The reset mark.** An exact-URL environment variable; a branch made from `main` copies data, so the guard cannot live in the database. Enough?

Unverified until the Neon project exists: the pool over a real pooled URL, `pg_advisory_xact_lock` through Neon's pooler, `drop schema public` under Neon's owner role in `db:reset`, and pg's warning about `sslmode=require` in Neon's URLs.
