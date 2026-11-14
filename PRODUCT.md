# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no build step and zero runtime dependencies: `index.html`, `css/`, native ES modules in `js/`, system font stack. Published on GitHub Pages. (The original prototype used p5.js; the rebuild replaced it with Canvas 2D, Pointer Events and a small Perlin noise module.)

## Users

Two audiences open the same link from Agustín Amato's portfolio:
- Design studios, agencies, and art directors who judge the piece as a visual and interactive gesture.
- Tech recruiters and frontend teams who judge code quality, performance, accessibility, and how the repo reads.

A third, secondary audience is designers who actually use it to make organic blob shapes and export them to Figma or Illustrator.

## Product Purpose

Ink Sandbox is an ink dropper: you drop, stir, and erase drops of ink that fuse into cohesive liquid masses, and export the result as a clean vector SVG. Success: a visitor plays within seconds, makes something they like, and either exports it or remembers the piece and its author.

## Positioning

The ink is a real-time metaball field with marching squares contours, so what you see on screen is exactly the vector you export: one compound path, 1:1. Each drop remembers where it was placed (anchor memory), so shapes breathe and fuse but never drift or collapse.

## Operating Context

Opened from a portfolio or GitHub link, mostly on desktop with a mouse or trackpad, sometimes on a phone. Exported SVGs go to Figma or Illustrator.

## Capabilities and Constraints

- Tools: dropper (click, hold to swell, drag to trail with splatter), air (blow bubbles into existing ink: click, hold to inflate, drag for foam; bubbles are real holes that push the ink aside), stir (drag moves drops, bubbles and anchors), erase.
- Parameters: brush size (12-85 px, mouse wheel), cohesion, bloat, organic noise, anchor memory, gloss (render-only shading and reflections; SVG export stays a flat compound path).
- Actions: undo (50 states, Ctrl/Cmd+Z), random mutation (R), freeze physics (Space), structure view (G), clear (C), sample cluster, export SVG (S).
- One ink at a time. Palettes: white on charcoal (default), black on paper, lime on black, red on black, blue on paper, plus a custom ink colour.
- Max 1000 drops; 8 px field grid.
- Interface must be bilingual ES/EN, defaulting to the browser language.

## Brand Commitments

- Name: Ink Sandbox (renamed from BLOBMELT on 2026-11-14). Repo: github.com/amatosaurio22/ink-sandbox.
- Author credit: Agustín Amato. MIT license.

## Evidence on Hand

- Started as a single-file p5.js prototype.
- No press, users, or metrics exist. Do not invent any.

## Product Principles

1. The ink leads; the interface recedes until asked for.
2. What you see is what you export.
3. Nothing the user draws drifts or is lost: anchors and undo protect the work.
4. The repo is part of the piece: readable code, honest README.

## Confirmed preferences

- The user explicitly prefers a single ink, mainly white on a dark ground, as in the original prototype. A two-colour risograph treatment was tried and rejected (2026-11-03). Do not reintroduce multi-ink printing as the default.
- 2026-11-14: the user asked for an Apple-like interface that does not look machine-made: system font, floating glass bars, bottom toolbar, grouped inspector, iOS sliders, system blue. The brutalist wordmark, mono labels and acid accent were removed.
