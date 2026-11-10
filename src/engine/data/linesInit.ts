// Hands the commentary lines to the match engine (kept separate so the engine has no big data import).
import { LINES } from './lines';
import { LINES_REF } from '../match';
LINES_REF.lines = LINES as unknown as Record<string, readonly string[]>;
