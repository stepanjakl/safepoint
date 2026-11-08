# Persistence and maintainability proposal

Date: 7 November 2026.

Status: research and recommendations, not an implementation plan already approved
or a description of production capabilities. Based on the working tree, including
ongoing uncommitted changes. Read alongside the current
[architecture guide](ARCHITECTURE.md) and the earlier
[project analysis](PROJECT-ANALYSIS.md).

The analysis covered architecture, API routes, persistence, background jobs,
browser stores, validation, representative components and tests, CI configuration,
and official tool documentation. It was read-only. The only executed project check
was `pnpm check:unused`; application tests and production failure scenarios were
not run.

## Recommendation

Keep Safepoint as one application, adopt PostgreSQL/Neon with Drizzle, and introduce
tRPC with TanStack Query incrementally. The biggest improvement would come from
making state ownership, business operations, and failure handling explicit.

Avoid a wholesale rewrite or an immediate monorepo conversion. Much of the
existing domain code deserves to survive.

Drizzle and tRPC serve different boundaries:

```text
React UI
   ↓ tRPC: typed requests and responses
Application operations
   ↓ Drizzle: queries and transactions
PostgreSQL hosted on Neon
```

Zod validates incoming shapes. Domain functions enforce business rules. Database
constraints and transactions enforce persistent consistency. Neither tRPC nor
Drizzle replaces the other responsibilities.

## Existing strengths

- Strict TypeScript, including `noUncheckedIndexedAccess`.
- Zod schemas and inferred types for important stored contracts.
- A process-agnostic definitions engine.
- Deterministic checks shared between drafting and acceptance.
- Immutable accepted rulebook revisions.
- Provider code isolated behind functions and an `OutputSheet` interface.
- Tests covering stale data, rechecking before writes, verification, and guarded
  undo.
- Knip, linting, typechecking, tests, token checks, and builds configured in CI.

The central problem is that this is becoming a durable operational application
while retaining development-oriented persistence and execution.

## Highest-value changes

| Priority | Evidence in the current code                                                                                 | Proposed change                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Highest  | Runs and proposal decisions are browser-local; instructions and schedule overrides also use browser storage. | Make operational state server-authoritative. Keep browser storage for presentation preferences. |
| Highest  | Sheet writes happen before their application record is saved.                                                | Persist execution intent before calling the provider, then reconcile and record the outcome.    |
| High     | File updates use read–modify–write without concurrency control.                                              | Use transactions, revision checks, and uniqueness constraints.                                  |
| High     | Drafts and proposals run as detached promises tracked in process-local maps.                                 | Move production execution to durable jobs.                                                      |
| High     | Some stored JSON is validated strictly; other readers cast it and swallow all errors.                        | Apply consistent boundary validation and distinguish missing, corrupt, and unavailable data.    |
| Medium   | UI components contain request contracts, polling, state coordination, and presentation.                      | Extract typed API access and cohesive feature components.                                       |
| Medium   | Domain contracts, UI models, and demonstration lifecycle code sit close together.                            | Clarify ownership and enforce import boundaries.                                                |

These are findings from code inspection, rather than reproduced production
incidents.

For example, `readJson()` in [propose.ts](../../lib/definitions/propose.ts) catches
every failure and returns `null`. Invalid JSON, permission errors, and missing
files consequently look alike. The rulebook store already distinguishes corrupted
data from missing data; extend that stronger approach.

The concurrency concern is more subtle. `accept()` in
[decide.ts](../../lib/definitions/decide.ts) validates a loaded definition and
subsequently updates a freshly loaded set. Under concurrent rewriting, the
definition being approved could differ from the one checked. The eventual
operation should mean: **accept this exact definition revision, provided it is
still current**.

Similarly, `putRevision()` in [store.ts](../../lib/definitions/store.ts) updates
revision content and its index separately. Atomic file replacement protects an
individual file from partial replacement; it does not make the whole operation
transactional.

## PostgreSQL, Neon, and Drizzle

PostgreSQL is a good fit because important records have relationships and
consistency requirements: runs reference instructions, reads, rulebooks, proposals,
decisions, and external applications. Those relationships can become enforceable
constraints.

Start with this conceptual model:

| Records                               | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| Processes and instruction revisions   | Durable configuration and the exact instructions used  |
| Sources and source reads              | Connection identity and immutable evidence             |
| Rulebook drafts, revisions, and heads | Editable work, accepted history, and current pointers  |
| Runs                                  | Execution state and pinned input versions              |
| Proposals and decisions               | Exact proposed content and who decided what            |
| Effect intents and attempts           | Requested external changes and their observed outcomes |
| Jobs or dispatch records              | Reliable scheduling and recovery                       |

