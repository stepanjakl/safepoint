# Embedded review direction

Status: the shell's direction from September 2026, with planned work labelled in each section. It was written around the earlier promotion-release example, which has been removed (recoverable from the tag `archive/promotion-prototype`); where a section still describes that example's evidence files or its release card, read it as history. `lib/shell/routes.ts` has the current route list. It supersedes the standalone-first composition in the [Stage 1B brief](../archive/STAGE-1B-BRIEF.md), [experience specification](../archive/EXPERIENCE-SPEC.md) and [Fable handoff](../archive/FABLE-VISUAL-DIRECTION.md).

Safepoint appears as a compact review response in an existing conversation. It expands into a focused review surface and eventually returns a durable result to that same conversation. The conversation provides context; the structured change set defines what a person reviews.

## Process navigation and brand

Status: implemented, 9 September 2026. Use the canonical [product terminology](../product/PRODUCT-BRIEF.md#product-terminology).

### Menu hierarchy

The demonstration has two functioning menu levels. The root contains one **Processes** entry with a process icon, a rounded count badge, and a right chevron; there is no Workspace label. Opening it reveals the process list. A left chevron, labelled **Back to menu**, sits beside the centred **Processes** heading and returns to the root. Start on the process level when opening an existing process route so the current selection is visible.

The two Brunch orders processes appear in the process list. The development state gallery is not listed among processes. The root level remains intentionally minimal.

Changing menu levels preserves the open review, selected process, and saved order. Entering Processes slides the menu content to the left; returning to Workspace reverses the direction. Keep the brand stationary and clip motion to the menu viewport. The transition takes 220 ms and respects reduced-motion preferences. Only the active level is interactive and exposed to assistive technology. Keyboard focus follows the level change and returns to the Processes entry when going back; rapid direction changes must not leave duplicate controls or stranded focus.

### Process list

The section heading is muted uppercase with a fine divider. Process rows use the same semibold weight in every state, with slightly muted default text, darker active text, a subtle hover background, and a stronger active background. Rows are 40 px tall on a 42 px pitch. The back control uses a simple SVG chevron. A blue information box with an information icon explains that the workspace uses fictional replay data and makes no live changes.

In normal mode, hovering highlights a row and clicking or pressing Enter opens its available run. Hover never opens a session. Keep the current process visibly selected. The existing replay slice only supplies the current recorded run; earlier placeholder runs must not appear newly navigable.

**Add process** and **Arrange processes** sit to the right of the logo. Add process remains an explicitly unavailable preview placeholder. Hovering or keyboard-focusing Arrange processes previews all drag handles without enabling dragging or disabling links. Clicking it enables ordering, makes all handles available, applies the primary control style, and changes its accessible name and tooltip to **Save order**. Clicking Save order confirms the browser-local order. There are no separate ordering tools or Cancel button; handles support pointer dragging and Up/Down/Home/End keys. Returning to the root preserves an unfinished draft. There is no menu-announcement section. If browser storage is unavailable, the order is kept for the current visit.

Action tooltips use concise names; status tooltips retain the detailed run breakdown. Status shapes are paired with the blocked count for blocked runs, or the total item count otherwise. The Processes heading highlights as a group on hover, with a lighter chevron surface. A divider sits directly below search.

A search field beneath the brand filters process names case-insensitively and includes an empty state. At the root it filters the Processes entry. Changing menu levels clears the query. Entering Arrange mode clears the query and temporarily disables search, so ordering always operates on the complete list.

The profile footer contains Maya’s name, a deterministic `@outpacelabs/avatars` gradient avatar and a three-dot **Settings** placeholder. The fictional Maya seed uses teal, cyan, blue and zinc colours. The blue replay information box remains above it.

A compact coloured status shape retains its space when the process name overflows. The accessible name includes the process and status; hovering or keyboard-focusing it opens a structured tooltip on the right, with automatic placement fallback at narrow widths. The tooltip contains a status pill, labelled review counts, and replay context. Derive its information from the same review data as the main panel. Explain the latest available run's status and relevant counts in its tooltip, retaining replay context. Reveal a truncated process name in full on hover and keyboard focus. Essential status information remains available without hover, including on touchscreens.

### Shared brand component

The shared `Brand` component replaces the boxed `s.` mark with a teal pill containing the favicon's existing white checkmark geometry on the left and **SAFEPOINT** on the right. It uses Nunito at weight 800, 11 px, with 0.12 em tracking, independent of the development typeface selector. Next.js loads and self-hosts the font. The pill and favicon share teal `#007c78` with a white checkmark. No glyph distortion is used. The uppercase brand is an intentional exception to normal sentence-case interface labels.

### Shared tooltip component

The shared `Tooltip` component serves navigation names, the icon-only toolbar controls, status shapes, and connected-system discs. Every tooltip uses a placement-aware rounded arrow with curved shoulders. The arrow and tooltip share a solid surface, outer edge and inset highlight, avoiding colour seams. The arrow sits one pixel farther out from the original rounded treatment. Rich content is optional, so short control hints retain the compact treatment. Its restrained entrance and exit motion takes inspiration from the [Ariakit Tooltip with Motion example](https://ariakit.com/examples/tooltip-framer-motion). Placement, spacing, surface, typography, dismissal, and reduced-motion behavior are consistent across consumers. Hover uses a 350 ms warmup and a 150 ms close delay; keyboard focus opens immediately. `OverflowTooltip` measures the rendered label and only reveals a name tooltip when it is truncated.

The implementation uses the installed React Aria components. Ariakit supplies unstyled primitives and flexible composition through its `render` prop; its linked example adds Motion for animation. [React Aria supports custom styling and animation](https://react-aria.adobe.com/styling), so reproducing this interaction does not require a second accessibility library. React Aria entrance/exit states drive CSS opacity/transform animations. The menu and reorder preview also use CSS transforms; no additional animation or accessibility dependency is required.

Tooltips open on hover and keyboard focus, dismiss on Escape, stay within the viewport, and remain hoverable. Keep accessible names on their triggers and associate supplemental descriptions without duplicate announcements. A tooltip is supporting information, not the only means of identifying a control or understanding a blocking status.

### Verification

Automated browser checks cover menu navigation, rapid reversal and focus restoration, current-route highlighting, pointer and keyboard reordering, Escape drag cancellation, unfinished draft preservation, persistence across routes/reloads, unavailable browser storage, 320 px and 390 px layouts, truncated names, hover/focus tooltips, Escape dismissal, hoverable tooltip surfaces, and reduced motion. Light and dark layouts were visually inspected. Unit tests cover malformed saved preferences, changed process lists, reorder boundaries, and statuses derived from actual review plans. These checks do not replace testing with assistive technology.

## Process header and setup

Status: direction agreed 15 September 2026. The editable title, setup drawer, side panel, Settings tab, and the Inputs and Outputs header buttons and tabs are implemented. Use the [product terminology](../product/PRODUCT-BRIEF.md#product-terminology).

The portfolio has no live source systems. A run's **inputs** are its JSON evidence files: analysed extracts that serve as the run's source of truth, produced and updated outside Safepoint. Its **outputs** are the APIs the process may call once changes are approved. The header and the setup drawer describe both for what they are, as the recorded run used them.

### Header

One row, flush with the notch: the process title, then the controls for the process itself — **Instructions** with its version, **Inputs** and **Outputs** — and last, in the notch, the **Assistant**.

The row divides by who is speaking. The pills belong to the process being read and share one construction; the assistant belongs to the application and sits in the notch, where the slanted shape rather than a colour of its own is what sets it apart. It is also where anything global goes later: it is on every screen, whatever the screen is about.

The **title** is an input dressed as the heading. Pointing at it shows a field face lighter than the sheet; clicking places the caret at the end of the name. Enter or leaving the field keeps a change, Escape restores the name, and an empty name keeps the old one. The name is shared with the sidebar and the drawer.

The two buttons replace the stacked system discs, which named systems without saying what they were:

```text
Brunch orders   [⇥ Inputs 4]  [⇄ Outputs 1]   ╱ Instructions v3 ╲
```

- The four sit in one group, which carries the face: a pill lit from below, where every other face in the interface is lit from above, so a container reads as a container rather than as one very wide button. An item inside it is transparent at rest, takes a face under the pointer or keyboard focus, and takes a darker one while its tab is the one the drawer is showing.
- Labels go before the row runs out of room, counts and icons stay, and below the phone breakpoint the group gives way to the name entirely.
- **Inputs** shows its icon, the word, and the number of input files. When a file is older than the policy's maximum evidence age or holds unavailable records, a dot in the condition's colour follows the count; the button's accessible name says how many and which condition.
- **Outputs** shows its icon, the word, and the number of APIs.
- **Settings** is the same control without the word: it is reached a few times in a process's life where the others are read every run, so it keeps the face, drops the label, and carries its name in a tooltip and its accessible name. It opens the Settings tab. Adapter mode is not a header state: which calls are simulated or preview only belongs to the Outputs tab, beside what each call does and how it is undone.
- A condition never borrows the review's marks. Square and triangle mean a held line and a line needing attention; a stale file is neither, so the header carries a dot, the lists carry the disc's ring, and the words stay in the rows.
- Both describe the recorded run's data. There is no live source, so there is no "next run" readiness to report.
- State is never carried by colour or shape alone: each button's accessible name states its counts. As the row narrows the labels go, then the counts; at phone width the buttons give way to the name altogether, and their tabs are reached through the drawer.

### The sheet's tabs

The menu chooses what the sheet shows: the **Run** — the list of runs beside the thread of the current one — or one of **Instructions**, **Inputs**, **Outputs** and **Settings**. There is no drawer. A modal was being used as a menu: it blocked the page, trapped focus, and every screen inside it is a list beside a detail, which is a shape that wants a page.

A tab is state, not a route: it is a way of looking at one process rather than a place to link to. The run is built on the server and handed to the sheet, so choosing a tab never re-fetches it, and returning to the Run finds it as it was.

Panels replace the run entirely, rail and all. The rail lists runs, which is the run's own furniture, and the panels need the width.

Each panel is a list beside a detail, and the detail is the same panel the drawer used — its swap, its direction and its focus handling unchanged. Choosing another item swaps the content in place; the control that opened it closes it again; Escape closes it. Where a tab's rows open nothing — Outputs, Settings — the list takes the full width rather than holding a column open for nothing. Below the two-column width the detail takes the list's place.

#### Instructions tab

The current text, what changed between versions, the editor, and the version history. It does not list policy rules, which are an input, or the parts of every instruction that the server adds, which are documented under [Fixed input](../archive/TECHNICAL-DESIGN.md#fixed-input).

#### Inputs tab

Opens with one line saying what inputs are: the JSON files the run read, each an analysed extract treated as the source of truth, produced outside Safepoint. Then one row per file — nine in the promotion scenario — named for what the file holds rather than for a system:

```text
INPUTS 9                                              + Add input · Preview
Campaign brief         promotion-brief.json · 1 record
▲ Supply position      1 of 27 records unavailable
Policy rules           Version promotion-release-policy-v1
```

- A row gives the file, its record count, and when it was observed, or the condition that needs attention. Two conditions apply: freshness, when records are older than the policy's maximum evidence age at the review time, and coverage, when records are marked unavailable. Policy rules show their version instead of an age.
- Opening a row shows its detail in the side panel: the file, observed time or version, record count, the review items and checks that cite it, and **From** — the source labels recorded in the file, as provenance. Records can be filtered and each keeps its raw JSON one disclosure away.
- Adding and removing an input is a **Preview**: saved in the browser, limited to the scenario's own files, and changing no recorded run, review, or citation.

#### Outputs tab

Opens with one line saying what outputs are: the APIs the process may call once changes are approved. One row per API gives what it changes, the API, its adapter mode — live sandbox, simulated, or preview only — and how a call is undone, in consequence language such as "Restores automatically if the row has not changed again". Outputs cannot be added or changed.

#### Settings tab

In the order it is reached for: the name, the schedule (the same control and store as the runs rail), notifications, and last archive or delete. Archive is the ordinary way to end a process: it stops the schedule and hides the process but keeps its runs and reviews. Permanent deletion takes the record of what runs changed with it, so it is only for a process that has never run. The name and schedule are saved in the browser, and nothing starts a run from the schedule; notifications, archive, and delete are unavailable placeholders.

### Future

Live source systems belong to the future-product track: workspace connections, field mapping, snapshot history, access and reconnection, a guided flow for adding an input, and a map view of inputs, process, and outputs. See [Read path: from connection to snapshot](../archive/TECHNICAL-DESIGN.md#read-path-from-connection-to-snapshot). Editing policy, with a preview of its effect on the latest run, needs the deterministic policy engine and is also Future.
