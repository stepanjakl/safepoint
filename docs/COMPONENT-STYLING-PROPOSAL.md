# Component styling: proposal, independent review, and trial

Status: reviewed and trialled, 2026-09-11. The original proposal (2026-09-10) recommended selective colocated CSS Modules. An independent review ran both that approach and an alternative on the same component, measured them, and recommends the alternative. [STYLING-SYSTEM.md](STYLING-SYSTEM.md) remains the app-wide convention; the trial did not depart from it.

## Problem and desired outcome

Long utility lists make component anatomy harder to scan. The developer wants an editable style definition reachable from JSX, with a component's visual treatment, responsive rules, and states together. Tailwind IntelliSense was reported to fail for `max-shell:py-2.25`, although that class was verified to compile correctly.

Separate editor problems from architecture: fixing hover and autocomplete does not establish Cmd+click navigation to generated utilities. CSS Modules also need suitable editor support for class-definition navigation; verify the actual experience rather than promising it.

Success means clearer component ownership and easier edits for developers and agents, while preserving appearance, responsiveness, accessibility, and shared design tokens. There is no demonstrated agent-performance advantage to BEM itself.

## Original recommendation

- Retain centralized tokens in `app/tokens.css` and shared visual treatments in `app/globals.css`.
- Trial an adjacent `.module.css` file for one component with a cohesive but hard-to-read utility list.
- Prefer meaningful local names such as `root`, `message`, `icon`, and `actions`. BEM optional inside modules.
- Preserve existing state attributes rather than introducing parallel state classes.
- Prefer ordinary CSS declarations using existing tokens over mechanical `@apply`.
- Give each CSS property a clear owner, and decide explicitly how module styles interact with retained utilities and cascade layers.
- Preserve named breakpoint semantics and rem units.
- Keep shared React components as the unit of reuse.

## Independent evaluation

The hypothesis was treated as a hypothesis. Each claim below is marked **measured** or **preference**.

### The two stated problems have different causes

Scanability is an architecture question. The IntelliSense failure is not: the working-tree `.vscode/settings.json` had been reduced to a single key, dropping `tailwindCSS.experimental.configFile`, `files.associations` (`*.css` → `tailwindcss`), `editor.quickSuggestions.strings`, and the `**/.next` exclusions that the file's own comments explain are what keep CSS-variable hovers resolving to `app/tokens.css` rather than to compiled chunks. Those entries have been restored. No architecture change was ever going to fix that, and adopting one to fix it would have been treating a settings regression as a design flaw.

### CSS Modules do not deliver the headline benefit here (measured)

The goal is "an editable style definition reachable from JSX." Asking the TypeScript language server directly, with the module in place:

| Expression | Go to Definition lands on |
| --- | --- |
| `styles.notice` | `node_modules/next/types/global.d.ts:28` — the index signature |
| `NOTICE_FACE` (a TS constant) | `components/app-shell/process-menu.tsx:836` — the definition |

Next declares `*.module.css` as `{ readonly [key: string]: string }`, so there is no per-class declaration to navigate to. Cmd+click leaves the project and lands in `node_modules`. The utility-string constant does exactly what the proposal asked for, and already did before the trial.

Typo safety is weaker than it first appears. Because `tsconfig.json` sets `noUncheckedIndexedAccess`, `styles.notcie` is `string | undefined`, which *is* caught when assigned to a `string`. It is **not** caught in the usage that matters: `className={styles.notcie}` type-checks clean, because `className` accepts `string | undefined`. Verified both ways.

### A module's rules silently outrank every utility (measured)

Next emits CSS Modules **unlayered**. Tailwind's utilities live in `@layer utilities`. Unlayered normal declarations beat layered ones regardless of specificity or class order, so a module rule cannot be overridden from markup.

Demonstrated live: with `py-10` added in JSX beside `styles.notice`, the computed `padding-top` stayed `12px`. The utility was silently discarded. No error, no warning — the same failure mode STYLING-SYSTEM.md already warns about for runtime-built class names, but permanent and invisible.

This is predictable, in that the module always wins. It is also a one-way door: per-instance adjustment from the call site stops working the moment a property moves into the module.

