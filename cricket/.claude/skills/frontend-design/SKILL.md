---
name: frontend-design
description: Design rules for Anime Auction's UI (manga-cover identity). Use whenever building or restyling a screen, component, panel, button, card, form or animation in src/ui, so new work matches the existing design system instead of generic AI/Tailwind styling.
---

# Anime Auction design system

The site has one identity: a **manga cover**. Warm ink black and cream paper, one bold flat accent per scene, inked display titles, hard-shadow buttons. The tokens live in `src/ui/styles.css` (base) and are overridden by `src/ui/identity.css` (the real look) and `src/ui/manga.css` (manga dressing). Always use the tokens; read those files before styling something new.

## Avoid the generic AI look
- No neon gradients, glassmorphism, soft purple glows, gradient text on body copy, or rounded "SaaS cards" with drop shadows.
- No Tailwind utility soup; this project uses plain CSS files with named classes. Add rules to the matching CSS file (`styles.css`, `arena.css`, `home.css`, `comic.css`...).
- No emoji as decoration in headings. No stock "Lorem" copy: write real game copy.
- One accent per view. Don't add new colours to make something "pop"; use weight, size, ink shadow or the accent.

## Colour tokens (never raw hex in UI chrome)
- Surfaces: `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--surface-3`; borders `--line`, `--line-strong`.
- Text: `--text`, `--text-dim`, `--text-faint`. Ink: `--ink` (hard shadows, outlines).
- Accent: `--violet` (the scene accent, despite the name) and `--violet-2` (its soft tone); `--cyan` is the scene's second tone. Scenes (`:root[data-scene=...]`) swap these, so never hard-code an accent.
- Meaning: `--gold` (coins, money, winners), `--good`, `--warn`, `--bad`; scout verdicts `--take`, `--might`, `--leave`.
- Exceptions: battle effects and character/move colours come from game data (ability `fx.color`, environment palette), not tokens.

## Typography
- Display: `var(--font-display)` (Anton). For h1/h2, lot names, big calls, numbers that matter. Weight 400 (Anton is already heavy), uppercase allowed, tight line-height (1.0-1.15).
- Body: `var(--font-body)` (Zen Kaku Gothic New). h3/h4 use body font at weight 700.
- Kana accents: `var(--font-kana)`, only for decorative page titles.
- Scale (px): 11 (labels, meta, uppercase with 0.08em tracking), 13 (secondary/dense UI), 15 (body, the default), 18 (h3), 22 (h2 on small screens / card titles), 28 (section titles); h1 uses `clamp(28px, 4vw, 44px)`. Don't invent sizes between these; 10 px only inside dense arena HUD.

## Spacing and shape
- 4 px base, mostly multiples of 8: 4, 8, 12, 16, 24, 32, 48. Panels pad 16-18 px; gaps between stacked sections 16 px (`.col` gap), inline gaps 8 px (`.row`).
- Radius: `--radius` (10 px) for panels/cards, `--radius-sm` (7 px) for inputs/chips, 8 px buttons, 999 px only for pills/badges.
- Depth comes from ink: `box-shadow: 4px 4px 0 var(--ink)` style hard shadows on primary actions, not blurred glows.

## Components (reuse before writing new ones)
- Buttons: `.btn` + one of `.primary` (accent fill, hard ink shadow, lifts on hover, presses on active), `.gold` (money actions), `.ghost`, `.danger`; sizes `.sm` / `.lg`; `.active` + `aria-pressed` for toggles. Disabled = 0.4 opacity. Min height 42 px (34 px for `.sm`).
- Containers: `.panel` (surface + 1 px line). Layout helpers `.row`, `.col`, `.faint`.
- Shared React pieces are in `src/ui/components/common.tsx` (Emblem, Seg...) and `Portrait.tsx` (CharArt). Use them instead of new markup.
- Forms: label above the field, 13 px dim label, inputs on `--surface-2` with `--line-strong` border and the global `:focus-visible` outline. Errors in `--bad` under the field, in words.

## Motion
- Framer Motion (`framer-motion`) is installed for UI motion: page/section entrances, list reorders, modal and panel transitions. Keep it short (150-300 ms, ease-out), small (8-24 px travel, no bouncy springs on text).
- Battle visuals are NOT Framer Motion: the arena uses PixiJS (`src/ui/fx/`) and CSS keyframes in `arena.css`. Keep it that way.
- Always respect reduced motion: the app setting `settings.reducedMotion` and `prefers-reduced-motion`. With Framer Motion, use `useReducedMotion()` / `MotionConfig reducedMotion="user"` and fall back to opacity-only.

## Layout and responsiveness
- Phones matter: check every new screen at 375 px wide. No sideways scroll, tap targets at least 40 px, controls reachable without zooming.
- Hierarchy per screen: one display title, one primary action, everything else secondary. Put the primary action where the eye ends (bottom-right of a panel or the end of a row).
- Accessibility: real `<button>`s, `aria-label` on icon-only buttons, colour never the only signal (pair with a word or icon), text contrast at least 4.5:1 on surfaces.

## Before you finish
Run `npx tsc --noEmit -p .` and `npx vitest run`, view the screen at desktop and 375 px, and check it with reduced motion on.
