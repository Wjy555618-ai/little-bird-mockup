# Restrained motion system QA — 2026-10-30

> Historical QA snapshot. Its original “hover never rotates” conclusion was
> superseded on 2026-10-31 after the product requirement and hit-testing root
> cause were re-established. The current binding hover contract is
> `docs/CONTENT_LIFECYCLE_HOVER_ROOT_CAUSE_2026-10-31.md`; evidence and pass
> counts below describe the older build only and cannot approve the current one.

## Motion contract

- Motion character: short, stable, decelerating, and without bounce. Catalog
  hover alone samples one random direction and magnitude per genuine entry;
  the sampled value remains constant for the whole dwell.
- Micro feedback: 120 ms.
- Popovers and state changes: 180 ms.
- Panels and content changes: 220 ms.
- Direct manipulation stays one-to-one: stage pan, content drag, handles, ranges,
  resize, and trackpad input must not be eased or delayed.

## Superseded root-cause conclusion

This snapshot attributed the shaking to random rotation. The later root-cause
audit showed the actual defect was applying the transform to the pointer hit
target (plus scaling), which moved its own boundary. Random rotation remains a
valid visual behavior when it is isolated on a pointer-transparent inner layer.

## Acceptance inventory

- [x] Historical build: catalog hover did not move its hit target. Its
  no-rotation behavior is not a current acceptance requirement.
- [x] Rapid pointer sweeps across all four cards remain visually stable.
- [x] Mode changes use one restrained panel transition with no layout jump.
- [x] All / Similar and category changes animate the new result set once.
- [x] Re-selecting a mockup does not rebuild and flash the whole card grid.
- [x] Mockup preview replacement fades without delaying pointer interaction.
- [x] Source popover, crop toolbar, toast, and rendering state enter and exit smoothly.
- [x] Edit outline and handles appear and disappear without a hard cut.
- [x] Zoom buttons and Fit settle smoothly; drag, wheel, and pinch stay immediate.
- [x] Buttons expose quiet hover and pressed feedback.
- [x] `prefers-reduced-motion` removes transitions and animations.
- [x] Browser harness and Figma Desktop both show the intended motion behavior.

## Evidence

### Browser harness

- Chromium, `1440 × 1000`: eight rapid sweeps across all four cards produced a
  maximum bounding-box delta of `0 px`. Every sampled hover transform was the
  identity matrix; no rotation, scaling, translation, or hit-target movement.
- At `70 ms` into the catalog-to-adjust switch, both panels were participating
  in the same transition (`0.243` outgoing opacity / `0.757` incoming opacity).
  The final state hid the outgoing absolute panel without changing layout.
- Similar-result cards were visibly mid-entry at `55 ms` (`0.729` opacity,
  `1.35 px` remaining vertical travel) and settled once.
- A rapid mockup sequence ending on `rock-phone-front` left exactly one active
  card and kept all four original grid nodes connected; selection did not
  rebuild or flash the catalog.
- Source popover, edit outline/handles, and crop toolbar were sampled mid-motion
  and completed in their visible states. A final rapid hide/show regression
  check confirmed the visibility revision guard leaves no stale animation frame.
- Programmatic zoom was `1.083` at `70 ms` and settled at `1.1`. Pointer-down
  removed the animation class immediately; the following direct drag moved the
  stage exactly `60 × 30 px`.
- Gesture arbitration still passes: an inactive content drag moved the stage
  `70 × 25 px` without selecting the edit frame; after a short click, dragging
  changed content points while the stage stayed at the identity transform.
- Reduced-motion context reported `0s` panel/card transitions and `animation:
  none`. The fixed shell also fit a `900 × 700` viewport with no document
  overflow and with the stage plus action bar inside the viewport.

### Figma Desktop

- Closed and reopened the final local build from **Plugins → Development →
  Mockup Studio** in `/Applications/Figma+EX.app`.
- Verified catalog, adjustment, and perspective modes; source popover open and
  close; and animated zoom reaching `110%` in the real plugin host.

### Automated checks

- `pnpm build`: pass.
- `pnpm check`: `28 / 28` tests pass, including restrained motion, stable hover,
  reduced motion, and the prior gesture-arbitration regression.
- `git diff --check`: pass.

### Visual artifacts

- `docs/evidence/2026-10-30-motion-stable-cards.png`
- `docs/evidence/2026-10-30-motion-mode-transition.png`
- `docs/evidence/2026-10-30-motion-editor-state.png`
- `docs/evidence/2026-10-30-motion-900x700.png`
- `docs/evidence/2026-10-30-figma-motion-system.png`
