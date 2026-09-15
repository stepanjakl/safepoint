# Adjustable sidebar

Accepted direction: a handle attached to the sheet's left edge. It reveals on
hover or keyboard focus, adjusts the navigation width on drag, and collapses
navigation on click. The grip is centred vertically and drawn as one continuous,
rounded stroke, with a shallow bend and no background. It stays straight at rest
and at the beginning of every drag. Starting open, the arrows activate only after
crossing the close threshold; starting closed, only after crossing the open
threshold. Once activated, left/right indicate the release state for the rest of
that drag, even when reversing direction. The next drag starts straight again.
The closed handle points right on hover. After a drag release, hover waits for
actual pointer movement so the settling sheet cannot briefly flip the arrow.
The stroke is 36px tall, with the softer muted-strong color on hover. Keyboard focus lights it as hover does.
When hidden, the straight resting grip remains visible so reopening is discoverable.
The menu's existing top row gains no icons.

## Implementation plan

1. Introduce a small client shell around the existing server-rendered menu and
   sheet. Keep navigation content and scroll state mounted across collapse.
2. Define widths in the token system: 14rem minimum, 15.625rem default and 21rem
   maximum, capped near the desktop breakpoint to protect the sheet's space.
   Read the browser-resolved geometry for pointer and keyboard bounds.
3. Separate pointer clicks from drags, capture the pointer, and support Escape
   and cancellation without saving a partial gesture. Persist completed width
   changes and collapse state locally; tolerate invalid or unavailable storage.
4. Move the sheet over 220ms. Fade the menu out early when closing and in after
   opening has begun, using the existing 150ms state duration. Keep text at its
   natural size. Below the normal minimum width, let the sheet cover the menu
   and drive its opacity directly from the drag position. Direct dragging and
   reduced motion have no animated lag.
5. Make the edge a named vertical separator: arrows resize, Home/End select
   limits, Enter/Space collapse or restore. Provide Compact/Default/Wide through
   right-click, touch-and-hold or Shift+F10. Keep the handle visible for touch.
6. Below the shell breakpoint, restore the stacked navigation and hide the
   separator without overwriting the desktop preference.
7. Check live pointer, keyboard, persistence, responsive and motion behavior;
   run the rail checker at each menu level plus lint, typecheck, formatting and
   the test suite.

## Design details

- A small gutter remains when collapsed, solely to hold the reopen control.
- Ordinary widths remain bounded, but the sheet can be pulled over the menu all
  the way to the closed gutter. The release threshold is halfway between that
  gutter and the minimum open width (119px at the default text size). At or below
  it, release closes; above it but below the minimum, release snaps open to the
  minimum width (224px at the default text size). A release within the normal
  width range saves that new width. The right-pointing grip previews a snap open.
- Closing preserves the last open width. Dragging right from the closed edge uses
  the same threshold to reopen. Escape and pointer cancellation restore the state
  from before the gesture. Releasing a drag never becomes an additional click.
- Double-click opens at the design default width (250px at the default text
  size). The Default width preset provides the same action without double-clicking.
  Pointer single-click waits 350ms so the edge stays under a second click;
  keyboard activation remains immediate. A second click, drag, focus change,
  keyboard action or unmount cancels any pending single-click.
- Sidebar icon geometry remains owned by its existing rail cells and axes.
- Width and collapse preferences are local to the browser and shared across
  routes/tabs. They are presentation preferences, never navigation URL state.

## Validation completed

- Release-hover checks pass: stationary-pointer events and animated settling
  keep the grip neutral; actual pointer movement restores the hover arrow.
- Lint, typecheck, formatting and all 65 existing tests pass.
- Chrome interaction checks pass for click/restore, pointer resizing, Escape
  rollback, keyboard bounds, presets, reload persistence, invalid/unavailable
  storage, cross-tab focus restoration, touch-and-hold and pointer cancellation.
- The centred continuous stroke, closed hover direction, live covering/fading,
  releases on both sides of the close threshold, and drag-to-reopen pass browser
  checks. The menu is inert during direct manipulation.
- Snap-open direction and minimum-width release pass from both a wide sidebar
  and a closed sidebar. Real pointer double-clicks reset both open and closed
  states without an extra delayed toggle; keyboard and drag cancellation also pass.
- The existing Cmd/Ctrl+K shortcut restores a hidden sidebar before focusing
  search. Reduced motion disables the transition.
- Checked the 600px stacked layout and the 900px desktop threshold, including
  returning to the remembered width at 1440px. Reviewed expanded/collapsed
  dashboard screenshots in light and dark themes.
- Rail self-checks pass across Processes, Arrange and Workspace at default,
  compact and wide widths. The existing deliberate Add-process offset remains
  allowed; no rail coordinates or offsets were changed.

The development motion picker defaults to 5× slower playback. Set it to Normal
to assess the intended 220ms transition; the implementation follows that picker.
Browser automation covers Chrome; native Safari/VoiceOver and physical touch
devices have not been manually tested.
