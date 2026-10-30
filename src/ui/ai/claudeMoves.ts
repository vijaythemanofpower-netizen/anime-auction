// The Claude call behind the AI move writer. Loaded only when a player asks
// for moves, so the Anthropic SDK and zod stay out of the game's main download.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { PublicCharacter } from '../../engine/types';
import { MOVE_ENUMS, type MoveSetResult } from './moveWriter';

const { TAGS, VFX, EFFECTS } = MOVE_ENUMS;

const Move = z.object({
  name: z.string().describe('The technique\'s real name as used in the series (official English name if one exists).'),
  role: z.enum(['strike', 'area', 'power_up', 'disable', 'heal', 'defend', 'summon']).describe('What the move does in a fight.'),
  strength: z.enum(['light', 'medium', 'heavy']),
  element: z.enum([...TAGS, 'NONE']),
  visual: z.enum(VFX).describe('Closest on-screen effect type.'),
  color: z.string().describe('Main colour of the technique as a #rrggbb hex code.'),
  effect: z.enum(EFFECTS).describe('Secondary effect, if the move is known for one.'),
  look: z.string().describe('One vivid sentence (max 25 words) describing what the move looks like on screen.'),
});

const MoveSet = z.object({
  known: z.array(Move).describe('Exactly two signature moves the character is famous for.'),
  hidden: Move.describe('A lesser-known or surprising technique they have.'),
  ultimate: Move.describe('Their strongest finishing technique or transformation attack.'),
  evolvedForm: z.string().describe('Name of a stronger form or state they reach in the series (e.g. "Bankai", "Gear Fifth").'),
  stats: z.object({
    attack: z.number().int(), defense: z.number().int(), speed: z.number().int(), technique: z.number().int(), battleIQ: z.number().int(),
    stamina: z.number().int(), adaptability: z.number().int(), luck: z.number().int(), potential: z.number().int(),
  }).describe('Their canon fighting ability at their strongest commonly shown state, each 15-99, on this fixed scale: Goku attack 97 speed 95; Gojo defense 99 technique 97; Itachi battleIQ 98; Naruto stamina 99; Nobara attack 72 speed 70; an ordinary trained human about 30; a non-fighter about 20. Rate from their feats in the series, not their popularity.'),
  confidence: z.enum(['canon', 'mostly_canon', 'invented']).describe('canon: all from the series; invented: the character has no fighting techniques, so the moves are made up to fit them.'),
});
// Keep in step with the MoveSetResult interface in moveWriter.ts.
const _check: (x: z.infer<typeof MoveSet>) => MoveSetResult = (x) => x;
void _check;

export async function askClaude(pc: PublicCharacter, apiKey: string, signal?: AbortSignal): Promise<{ out: MoveSetResult | null; refused: boolean }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(MoveSet) },
    system: 'You know anime and manga in depth. You list the real fighting techniques characters use in their series and rate how strong they are from their feats. Prefer official English technique names. If the character never fights, invent moves that fit their personality and abilities, and say so through the confidence field.',
    messages: [{
      role: 'user',
      content: `Character: ${pc.name}${pc.aliases.length ? ` (also known as ${pc.aliases.join(', ')})` : ''}\nSeries: ${pc.series}\nDescription: ${pc.bio.slice(0, 900)}\n\nGive their two signature moves, one hidden technique, their ultimate, an evolved form, and their stat sheet.`,
    }],
  }, { signal });
  return { out: response.parsed_output ?? null, refused: response.stop_reason === 'refusal' };
}
