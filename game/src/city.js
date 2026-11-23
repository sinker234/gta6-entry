// City generation, static pre-render and collision for Port Azure.
// Roads run every ROAD_EVERY tiles and are ROAD_W tiles wide; the blocks
// between them hold a sidewalk ring and one solid building. The far east is
// beach and animated water.
import { TILE, WORLD_COLS, WORLD_ROWS, WORLD_W, WORLD_H, ROAD_EVERY, ROAD_W, BEACH_COL, PALETTE } from './config.js';
import { makeRng } from './random.js';

export function isRoadTile(tx, ty) {
  if (tx >= BEACH_COL - 1) return false;
  return (tx % ROAD_EVERY) < ROAD_W || (ty % ROAD_EVERY) < ROAD_W;
}
export function isWaterTile(tx) { return tx >= BEACH_COL + 2; }
export function isSandTile(tx) { return tx >= BEACH_COL - 1 && tx < BEACH_COL + 2; }

export class City {
  constructor(seed = 1337) {
    const rng = makeRng(seed);
    this.buildings = []; this.trees = []; this.crates = [];
    // One building per block interior.
    for (let bx = 0; bx < WORLD_COLS; bx += ROAD_EVERY) {
      for (let by = 0; by < WORLD_ROWS; by += ROAD_EVERY) {
        const x0 = bx + ROAD_W, y0 = by + ROAD_W;
        const wTiles = ROAD_EVERY - ROAD_W, hTiles = Math.min(ROAD_EVERY - ROAD_W, WORLD_ROWS - y0);
        if (x0 + wTiles > BEACH_COL - 2 || hTiles < 4) continue;
        const inset = TILE * 0.7;
        this.buildings.push({
          x: x0 * TILE + inset + (wTiles * TILE - inset * 2) / 2,
          y: y0 * TILE + inset + (hTiles * TILE - inset * 2) / 2,
          w: wTiles * TILE - inset * 2, h: hTiles * TILE - inset * 2,
          color: rng.pick(PALETTE.roofs), neon: rng.pick(PALETTE.neon),
          sign: rng.chance(0.55), seed: rng.next(),
        });
      }
    }
    // Palm trees on sidewalks and the beach.
    for (let i = 0; i < 260; i++) {
      const tx = rng.int(0, WORLD_COLS - 1), ty = rng.int(0, WORLD_ROWS - 1);
      if (isRoadTile(tx, ty) || isWaterTile(tx)) continue;
      const x = tx * TILE + rng.range(8, TILE - 8), y = ty * TILE + rng.range(8, TILE - 8);
      if (this.buildings.some(b => Math.abs(b.x - x) < b.w / 2 + 14 && Math.abs(b.y - y) < b.h / 2 + 14)) continue;
      this.trees.push({ x, y, s: rng.range(0.8, 1.3) });
    }
    // Landmarks: police station (west), hospital (south), Shine Shop garage (centre).
    this.policeStation = { x: 3.5 * TILE, y: 30 * TILE };
    this.hospital = { x: 30 * TILE, y: 58 * TILE };
    this.shineShop = { x: 38 * TILE, y: 26 * TILE };
    this.hideout = { x: 8 * TILE, y: 13 * TILE }; // (384,624), on the east-west road — was (384,384), inside a building
    this.canvas = this.renderStatic(rng);
  }

