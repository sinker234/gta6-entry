// Neon Tides — shared constants and the Port Azure palette.
export const TILE = 48;
export const WORLD_COLS = 84;
export const WORLD_ROWS = 64;
export const WORLD_W = WORLD_COLS * TILE;
export const WORLD_H = WORLD_ROWS * TILE;
export const ROAD_EVERY = 12;
export const ROAD_W = 3;
export const BEACH_COL = 78; // tiles at/after this column are sand/water

export const PALETTE = {
  road: '#2b2f3e', roadLine: '#f5d76e', sidewalk: '#8d93a8', grass: '#3f7d5a',
  sand: '#e8cf9a', water: '#1b6f8e', waterHi: '#37b6d9',
  roofs: ['#e88ca0', '#7fb3d5', '#f2c078', '#a3d9a5', '#c39bd3', '#f1948a', '#85c1e9', '#f0e68c'],
  neon: ['#ff2e88', '#00e5ff', '#ffe600', '#7cff4f', '#ff7b00', '#b967ff'],
  player: '#00e5ff', ped: ['#f5b7b1', '#aed6f1', '#f9e79f', '#abebc6', '#d2b4de', '#fad7a0'],
};

export const CAR_TYPES = {
  sedan:  { w: 44, h: 22, accel: 260, maxSpeed: 300, grip: 5.2, hp: 100, colors: ['#5dade2', '#aeb6bf', '#ec7063', '#58d68d'] },
  taxi:   { w: 44, h: 22, accel: 250, maxSpeed: 290, grip: 5.2, hp: 100, colors: ['#f7dc2a'] },
  sports: { w: 46, h: 21, accel: 380, maxSpeed: 430, grip: 6.0, hp: 80,  colors: ['#ff2e88', '#00e5ff', '#ffe600'] },
  truck:  { w: 58, h: 26, accel: 190, maxSpeed: 230, grip: 4.2, hp: 180, colors: ['#95a5a6', '#7dcea0', '#f0b27a'] },
  police: { w: 45, h: 22, accel: 330, maxSpeed: 390, grip: 5.8, hp: 140, colors: ['#1c2733'] },
};

export const STORAGE_KEY = 'neon-tides-save-v1';
export const SHINE_COST = 150;
