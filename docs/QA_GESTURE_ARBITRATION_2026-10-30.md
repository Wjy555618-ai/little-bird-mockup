# Preview gesture ownership QA — superseded and reverified on 2026-10-31

## Retired decisions and evidence

The 2026-10-30 threshold arbitration and the later `DEV-B4F9F583E6` / `DEV-6060F453DF` evidence are not current acceptance evidence. Threshold arbitration could reclassify an unselected content drag as stage navigation; old host QA also compared intermediate geometry instead of final composited pixels.

## Current ownership contract

- Primary-button input beginning on content owns selection and content editing for the whole gesture.
- At full aperture, blocked frame motion pans the covered source image; it must not become visually inert.
- Any of the eight handles owns proportional content resize, or perspective editing while perspective mode is active.
- Double-click enters crop mode. Crop move/resize changes `contentFrame` while `imageFrame` stays stationary.
- All rotated content-frame corners remain inside the physical aperture.
- Free-perspective points are inverse-mapped to the physical aperture, clamped to UV `0…1`, and mapped back.
- Blank-stage primary drag, Space-drag, middle-button drag and wheel/trackpad gestures own stage navigation.
- Gesture ownership never changes after a movement threshold.

`directPanThreshold`, the `pending` intent and content-side `pan` intent are deleted. The same canonical geometry now drives user pixels, hit testing, selection and crop overlays.

## Geometry baseline and final host evidence

In `/Applications/Figma+EX.app`, geometry baseline build `DEV-C91017E6F8` was exercised at 300%. Those screenshots remain historical evidence for the crop/perspective boundary model, but they are not the current plugin identity. Host-validated promotion build `DEV-10A37155360B` then re-ran the user-reported regression paths in the same host. The older broader gesture run remains supporting baseline evidence only; later governance-only fingerprint changes are not represented as new host evidence:

- Four existing assets completed crop edge resize and extreme frame movement; frames stopped at their physical apertures and user pixels did not remain outside the frames.
- The tilted laptop perspective point rejected an outward drag, accepted an inward drag, and clamped back to the physical screen boundary.
- The monitor completed primary selection, gesture-owned double-click crop entry, crop completion and ordinary move.
- The ordinary move was undone, redone and undone again; every state change was visible in the composited pixels.
- Backspace removal returned the mockup to its default no-content screen; Command-Z restored the selected content; Command-Shift-Z removed it again; a final Command-Z restored it.
- A full-aperture primary drag changed the final visible source pixels while keeping the physically contained frame fixed.
- At 300%, wheel navigation moved the stage entirely away while adjustment values stayed unchanged; Reset returned the stage and content to their default fit.
- Paste to canvas produced success receipts in both the plugin and Figma and selected a new 1200 × 900 image layer.
- A real Chrome Canvas 2D invariant covers rotated frames, boundary crops and free perspective across all four assets (12 final bitmaps) and requires zero user-color pixels outside the final projected control frame.
- Asset hover was exercised through repeated pointer exits and entries. The card visual tilted while its outer grid slot stayed fixed, the dwell state did not drift, re-entry resampled, and no hover outline or cursor-position tracking occurred.
- Right-edge crop changed only the horizontal boundary; bottom-edge crop changed only the vertical boundary. The imported Figma selection remained the content source, no purple/pink corner or aperture leakage appeared, and Reset restored the default state.
- The current plugin suite is 39/39 and the asset-pipeline contract gate passes. After the human-approved r3 batch was atomically promoted to local production catalog `2026.10.31.5`, the full suite passed 103/103 with no failures or skips.

Geometry root cause and evidence: `docs/CROP_GEOMETRY_ROOT_CAUSE_2026-10-31.md`. Current content/command/hover root cause: `docs/CONTENT_LIFECYCLE_HOVER_ROOT_CAUSE_2026-10-31.md`. Current host evidence: `docs/evidence/asset-pipeline/real-host-DEV-10A37155360B.json`.
