# Hand-off (Nov 1 2026)
Read AGENTS.md first. Keep each change small, run `npx tsc --noEmit -p .` and `npx vitest run` (139 tests) before finishing.

## Codex task
Make sure Raid Boss works in an ONLINE room (the owner says it is not working; details unknown). Two tabs (http://localhost:5173 and http://localhost:5173/?tab-session), sign in as guests, create a Boss Raid room, run the auction with __dev.finishAuction() in the host tab, then use the Raid Boss tab from both. Fix src/online/room.ts, src/ui/components/Raid.tsx or src/store/store.ts as needed.

## Gemini task
Continue the premium site redesign Claude started (Nov 2 2026). Done: src/ui/motion/ (MotionLayer: click ink impacts, scroll panel-wipe reveals, scroll progress, speed lines, card tilt; ScreenWipe: katakana scene-change wipe), src/ui/motion.css, mounted in App.tsx. Not checked in a browser yet: open http://localhost:5173, scroll the home page, click buttons, switch screens; fix anything that looks broken (e.g. reveal hiding content that never scrolls into view, tilt fighting other transforms). Next: Home hero kinetic title + scroll parallax, chapter-style section headers. Follow .claude/skills/frontend-design/SKILL.md. Keep 375 px working and reduced motion off-switch.
