# Emblem

The emblem is Ciel's fallback presence. The overlay shows it only when the persona pack has neither a portrait picture nor a VRM model, or when either fails to load. The [design](../specs/2026-11-21-ciel-design.md) ("Presence update 2") explains the order.

## Decision (2026-11-21)

- **Variant: A, "Facet"**, from the [mockups](emblem-mockups.html). It's an original design: segmented rings around a faceted hexagonal core, and it's already the one in [Emblem.tsx](../../app/src/renderer/overlay/Emblem.tsx).
- **Why no fresh pick:** the owner chose their own portrait as her presence, so the emblem is now only a fallback.
- **Colours:** they come from the persona pack's `emblem.json`, the same file that tints the cards and the portrait's glow. The private pack uses pastel pink to match the portrait; the code's default (`DEFAULT_THEME`) is sky blue.
- **States:**
  - idle: slow breathing
  - listening: brighter, rings tighten
  - thinking: arcs rotate
  - speaking: pulses with the voice level
  - alert: amber, waiting for approval