### Translating utilities to CSS is error-prone (measured)

One `text-micro` is three declarations in CSS, because the type role bundles size, line-height, and tracking. The first version of the module also rendered `leading-normal` as `line-height: normal`. That is wrong — Tailwind's `leading-normal` is the ratio `1.5`, while the CSS keyword is font-dependent. The error was **invisible in the rendering**, because both text children re-assert their own line-height, and was caught only by diffing computed styles. A visual check would have passed it.

### The module could not own the component (measured)

`control-face`, `surface-notice`, and the sheen are a shared contract read by several components. Duplicating their declarations into the module is precisely the drift tokens exist to prevent, so the face stayed in markup. The result was the component's styles split across two files rather than gathered into one — the opposite of the goal.

### What the module did well (measured)

`@reference` plus `@variant max-shell` **does** preserve the named breakpoint. The compiled output was `@media not (min-width: 56.25rem)` with no literal threshold in the source. The proposal's concern here was unfounded, and this technique is worth remembering for any future module.

### Cost of a fourth location (preference)

STYLING-SYSTEM.md already sets a sharp test for which of three files a rule belongs in, and warns that "a utility that lands on an element whose other states live in `components.css` will be read as belonging to neither file." A fourth location makes that judgement harder every time, for a system whose main strength is that the judgement is currently easy.

### Revised recommendation

Stay utility-first. Where a class list is hard to scan, group it into a **named constant built from commented, complete string literals**, and resolve property ownership rather than relocating the properties. Reach for a CSS Module only where a component needs rules that markup genuinely cannot express *and* that `components.css` should not own globally — and accept, when you do, that markup can no longer override it.

BEM is not recommended. Nothing measured here suggests it improves agent or human performance, and CSS Modules already provide scoping.

## Trial record

Component: the sidebar notice in `components/app-shell/process-menu.tsx`, the block containing the reported `max-shell:py-2.25`. Both approaches were built on it and measured against the same baseline.

### Method

Computed styles for the box, rail, title, and caption — 25 properties plus bounding rect — captured over CDP in six scenarios: wide and narrow (either side of the 56.25rem `shell` breakpoint), light and dark, forced-colors, and reduced-motion. Plus `pnpm typecheck`, `pnpm lint`, `pnpm build`, and a Prettier check.

### Findings that predate both trials

Two declarations on the notice were dead, and the probes proved it before anything was edited:

- **`border` was doing nothing.** `control-face` declares the whole `border` shorthand and Tailwind emits `.control-face` after `.border`, so width, style, and colour were always control-face's.
- **`forced-colors:border-[CanvasText]` was doing nothing.** The `@media (forced-colors: active), print` block at the foot of `globals.css` is unlayered, so `.control-face { border-color: currentColor }` outranked the layered variant utility. Confirmed in the forced-colors capture: the computed border colour equals the text colour.

A third observation, left unchanged: `leading-normal` on the box is overridden by both text children, which re-assert `text-micro` and so carry micro's tighter 14px line. It is noted in the code comment rather than removed.

### Trial A — grouped constant, utility-first

`SidebarNotice` extracted as an in-file component beside the file's existing `ProcessStatusContent` and `MenuIcon` helpers, with its class list as a `cx()` constant grouped by what each group decides: face, box, type. Both dead declarations removed.

Result: **no computed-style differences in any of the six scenarios.** Pixel diffs were confined to the brand lockup at the top of the sidebar, which was being edited concurrently in another change and which shows the same difference between two captures of identical code. The notice region was pixel-identical throughout. Typecheck, lint, build, and Prettier all clean.

### Trial B — colocated CSS Module

`components/app-shell/process-menu.module.css` with a `.notice` class owning box and type as plain declarations over `--sp-*` and `--text-*` tokens, `@reference` for the theme, and `@variant max-shell` for the breakpoint. The face remained in markup.

Result: appearance preserved **after** the `line-height` bug above was found and fixed. Typecheck, lint, and build clean. The module compiled to a 505-byte unlayered chunk.

### Verdict