  renderStatic(rng) {
    const c = document.createElement('canvas'); c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d');
    g.fillStyle = PALETTE.grass; g.fillRect(0, 0, WORLD_W, WORLD_H);
    // Sand + water base.
    g.fillStyle = PALETTE.sand; g.fillRect((BEACH_COL - 1) * TILE, 0, WORLD_W, WORLD_H);
    g.fillStyle = PALETTE.water; g.fillRect((BEACH_COL + 2) * TILE, 0, WORLD_W, WORLD_H);
    // Sidewalk blocks then roads.
    for (let tx = 0; tx < WORLD_COLS; tx++) for (let ty = 0; ty < WORLD_ROWS; ty++) {
      if (isSandTile(tx) || isWaterTile(tx)) continue;
      if (!isRoadTile(tx, ty)) { g.fillStyle = PALETTE.sidewalk; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
    }
    g.fillStyle = PALETTE.road;
    for (let tx = 0; tx < WORLD_COLS; tx++) for (let ty = 0; ty < WORLD_ROWS; ty++) {
      if (isRoadTile(tx, ty)) g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
    // Lane dashes along road centres.
    g.fillStyle = PALETTE.roadLine;
    for (let tx = 0; tx < WORLD_COLS; tx += ROAD_EVERY) {
      for (let y = 0; y < WORLD_H; y += 32) g.fillRect((tx + 1) * TILE + TILE / 2 - 2, y + 8, 4, 16);
    }
    for (let ty = 0; ty < WORLD_ROWS; ty += ROAD_EVERY) {
      for (let x = 0; x < (BEACH_COL - 1) * TILE; x += 32) g.fillRect(x + 8, (ty + 1) * TILE + TILE / 2 - 2, 16, 4);
    }
    // Buildings with roof detail and neon signs.
    for (const b of this.buildings) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(b.x - b.w / 2 + 6, b.y - b.h / 2 + 8, b.w, b.h);
      g.fillStyle = b.color; g.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3; g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      const r2 = makeRng(Math.floor(b.seed * 1e6));
      for (let i = 0; i < 5; i++) g.fillRect(b.x - b.w / 2 + r2.range(10, b.w - 50), b.y - b.h / 2 + r2.range(10, b.h - 30), r2.range(18, 40), r2.range(12, 22));
      if (b.sign) {
        g.save(); g.shadowColor = b.neon; g.shadowBlur = 16; g.fillStyle = b.neon;
        g.fillRect(b.x - b.w / 2 + 8, b.y - b.h / 2 + 8, Math.min(90, b.w - 16), 10); g.restore();
      }
    }
    // Landmark pads.
    const pad = (p, label, col) => {
      g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, 30, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(label, p.x, p.y + 7);
    };
    pad(this.policeStation, 'PD', '#2456c8'); pad(this.hospital, '+', '#e33e5a'); pad(this.shineShop, 'S', '#ff2e88');
    // Palm trees.
    for (const t of this.trees) {
      g.fillStyle = '#7a5230'; g.fillRect(t.x - 3, t.y - 3, 6, 10);
      g.fillStyle = '#2e9e5b';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.ellipse(t.x + Math.cos(a) * 10 * t.s, t.y - 6 + Math.sin(a) * 6 * t.s, 11 * t.s, 4 * t.s, a, 0, 7); g.fill(); }
    }
    return c;
  }

  // Solid collision: buildings and world bounds and water block movement.
  blocked(x, y, r = 10) {
    if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
    if (isWaterTile(Math.floor(x / TILE))) return true;
    for (const b of this.buildings) {
      if (Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.y - y) < b.h / 2 + r) return true;
    }
    return false;
  }
  // Slide an entity out of buildings along the smaller penetration axis.
  resolveCircle(e, r) {
    e.x = Math.max(r, Math.min(WORLD_W - r, e.x));
    e.y = Math.max(r, Math.min(WORLD_H - r, e.y));
    for (const b of this.buildings) {
      const dx = e.x - b.x, dy = e.y - b.y;
      const px = b.w / 2 + r - Math.abs(dx), py = b.h / 2 + r - Math.abs(dy);
      if (px > 0 && py > 0) {
        if (px < py) e.x = b.x + (dx < 0 ? -(b.w / 2 + r) : b.w / 2 + r);
        else e.y = b.y + (dy < 0 ? -(b.h / 2 + r) : b.h / 2 + r);
        return true;
      }
    }
    return false;
  }
  roadCenterlines() {
    const v = [], h = [];
    for (let tx = 0; tx < BEACH_COL - 1; tx += ROAD_EVERY) v.push((tx + 1) * TILE + TILE / 2);
    for (let ty = 0; ty < WORLD_ROWS; ty += ROAD_EVERY) h.push((ty + 1) * TILE + TILE / 2);
    return { v, h };
  }
}
