// Neon Tides — shared tuning constants for the whole game.
// One place for world size, physics numbers and palette so every system agrees.

export const TILE = 48;
export const WORLD_W = 4032; // 84 tiles wide
export const WORLD_H = 3072; // 64 tiles tall
export const STEP = 1 / 60;

export const ROAD_EVERY = 12; // a tile is road when (tx % 12) < 3 or (ty % 12) < 3
export const ROAD_W = 3;

export const BEACH_TOP = WORLD_H - 4 * TILE; // walkable sand strip (south edge)
export const WATER_TOP = WORLD_H - 2 * TILE; // blocked water strip (very bottom)

export const PLAYER_R = 11;
export const WALK_SPEED = 230;
export const SPRINT_SPEED = 340;

export const BULLET_SPEED = 640;
export const FIRE_INTERVAL = 0.18;
export const STAGE_RADIUS = 62;
export const MARA_RADIUS = 46;
export const PAD_RADIUS = 56;

export const RESPAWN = {
  police: { x: 240, y: 1200 },
  hospital: { x: 1488, y: 2424 },
};

export const COLOURS = {
  grass: '#7fae62',
  park: '#69a854',
  road: '#3b4048',
  roadEdge: '#2e323a',
  sidewalk: '#9a938a',
  sand: '#e8d29a',
  water: '#2f7fb8',
  waterDeep: '#1f5f92',
  buildingRoof: ['#c96f4a', '#d9a441', '#5d7ea6', '#8a6fb0', '#b0576e', '#6aa889', '#a8673c'],
  buildingWall: '#e8e0d2',
  ped: ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'],
  player: '#ffd32a',
  police: '#2c6fd6',
  marker: '#ffd32a',
  hudBg: 'rgba(10, 14, 20, 0.72)',
};

export const WANTED = {
  star1: 15,
  star2: 40,
  star3: 65,
  decay: 2.2,
};

export function starsForHeat(heat) {
  if (heat >= WANTED.star3) return 3;
  if (heat >= WANTED.star2) return 2;
  if (heat >= WANTED.star1) return 1;
  return 0;
}