| | Trial A | Trial B |
| --- | --- | --- |
| Appearance preserved | yes, first try | yes, after one fix |
| Cmd+click the name | to the definition | to `node_modules` |
| Cmd+click the class | nowhere | nowhere |
| Hover on the classes | yes, via `classFunctions` | yes, it is CSS |
| Typo caught at usage site | n/a | no |
| Markup can still override | yes | no, silently |
| Styles in one place | yes | no, split across two files |
| Named breakpoint kept | yes | yes |
| New concepts introduced | none | a fourth style location |

**Trial A: keep.** It is in the working tree.

**Trial B: revert.** Done; the module file and its import are removed. It failed the requirement that motivated the proposal, and it removes the ability to adjust a component from its call site.

### Changed files

- `components/app-shell/process-menu.tsx` — `SidebarNotice` extracted, `NOTICE_BOX` constant, two dead declarations removed.
- `.vscode/settings.json` — the four deleted entries restored, alongside the newer `cssVarHover.watchedFiles`.
- `docs/STYLING-SYSTEM.md` — the grouped-constant form recorded.
- This file.

### Editor findings, confirmed in VS Code

The developer ran the manual checks. Two results, both now settled:

**Cmd+click on a utility class does not work, in any arrangement.** Tailwind
IntelliSense offers no go-to-definition for class names and no setting enables
it. This is not a defect in either trial; it was never available. It also
retires the idea that CSS Modules would have delivered it — measured earlier,
`styles.notice` navigates into `node_modules`, which is worse than nothing.
What navigates is a **name**: `NOTICE_BOX`, `ICON_SHAPE`, `MENU_LABEL` all land
on their definitions. Naming a class list is the only thing that makes it
reachable, which is an argument for the constant and against the module.

**Hover worked only inside `className="…"`, not in a named constant.** The
cause is `tailwindCSS.classAttributes`, which covers attribute positions and
nothing else. So every class constant in this repo — `MENU_LABEL`, `GRIP_BOX`,
every shape in `process-menu.tsx` — has been without hover all along. That is a
pre-existing hole in the convention, exposed by the trial rather than caused by
it.

The fix is `"tailwindCSS.classFunctions": ["cx"]`, now in `.vscode/settings.json`.
`NOTICE_BOX` was changed from a joined array to a `cx()` call to sit inside it;
`cx()` already exists in `lib/cx.ts` and its output is byte-identical to
`.join(' ')`, so nothing rendered changes. Every other `cx()` call site in the
codebase gains hover at the same time.

A regex over constant declarations was tried first and rejected: apostrophes in
the comments (`control-face's geometry`) break the string extraction, yielding
phantom classes like `"s geometry, the notice"`. Covering a joined array needs
that regex. Covering a `cx()` call needs one setting. That decided the form.

### Limitations

Completion inside `cx()` was not separately confirmed and should behave as hover
does. The remaining checks, after a window reload:

1. Hover `max-shell:py-2.25` inside `NOTICE_BOX`. Expect the compiled rule in
   `@media not (min-width: 56.25rem)`.
2. Type `max-shell:py-` inside a `cx()` string and expect completions.
3. Hover `var(--sp-notice-face)` in `app/components.css` and confirm it resolves
   to `app/tokens.css`, not to a file under `.next`.

Do not infer any of these from a passing build.

## Evidence and relevant skills

- [Tailwind: styling with utility classes](https://tailwindcss.com/docs/styling-with-utility-classes) recommends component reuse for repeated UI and permits custom CSS.
- [Next.js: CSS](https://nextjs.org/docs/app/getting-started/css) supports Tailwind and locally scoped CSS Modules.
- [CSS Modules: local scope](https://github.com/css-modules/css-modules/blob/master/docs/local-scope.md) explains why local classes do not need global namespaces.
- [BEM naming](https://getbem.com/naming/) defines block, element, and modifier relationships; it does not establish BEM as necessary inside CSS Modules.
- [Tailwind directives](https://tailwindcss.com/docs/functions-and-directives) documents `@reference`, `@apply`, and `@variant`.
- [CSS Cascading and Inheritance Level 5](https://www.w3.org/TR/css-cascade-5/#layering) is why unlayered declarations beat layered ones.

Skills are guidance to assess against the task and current official documentation, not votes proving an architecture is best. The measurements above outrank all of them.
