# Design — Ink Sandbox

A full-bleed ink canvas with floating, Apple-style glass chrome. The ink is the content; the interface stays quiet and familiar.

## Principles

1. **The canvas is the app.** Chrome floats over the ink in three places only: actions top-right, tools bottom-centre, settings in an inspector on demand.
2. **Native, not themed.** System font, system blue, grouped lists, iOS sliders, segmented control, sheet with grabber on phones. Nothing that has to be learned.
3. **One ink on one ground.** The ink world is a single colour on a single ground; the chrome follows the ground's lightness (`body.on-light`).
4. **Render-only gloss.** Shadow, lit rim and reflections are drawn from the ink's own outline and never reach the SVG.

## Colour

| Token | Dark ground | Light ground |
| --- | --- | --- |
| `--glass` | rgba(38,38,42,.62) | rgba(255,255,255,.68) |
| `--glass-strong` (inspector, toast) | rgba(36,36,40,.86) | rgba(250,250,252,.9) |
| `--text` | #f5f5f7 | #1d1d1f |
| `--text-2` / `--text-3` | 62% / 32% white | 64% / 32% of #3c3c43 |
| `--fill`, `--fill-2`, `--fill-3` | system grey 32 / 20 / 12% | 20 / 12 / 8% |
| `--accent` | #0a84ff | #007aff |
| `--danger` | #ff453a | #ff3b30 |

Glass is `backdrop-filter: blur(28px) saturate(180%)` with a 0.5px edge, a soft drop shadow and a 0.5px inner top highlight. Accent marks the selected tool, toggled states, slider fill, focus ring and the one primary button, Export SVG.

Ink palettes (`js/press.js`): white on #0a0a0b, black on #f2f2ee, lime #d4ff00 on black, red #ff3300 on black, blue #0038ff on #f2f2ee, Desert Chrome on #0d0a08 (default), plus any custom ink.

**Desert Chrome** (`chrome()` in `js/press.js`): the field read as a smoothed height map, each pixel's normal used as a matcap lookup into a desert environment. Sky ramps from cream at the horizon to dusty blue (#465f92) overhead; dunes from near-black brown under the horizon (#160d08) to bright sand (#fcd6a0) at down-facing edges; a low sun glint on the left and a slight Fresnel lift at grazing edges. Brillo sets the relief depth. The SVG gets a vertical sky-horizon-dune gradient as its vector stand-in.

## Type

System stack (`-apple-system`, SF Pro on Apple devices, Segoe UI Variable / Roboto elsewhere). No web fonts.

| Role | Size / weight |
| --- | --- |
| Intro title | clamp(44px, 6.4vw, 88px) / 600, −0.03em |
| Intro subtitle | clamp(17px, 1.7vw, 24px) / 500, secondary |
| Inspector title | 15px / 600 (17px on phones) |
| Body, controls | 13px (15px on phones) |
| Group titles | 11px / 600, secondary, sentence case |
| Toolbar labels | 10.5px / 500 |

Numbers use tabular figures. No uppercase, no letter-spaced labels, no monospace.

## Shape and spacing

- Bars and inspector: 16px radius (12px for 44px-tall top controls). Groups: 10px. Buttons: 8px. Swatches and close button: circles.
- Edge gap 16px (12px on phones). Toolbar 64px tall (56px on phones), tools 60×52 with icon over label.
- Icons: 24-unit grid, 1.6 stroke, round caps and joins.

## Components

- **Top actions:** icon buttons (undo with count badge, example, clear, structure toggle), a hairline separator, ES/EN segmented control. Export SVG is a solid accent button beside it.
- **Toolbar:** Dropper, Air, Move, Eraser as a radio group; separator; Pause and Settings toggles. Selected state is an accent-tinted rounded rectangle.
- **Inspector:** grouped inset rows (Brush, Ink, Color), each slider row with label left, value right, track below. Secondary actions are tinted buttons (Vary shape, Export PNG). Shortcuts in tertiary text at the end.
- **Slider:** 4px track, accent fill up to the knob (`--p` set from JS), 22px white knob with layered shadow.
- **Swatches:** 28px circles, ink inside a ring of its ground; selected gets a 2px gap and a 2px accent ring. The custom colour well is a conic spectrum.
- **Toast:** glass capsule top-centre, springs in.

## Motion

One curve, `cubic-bezier(.32,.72,0,1)`, plus a light spring `cubic-bezier(.34,1.4,.64,1)` for the inspector and toast. The intro title fades and drops 16px on first interaction. Everything collapses to instant under `prefers-reduced-motion`.

## Responsive

- ≤900px: the title and counter capsule hides.
- ≤720px: toolbar icons only, Export shows as "SVG", the inspector becomes a bottom sheet (52dvh, grabber, 14px top radius), credits move into the sheet, sample ink sits higher to stay visible above it.
