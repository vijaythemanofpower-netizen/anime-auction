# Cricket Auction: notes for whoever works on this next

Read README.md first.

- Before committing: `npx tsc --noEmit -p .` and `npx vitest run` must pass.
- `src/engine/` is pure and deterministic (match = replay of seed + answers); keep it free of DOM and Math.random.
- Online guests are untrusted: every move is checked in `applyAct` (src/store/store.ts) before the host applies it.
- Roster corrections live in the FIX table at the end of src/engine/data/players.ts.
