# Hand-off (Nov 1 2026)
Read AGENTS.md first. Keep each change small, run `npx tsc --noEmit -p .` and `npx vitest run` (139 tests) before finishing.

## Codex task
Make sure Raid Boss works in an ONLINE room (the owner says it is not working; details unknown). Two tabs (http://localhost:5173 and http://localhost:5173/?tab-session), sign in as guests, create a Boss Raid room, run the auction with __dev.finishAuction() in the host tab, then use the Raid Boss tab from both. Fix src/online/room.ts, src/ui/components/Raid.tsx or src/store/store.ts as needed.

## Gemini task
none
