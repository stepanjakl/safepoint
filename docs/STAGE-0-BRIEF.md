# Safepoint Stage 0 brief

Status: ready for Fable proposal, then implementation review

Audience: the model scaffolding the first application slice and the model reviewing its diff

## Outcome

Create a small, modern, understandable application foundation that a junior software engineer can run and inspect. Stage 0 proves only that the repository has a healthy web-development toolchain. It does not begin the Safepoint domain or integrations.

## In scope

- Node.js 24 Long-Term Support (LTS).
- An exact current stable pnpm 10 patch recorded in `packageManager`.
- Next.js App Router with the current stable React version.
- Strict TypeScript.
- Tailwind CSS using its current version-matched Next.js setup.
- ESLint, Prettier, type-checking, and Vitest commands.
- One restrained landing page that identifies Safepoint and links to the public project documentation.
- A secret-free `.env.example` containing comments or variable names only if Stage 0 genuinely needs them. An empty file is unnecessary.
- Concise run instructions in the root README if the scaffold introduces commands not already documented.

## Out of scope

- The 27-line scenario, proposal schema, replay fixture, review workspace, effects rail, themes, or state workbench.
- React Aria Components, Zod, Playwright, axe-core, AI SDK, AI Gateway, Neon, Drizzle, Workflow SDK, Google APIs, or connector packages.
- Authentication, sessions, API routes, database schemas, workflows, model prompts, tools, adapters, registries, or deployment configuration.
- Empty directories or placeholder interfaces for later milestones.
- A component library, state manager, data-fetching library, animation library, Storybook, or additional testing framework.
- Changes to the product or architecture decisions in `docs/`.

## Expected shape

Use the framework's ordinary project layout and keep routing files thin. A reasonable Stage 0 tree is:

```text
safepoint/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── public/                 Only assets actually used by the page
├── .env.example            Only if a real Stage 0 variable exists
├── eslint.config.*
├── next.config.*
├── package.json
├── pnpm-lock.yaml
├── postcss.config.*
├── prettier.config.*
├── tsconfig.json
└── vitest.config.*
```

This is guidance, not a requirement to create every listed file. Prefer framework defaults where they are clear, and remove unused starter assets or styles.

## Engineering constraints

- Inspect the repository before scaffolding and preserve all existing documentation, local skills, ignores, and user changes.
- Use current stable package releases. Check official, version-matched documentation rather than copying old examples. Do not use beta, canary, or release-candidate versions.
- Set `engines.node` to `24.x` and `packageManager` to an exact pnpm 10 version.
- Keep dependencies and configuration minimal. Every installed package must be used by a Stage 0 file or command.
- Prefer explicit scripts such as `dev`, `build`, `lint`, `typecheck`, `format`, `format:check`, and `test`.
- Do not invent a meaningless test for coverage. It is acceptable for the Stage 0 test command to report that no tests exist successfully; Stage 1 adds the first meaningful fixture test.
- Do not weaken strict TypeScript, lint, or framework checks to make the scaffold pass.
- Use British English in user-facing copy.
- Do not initialise, rewrite, reset, or commit Git history.

## Acceptance criteria

From a clean checkout with the documented Node and pnpm versions:

1. `pnpm install --frozen-lockfile` succeeds.
2. `pnpm dev` starts the application without an environment secret.
3. `pnpm build` succeeds.
4. `pnpm lint` succeeds.
5. `pnpm typecheck` succeeds.
6. `pnpm format:check` succeeds.
7. `pnpm test` succeeds.
8. The landing page is readable at narrow and wide viewports and has a visible keyboard focus style for its link.
9. `git diff --check` succeeds.
10. No later-stage package, empty abstraction, credential, generated cache, or unrelated documentation change appears in the diff.

## Fable hand-off prompt

Copy the text below into Fable together with this repository.

```text
You are proposing Safepoint Stage 0 only.

Read these files first:
- docs/STAGE-0-BRIEF.md
- docs/README.md
- docs/TECHNICAL-DESIGN.md, only the Selected stack and Architecture boundaries sections
- TODO.md, only Working rules, Stage 0, and Fable and Codex collaboration

Before writing code, return:
1. the exact files you propose to add or change;
2. the exact production and development dependencies, with why each is needed now;
3. the package scripts;
4. any departure from docs/STAGE-0-BRIEF.md;
5. the commands you will run to prove the acceptance gate.

Keep the proposal concise. Do not design Stage 1 or add code “for later”. Do not change canonical documentation. Call out any existing uncommitted files you need to preserve.

The review question is: is this the smallest clean scaffold that satisfies every Stage 0 acceptance criterion without creating hidden coupling for later stages?
```

## Collaboration sequence

1. Fable proposes the Stage 0 file and dependency plan using the prompt above.
2. Codex reviews that proposal against this brief and the canonical documents.
3. One model implements the agreed Stage 0 diff.
4. The other reviews the diff, lockfile, commands, and test output.
5. The implementer fixes blocking findings and reruns every acceptance command.
6. Stage 1 receives a new brief; it is not appended to the Stage 0 implementation.

The hand-off should include changed files, command output, known limitations, and the exact review question. One model owns the implementation at a time.
