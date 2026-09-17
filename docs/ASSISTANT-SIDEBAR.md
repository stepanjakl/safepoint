# Assistant sidebar preview

The Assistant button opens a right-hand panel on the navigation canvas. This is
an interface preview: suggested prompts fill the editable composer, but Send is
disabled and no request is made. The draft remains in memory across panel closure
and dashboard navigation, and is cleared by reloading the page.

At 80rem and above, the panel occupies a third shell column. Its preferred width
is 20rem, bounded by 17.5rem and 30rem, with a viewport cap that leaves 40rem for
the sheet. Below 80rem it becomes a dismissible modal overlay. Below 56.25rem it
uses the available viewport width and has no drag handle. The overlay follows
the visual viewport so a virtual keyboard does not leave the composer below it.
The runs rail and process detail columns respond to the sheet container width.

## Shared interaction

`sidebar-resize.tsx` contains `useResizableSidebar`, `SidebarResizeHandle`, and
`SidebarSizeProbes`. The controller accepts a side, accessible label, current
preferences and a change callback. CSS probes supply the limits and rem scale;
callers own the layout and persistence. The shared grip owns tooltips, width
presets, keyboard input and the mirrored arrow paths.

Both sides retain hover intent, a grip-only pointer tooltip, neutral initial
drags, threshold crossing cues, minimum-width snap, cancellation, and suppression
of hover immediately after release. Click toggles immediately; Alt-click and
Alt+Enter reset without toggling first. Left/right arrows move the boundary in
the corresponding physical direction. Home/End choose minimum/maximum. Shift+F10,
right-click, or touch-and-hold opens the presets. Escape cancels an active drag
before it can dismiss the assistant.

The assistant's grip disappears when it closes; only the Assistant button
reopens it. Navigation retains its existing closed grip and search shortcut.
Width transitions use the same duration and easing as the sheet, and direct
manipulation has no animated lag. Reduced motion is respected.

## State and focus

Navigation keeps `safepoint.sidebar.v1`. Assistant width and open state use
`safepoint.assistant.v1`, with a closed default and independently validated
preferences. Temporary viewport clamps do not overwrite the preferred width.
Invalid storage defaults safely; blocked storage uses an in-memory fallback.

The shell context connects the nested Assistant button to its panel while
keeping server-rendered children opaque. Opening focuses the composer; closing
returns focus to the opener when appropriate. The dock is non-modal, and the
narrow overlay uses React Aria's modal focus management and backdrop dismissal.

## Verification

With `pnpm dev` running:

```
pnpm check:sidebars
pnpm check:rail --route / --level all --self-test
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```

The sidebar check launches a fresh Chrome profile. `CHROME_BIN` overrides the
Chrome executable and `SIDEBAR_TEST_URL` overrides the dashboard URL. It exercises
both panels, reset animation frames, hover intent, width constraints, drafts,
persistence, keyboard focus, responsive modes, and storage failure. Screenshots
are written to the system temporary directory. Native mobile keyboard behavior
and Safari/VoiceOver still require manual device testing.
