// What each arena's sky and ground can do: its climate (which weather it gets
// and how often), the kind of ground (what a crater or a footstep looks like)
// and the objects standing on the field that can be broken.
import type { Tag } from '../../engine/types';

export type WeatherKind =
  | 'clear' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'wind' | 'fog'
  | 'ash' | 'embers' | 'heat' | 'petals' | 'fireflies' | 'dust';

export type GroundKind = 'rock' | 'snow' | 'stone' | 'tile' | 'concrete' | 'earth' | 'water' | 'sand';

export interface Climate {
  /** Weather this arena drifts between, with weights. */
  pool: Array<[WeatherKind, number]>;
  ground: GroundKind;
  /** Base sky darkness 0..1 (night arenas are darker). */
  dark: number;
}

export const CLIMATES: Record<string, Climate> = {
  volcano: { pool: [['ash', 4], ['embers', 4], ['heat', 3], ['storm', 1]], ground: 'rock', dark: 0.15 },
  tundra: { pool: [['snow', 5], ['clear', 2], ['blizzard', 2], ['fog', 2]], ground: 'snow', dark: 0.1 },
  storm: { pool: [['storm', 5], ['rain', 3], ['wind', 2]], ground: 'stone', dark: 0.3 },
  temple: { pool: [['clear', 3], ['petals', 4], ['fog', 2], ['rain', 2]], ground: 'tile', dark: 0.05 },
  rooftops: { pool: [['rain', 4], ['fog', 2], ['clear', 2], ['wind', 2]], ground: 'concrete', dark: 0.25 },
  forest: { pool: [['fog', 3], ['fireflies', 4], ['rain', 2], ['storm', 1]], ground: 'earth', dark: 0.3 },
  ocean: { pool: [['rain', 3], ['wind', 3], ['storm', 2], ['fog', 2]], ground: 'water', dark: 0.15 },
  colosseum: { pool: [['clear', 4], ['wind', 2], ['rain', 2], ['heat', 2], ['dust', 2]], ground: 'sand', dark: 0.1 },
};
export const climateOf = (envId: string): Climate => CLIMATES[envId] ?? CLIMATES.colosseum;

/** How a powerful move of an element pulls the weather (domains, ultimates, transformations). */
export const ELEMENT_WEATHER: Partial<Record<Tag, WeatherKind>> = {
  FIRE: 'heat', DRAGON: 'embers', ICE: 'blizzard', WATER: 'rain', LIGHTNING: 'storm', WIND: 'wind',
  EARTH: 'dust', DARK: 'fog', SHADOW: 'fog', DEMON: 'ash', SPIRIT: 'fireflies', HOLY: 'clear', DIVINE: 'clear', MAGIC: 'petals',
};

/** Weather that leaves water on the ground / snow on the ground. */
export const WET = new Set<WeatherKind>(['rain', 'storm']);
export const SNOWY = new Set<WeatherKind>(['snow', 'blizzard']);

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear skies', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snowfall', blizzard: 'Blizzard', wind: 'Strong wind',
  fog: 'Fog', ash: 'Ashfall', embers: 'Ember storm', heat: 'Heatwave', petals: 'Falling petals', fireflies: 'Spirit lights', dust: 'Dust storm',
};

// ------------------------------------------------------------------ props

export type PropKind =
  | 'pillar' | 'rock' | 'lava-rock' | 'ice-spike' | 'snow-pine' | 'lantern' | 'statue' | 'bell'
  | 'water-tank' | 'sign' | 'ac-unit' | 'tree' | 'shrine' | 'column-ruin' | 'buoy' | 'banner' | 'crate' | 'brazier';

export interface PropDef {
  id: string;
  kind: PropKind;
  /** Horizontal position across the arena, 0 (left edge) to 1 (right edge). */
  x: number;
  /** Which fighters' half it stands in (hits on that side can break it). */
  side: 0 | 1;
  /** Back props stand behind the fighters and are smaller; front props overlap the edge. */
  layer: 'back' | 'front';
  scale: number;
  /** Hits it takes before breaking: cracked at half, destroyed at full. */
  hp: number;
}

const p = (id: string, kind: PropKind, x: number, layer: PropDef['layer'], scale = 1, hp = 4): PropDef => ({ id, kind, x, side: x < 0.5 ? 0 : 1, layer, scale, hp });

export const PROPS: Record<string, PropDef[]> = {
  volcano: [p('v1', 'lava-rock', 0.05, 'front', 1.1), p('v2', 'rock', 0.27, 'back', 0.8, 3), p('v3', 'rock', 0.72, 'back', 0.9, 3), p('v4', 'lava-rock', 0.95, 'front', 1)],
  tundra: [p('t1', 'snow-pine', 0.04, 'front', 1.2, 3), p('t2', 'ice-spike', 0.25, 'back', 0.85), p('t3', 'ice-spike', 0.76, 'back', 0.9), p('t4', 'snow-pine', 0.96, 'front', 1.1, 3)],
  storm: [p('s1', 'pillar', 0.05, 'front', 1.1, 5), p('s2', 'statue', 0.26, 'back', 0.85), p('s3', 'statue', 0.74, 'back', 0.85), p('s4', 'pillar', 0.95, 'front', 1.1, 5)],
  temple: [p('p1', 'lantern', 0.05, 'front', 1, 3), p('p2', 'bell', 0.27, 'back', 0.9, 5), p('p3', 'shrine', 0.73, 'back', 0.85), p('p4', 'lantern', 0.95, 'front', 1, 3)],
  rooftops: [p('r1', 'ac-unit', 0.05, 'front', 1, 3), p('r2', 'water-tank', 0.26, 'back', 0.9), p('r3', 'sign', 0.74, 'back', 0.95), p('r4', 'crate', 0.95, 'front', 1, 2)],
  forest: [p('f1', 'tree', 0.04, 'front', 1.2, 5), p('f2', 'shrine', 0.26, 'back', 0.75, 3), p('f3', 'rock', 0.74, 'back', 0.85, 3), p('f4', 'tree', 0.96, 'front', 1.15, 5)],
  ocean: [p('o1', 'column-ruin', 0.05, 'front', 1.05, 4), p('o2', 'buoy', 0.27, 'back', 0.8, 2), p('o3', 'buoy', 0.73, 'back', 0.8, 2), p('o4', 'column-ruin', 0.95, 'front', 1.05, 4)],
  colosseum: [p('c1', 'brazier', 0.05, 'front', 1, 3), p('c2', 'banner', 0.26, 'back', 0.9, 3), p('c3', 'banner', 0.74, 'back', 0.9, 3), p('c4', 'brazier', 0.95, 'front', 1, 3)],
};
export const propsOf = (envId: string): PropDef[] => PROPS[envId] ?? PROPS.colosseum;
