# Preview gesture arbitration QA — 2026-10-30

## Root cause and intended behavior

The design hit area previously selected the design and captured every primary-button
pointerdown. That made a press-drag over the preview content move the design instead
of panning the stage.

The shared gesture contract is now:

- Inactive design, movement under 6 CSS px, then release: select the design.
- Inactive design, movement of 6 CSS px or more: pan the stage and remain inactive.
- Selected design: drag moves the design as before.
- Crop mode: drag continues to move the crop content; handles continue to resize it.

## Acceptance inventory

- [x] Inactive short click selects and reveals the edit frame.
- [x] Inactive press-drag pans the stage without revealing the edit frame.
- [x] Inactive press-drag does not change content geometry.
- [x] Selected drag changes content geometry without panning the stage.
- [x] Double-click still enters crop mode.
- [x] Crop drag and resize handles still operate.
- [x] Background, Space-drag, middle-button drag, and trackpad navigation still pan.
- [x] Interaction remains usable above 100% zoom, including the reported 155% case.
- [x] The canvas keeps at least 10% visible after navigation constraints apply.
- [x] Browser harness and Figma Desktop both keep a drag continuous across the transformed canvas.

## Exploratory checks

- [x] Release just below the threshold selects; movement just above it pans.
- [x] Dragging across content and canvas boundaries does not stop mid-gesture.
- [x] Pointer cancel is explicitly excluded from the click-to-select completion branch.

## Current-run evidence

Browser harness at exactly 155% zoom:

- Inactive drag changed the stage transform from `translate(0px, 0px)` to
  `translate(120px, 90px)` while the design polygon stayed byte-for-byte identical
  and the editor stayed inactive.
- A short click switched the editor to `is-selected` without changing the stage.
- The following selected drag changed the design polygon while the stage remained
  at `translate(120px, 90px)`.
- A 4 px movement selected; a 7 px movement panned and stayed inactive.
- Space-drag, middle-button drag, background drag, and wheel pan all changed only
  the stage as intended.
- Extreme wheel pan was clamped to 11.01% horizontal and 11.00% vertical visibility.
- Double-click entered crop mode; crop drag and a visible corner handle changed the
  crop frame.

Figma Desktop (`/Applications/Figma+EX.app`) at 150% zoom:

- Inactive drag across the imported Figma selection moved the entire preview and
  never displayed the edit frame.
- A short click displayed the dashed frame and eight handles.
- A following drag moved that frame relative to the stationary mockup screen.

Evidence files:

- `docs/evidence/2026-10-30-gesture-pan-without-selection.png`
- `docs/evidence/2026-10-30-gesture-selected-content-drag.png`
- `docs/evidence/2026-10-30-gesture-crop-regression.png`
- `docs/evidence/2026-10-30-figma-gesture-pan-without-selection.png`
- `docs/evidence/2026-10-30-figma-gesture-selected-content.png`