This is a starting model, not a requirement to build every table immediately.

Use relational columns for identity, ownership, relationships, status, timestamps,
and fields queried. Use versioned JSONB for complex rulebook bodies and evidence
snapshots where that preserves the domain model cleanly. Avoid both one enormous
JSON document containing the application and decomposing every formula operand
into a relational table.

Neon's isolated branches would be useful for migration rehearsal and preview
environments. Prefer seeded or schema-only branches where copying operational
data is unnecessary. See [Neon branching](https://neon.com/docs/introduction/branching).

Choose Drizzle as the database layer. It fits the existing TypeScript style and
keeps queries and transaction boundaries visible. Its transaction API supports
grouping related database changes into one operation. See
[Drizzle transactions](https://orm.drizzle.team/docs/transactions).

Select the driver based on the transactions needed. Neon's HTTP interface supports
individual queries and non-interactive transactions; interactive transactions
require an appropriate connection-based driver, such as its WebSocket
`Pool`/`Client` interface. See the
[Neon driver documentation](https://neon.com/docs/serverless/serverless-driver).

Before relying on this operationally, establish:

- Reviewed SQL migrations, applied through a controlled deployment step.
- Separate development, test, and production environments.
- Explicit recovery objectives and a tested restore procedure.
- Application and database access scoped to the intended users or workspaces.
- Connection limits, query timeouts, and basic database monitoring.

A managed database reduces operational work; it still needs a recovery policy.

## Reliable external writes

In `applyDecisions()` in [apply.ts](../../lib/definitions/apply.ts), the code writes
to the sheet, reads it back, and then saves the application record. Verification
is valuable, but the interval between the external write and saving its result
remains a failure boundary.

Evolve this into:

```text
Persist approved intent
        ↓
Claim execution attempt
        ↓
Recheck current evidence and approval
        ↓
Call external provider
        ↓
Read back and reconcile
        ↓
Persist verified / failed / uncertain outcome
```

Persisting an execution intent and its dispatch record together prevents a
committed decision from silently losing its scheduled work. A retry should use
the same operation identity.

A PostgreSQL transaction cannot include a Google Sheets write. A timeout might
mean the write succeeded but its response was lost. The system needs an explicit
uncertain state and reconciliation, not automatic repeated execution.

Preflight reads also cannot completely prevent another sheet editor changing
cells between the read and write. Where the provider cannot enforce a conditional
write, that limitation remains and should shape conflict handling.

Record undo as another linked operation, preserving the original attempt and its
outcome.

## tRPC and TanStack Query

tRPC is useful here because there is existing code it can replace.

`useTrial<T>()` in [trial-parts.tsx](../../components/brunch-orders/trial-parts.tsx)
accepts an arbitrary URL and casts the response to `T`. Several response unions
live in components. [source-store.ts](../../components/app-shell/sources/source-store.ts)
implements its own server-data cache, subscribers, loading states, and request
handling.

tRPC with TanStack Query could replace much of that with:

- Inferred request and response types.
- Zod-validated procedure inputs.
- Consistent error handling.
- Query caching, invalidation, and polling.
- A shared place to establish request identity and authorization context.

For a new implementation, use the current `@trpc/tanstack-react-query`
integration, which tRPC recommends over its classic integration. See the
[official setup](https://trpc.io/docs/client/tanstack-react-query/setup).

Keep routers thin:

```text
React → typed procedure → application operation → database/provider
                               ↓
                       deterministic domain checks
```

The operation should be callable from an API request, a background job, or a test
without knowing about HTTP or React. For example, `approveProposal` should own
authorization, revision checking, validation, and persistence. Its tRPC procedure
should validate the incoming command and delegate.

Two qualifications:

- tRPC's inferred types do not replace runtime validation of model output, stored
  JSON, or provider responses.
- Middleware establishing a logged-in user does not establish permission to
  approve a particular run. Resource-level authorization belongs in the
  application operation too.

Server Actions remain a reasonable simpler choice for isolated form mutations.
Given Safepoint's polling and shared interactive server state, tRPC is the preferred
candidate here. Trial it on source reads first, replacing the custom source cache,
before migrating the more sensitive approval flow.

## Validation and abstraction

Abstract difficult validation while preserving business rules as readable code.

| Boundary                                             | Appropriate mechanism                   |
| ---------------------------------------------------- | --------------------------------------- |
| Does this value have the expected structure?         | Zod                                     |
| Is this operation valid under the process rules?     | Named domain functions                  |
| Can this state remain valid under concurrent writes? | PostgreSQL constraints and transactions |

A schema can establish that an approval contains a proposal ID. It cannot
establish that the proposal is current, the actor may approve it, or its evidence
remains valid.

[checks.ts](../../lib/definitions/checks.ts) and
[shapes.ts](../../lib/definitions/shapes.ts) already contain valuable domain
abstractions. Retain them, organize cohesive responsibilities, and expose clear
entry points.

Drizzle can derive Zod schemas for database shapes, reducing mechanical
duplication. Use that selectively: a database row and an approval command are
different contracts. Its documentation at the time of research includes
release-candidate APIs, so the integration should match the version actually
chosen. See [Drizzle's Zod integration](https://orm.drizzle.team/docs/zod).

Avoid a generic validation framework with configurable rules, registries, and
adapters unless repeated requirements demonstrate the need. A short sequence of
named checks is often easier to understand and debug.

## Project organization

Evolve the existing structure rather than move everything. A restrained target:

```text
app/                         Routes and framework composition

components/
  ui/                        Shared controls
  app-shell/                 Navigation and shared application layout
  brunch-orders/             Process-specific presentation
  review/                    Shared review presentation

lib/
  definitions/               Pure rulebook and formula logic
  runs/                      Run contracts and transitions
  sources/                   Source contracts and transformations
  processes/brunch-orders/   Process-specific declarations
  review/                    Review contracts and derivations
  review-presentation/       Presentation mapping

server/
  api/                       tRPC context and routers
  rulebooks/                 Acceptance operations and persistence
  runs/                      Run operations and persistence
  sources/                   Source operations and persistence
  effects/                   Execution and reconciliation
  jobs/                      Durable job entry points
  db/                        Connection and database schema
  integrations/              Provider adapters

drizzle/                     Reviewed SQL migrations
```

The important change is the dependency direction, not the directory names.
`lib/definitions` should not need filesystem access, database credentials, or
React. Server operations coordinate it with storage and providers. Components
consume application results.

Concrete cleanup opportunities, with sizes measured during this analysis:

- Separate persistence helpers and job orchestration from the 770-line
  `lib/definitions/propose.ts`.
- Split the 1,457-line `components/brunch-orders/rules-step.tsx` by real
  responsibilities: model selection, rule cards, agreement decisions, and
  orchestration.
- Move `ModelSelect` into its own module; other steps currently import it from
  that large screen module.
- Separate generic definition/data contracts from the UI-facing process model.
- Make demonstration lifecycle data clearly identifiable; `run-lifecycle.ts`
  explicitly contains placeholder timing and progress.
- Give persisted run payloads explicit versioned schemas instead of broadly
  accepting `Record<string, unknown>`.

File length is only a clue. A cohesive implementation can remain long. The aim is
to make each change have an obvious home.

Add a short architecture map explaining where to change what, plus enforceable
import rules. The existing architecture guide is already a good starting point.

## Knip and Turborepo

Knip is already installed, configured, and run in CI. During this analysis,
`pnpm check:unused` exited with status 1 and reported three unused exports:

- `pointAt` and `projection` in `components/ui/extrusion.tsx`.
- `WorkingMark` in `components/ui/working-mark.tsx`.

No exports were removed. This is a finding about the working tree on the analysis
date, not a claim about the committed baseline.

Keep Knip in CI. Review the configuration's intentional entry points periodically,
particularly exports retained for future stages. Knip detects unused files,
dependencies, and exports; it does not establish whether the architecture is
understandable. See [Knip documentation](https://knip.dev/).

Turborepo supports single-package repositories too, so it is not technically
inappropriate. Its value would be task orchestration and caching. See
[single-package support](https://turborepo.dev/docs/guides/single-package-workspaces).

There is currently one main Next.js application. Introduce Turbo only when
measured build/check times justify it, or when a separately deployed worker and
shared packages create a meaningful task graph. Creating packages just to use
Turbo would add navigation and configuration overhead.

## Additional tooling

| Tool or capability                 | Recommendation                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Drizzle                            | Add with PostgreSQL persistence.                                                                 |
| tRPC + TanStack Query              | Pilot on source reads, then expand if it removes custom code.                                    |
| Durable execution                  | Add before relying on unattended production runs.                                                |
| dependency-cruiser                 | Consider for dependency rules and cycle detection; start with ESLint restrictions if sufficient. |
| fast-check                         | Consider for formula, calendar, and state-transition invariants.                                 |
| Structured logs and error tracking | Add alongside production execution, with run and attempt IDs.                                    |

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) can validate
and visualize dependencies. That addresses architectural boundaries more directly
than Turbo.

[fast-check](https://fast-check.dev/docs/introduction/) generates inputs and
reduces failing cases. It could complement existing examples with properties such
as “a rejected decision produces no write.”

For durable execution, Inngest is worth a focused evaluation. Its saved steps and
recovery model match multi-stage drafting and proposal generation. Test one real
workflow against restart recovery, cancellation, concurrency, cost, and deployment
requirements before committing. External effects still need idempotency
protection. See [durable execution](https://www.inngest.com/docs/durable-execution)
and [best practices](https://www.inngest.com/docs/durable-execution/best-practices).

Do not add Redux, a comprehensive state-machine framework, another validation
library, or a custom dependency-injection framework during this migration. The
current problems have more direct solutions.

## Biome assessment

Recommendation: keep ESLint and Prettier for the persistence migration. Evaluate
Biome separately as a potential replacement for overlapping tooling, rather than
adding another permanent lint/format pass.

The current configuration is small: ESLint uses Next.js Core Web Vitals and
TypeScript presets; Prettier uses the Tailwind plugin and a CSS print-width
override. There is no measured linting or formatting bottleneck from this analysis.

Biome is a credible consolidation candidate. It provides migration tools and a
Next.js rule domain. Recent documentation also describes Tailwind v4 class sorting
that reads custom themes, utilities, variants, and imported stylesheets through
`tailwind.stylesheet`. It would be inaccurate to dismiss it as lacking Next.js or
custom Tailwind support. See
[migration documentation](https://biomejs.dev/installation/migrate-from-other-tools/),
[rule domains](https://biomejs.dev/linter/domains/), and the
[2.6.2 changelog](https://biomejs.dev/internals/changelog/version/2-6-2/).

Before replacing the existing tools, run an isolated comparison:

- Map the effective ESLint rules, including React Hooks and accessibility checks,
  to the selected Biome version. Identify gaps explicitly.
- Compare formatting and class sorting on representative TSX and the project's
  Tailwind v4 stylesheets, using `app/styles/index.css` as the stylesheet entry.
- Preserve generated-file exclusions, fixture exclusions, CSS formatting choices,
  and intentional suppression comments.
- Measure speed and inspect the resulting diff before deciding whether the
  configuration and maintenance savings justify migration.
- Keep mechanical formatting changes separate from behavioral changes.

Adopt Biome if that comparison demonstrates a simpler setup with adequate rule
coverage. If significant parallel ESLint/Prettier configuration remains necessary,
the simplification case is weaker. Biome does not replace TypeScript typechecking,
Knip's project-wide unused-code analysis, domain tests, or custom colour and rail
checks.

## Suggested delivery sequence

1. **Clarify boundaries and contracts.** Separate server orchestration from pure
   rules, standardize storage errors, identify authoritative state, and extract a
   few overloaded modules. Preserve current behavior.
2. **Prove PostgreSQL with rulebook acceptance.** Import existing revisions without
   changing their identity or content. Make acceptance, revision creation, and
   head advancement transactional. Test simultaneous acceptance and rewriting.
3. **Move operational state to the server.** Persist runs, instruction revisions,
   proposals, decisions, and schedules. Pin every run to its exact inputs.
   Browser-local decisions need an explicit import policy and revalidation; they
   should not silently become trusted historical approvals.
4. **Introduce the typed client boundary.** Pilot source reads, then migrate run
   queries and decisions. Remove replaced caches, response casts, and polling
   implementations.
5. **Make execution recoverable.** Add durable jobs, effect intents, dispatch
   recovery, reconciliation, and bounded retries. Test a crash after the provider
   write but before recording success.
6. **Establish production proof.** Test authorization, concurrent reviewers,
   database migration and restore, worker restarts, stale approvals, and duplicate
   requests. Retain offline model fixtures and existing browser coverage.

For the database cutover, use a validated import with counts and content checks,
preserve the original files, and designate one writer at a time. Uncontrolled
dual-writing would make this transition harder to trust.

The recommended first implementation is **transactional rulebook acceptance on
Neon, preserving existing revisions and proving concurrency behavior**. It is a
bounded piece of work that validates the database design before expanding into
the entire run lifecycle.

## Verification limits

The recommendations are based on source inspection, official documentation
research, and the Knip run described above. The application suite was not run,
and the concurrency and crash scenarios were not reproduced. No production
database, provider connection, or infrastructure was provisioned or changed.
