# Hand-off (Oct 31 2026)
Read AGENTS.md first. Keep each change small, run `npx tsc --noEmit -p .` and `npx vitest run` (111 tests) before finishing.

## Codex task
Make sure Raid Boss works in an ONLINE room (the owner says it is not working; details unknown).
1. `npm run dev`, open http://localhost:5173 (host) and http://localhost:5173/?tab-session (guest) in two tabs; sign both in as guests.
2. Host: Play Online -> Create room, set Game mode = Boss Raid, guest joins with the code, host starts the game.
3. Run the auction (in the host tab console: `__dev.finishAuction()`), click through the reveal in both tabs.
4. In the hub's "Raid Boss" tab: guest picks fighters (should reach the host as a 'raidPick' move), host picks a villain and starts the raid.
5. Check: the guest sees the Raid tab, its picks show on the host, the raid uses them, and the guest sees the result card and can Watch the fight. Fix whatever breaks (src/online/room.ts, src/ui/components/Raid.tsx, src/store/store.ts). Add a test if the bug is in engine code.
Write what you found and fixed below this list.

## Gemini task
none
