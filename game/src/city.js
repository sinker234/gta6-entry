// Neon Tides — Port Azure, the city.
// Grid roads: a tile is road when (tx % 12) < 3 or (ty % 12) < 3, so every
// 12x12-tile block is ringed by 3-tile-wide streets. Buildings live inside
// blocks only (local coords 4..10), inset at least one tile from every block
// edge, so no building ever touches a road tile. Two blocks are walkable
// parks; the south edge is beach sand, then blocked water at the very bottom.
//
// All mission / side-job / respawn points in the game sit on road tiles by
// this rule (verified by a script before shipping).

import { TILE, WORLD_W, WORLD_H, ROAD_EVERY, ROAD_W, BEACH_TOP, WATER_TOP, COLOURS } from './config.js';
import { makeRng } from './random.js';

export const HIDEOUT = { x: 8 * TILE, y: 13 * TILE }; // (384, 624) — on a horizontal road
export const PLAYER_SPAWN = { x: HIDEOUT.x + 260, y: HIDEOUT.y + 200 }; // (644, 824) — vertical road

// Blocks kept as parks (walkable, trees, no buildings).
const PARKS = [
  { bx: 3, by: 2 },
  { bx: 5, by: 1 },
];

export class City {
  constructor(seed = 7) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.buildings = [];
    this.trees = [];
    this.hideout = { ...HIDEOUT };
    this._build();
  }

  _build() {
    const rng = this.rng;
    const blocksX = Math.floor(WORLD_W / TILE / ROAD_EVERY); // 7
    const blocksY = 5; // rows 0..4; row 5 is the beach/water band, no buildings
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        if (PARKS.some((p) => p.bx === bx && p.by === by)) {
          // Park block: scatter trees across the walkable interior.
          for (let i = 0; i < 9; i++) {
            this.trees.push({
              x: (bx * ROAD_EVERY + rng.range(4, 11)) * TILE,
              y: (by * ROAD_EVERY + rng.range(4, 11)) * TILE,
              r: rng.range(9, 15),
            });
          }
          continue;
        }
        const count = rng.chance(0.45) ? 2 : 1;
        for (let n = 0; n < count; n++) {
          const w = rng.int(3, 6); // tiles
          const h = rng.int(3, 6);
          const lx = rng.int(4, 11 - w); // inset >= 1 tile from block edges
          const ly = rng.int(4, 11 - h);
          const x = (bx * ROAD_EVERY + lx) * TILE;
          const y = (by * ROAD_EVERY + ly) * TILE;
          const b = {
            x,
            y,
            w: w * TILE,
            h: h * TILE,
            roof: rng.pick(COLOURS.buildingRoof),
            wall: COLOURS.buildingWall,
            seed: rng.next(),
          };
          // Keep two buildings in one block from overlapping.
          if (this.buildings.some((o) => o.x < b.x + b.w + TILE && b.x < o.x + o.w + TILE && o.y < b.y + b.h + TILE && b.y < o.y + o.h + TILE)) {
            continue;
          }
          this.buildings.push(b);
        }
      }
    }
  }

  isRoadTile(tx, ty) {
    return (tx % ROAD_EVERY) < ROAD_W || (ty % ROAD_EVERY) < ROAD_W;
  }

  isRoad(x, y) {
    return this.isRoadTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // True when the point (with radius r) cannot be stood on: inside a
  // building or in the water strip. Beach sand is walkable.
  blocked(x, y, r = 0) {
    if (y + r >= WATER_TOP || y - r >= WATER_TOP) return y >= WATER_TOP - r;
    if (y >= WATER_TOP) return true;
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  // Push a circle entity out of buildings and water along the shallow axis.
  resolveCircle(ent, r) {
    for (const b of this.buildings) {
      const cx = Math.max(b.x, Math.min(ent.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ent.y, b.y + b.h));
      const dx = ent.x - cx;
      const dy = ent.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        ent.x = cx + (dx / d) * r;
        ent.y = cy + (dy / d) * r;
      } else if (d2 <= 0.0001) {
        // Centre inside the rect: push out along the shallowest side.
        const left = ent.x - b.x;
        const right = b.x + b.w - ent.x;
        const top = ent.y - b.y;
        const bottom = b.y + b.h - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = b.x - r;
        else if (m === right) ent.x = b.x + b.w + r;
        else if (m === top) ent.y = b.y - r;
        else ent.y = b.y + b.h + r;
      }
    }
    if (ent.y > WATER_TOP - r) ent.y = WATER_TOP - r;
    ent.x = Math.max(r, Math.min(WORLD_W - r, ent.x));
    ent.y = Math.max(r, Math.min(WORLD_H - r, ent.y));
  }

  // Centre of the nearest road row/column (tile index % 12 === 1).
  roadRowCenter(y) {
    const ty = Math.floor(y / TILE);
    const base = Math.floor(ty / ROAD_EVERY) * ROAD_EVERY + 1;
    return base * TILE + TILE / 2;
  }

  roadColCenter(x) {
    const tx = Math.floor(x / TILE);
    const base = Math.floor(tx / ROAD_EVERY) * ROAD_EVERY + 1;
    return base * TILE + TILE / 2;
  }

  // A random point on a road, optionally far from (fx, fy).
  randomRoadPoint(rng, fx = null, fy = null, minDist = 0) {
    for (let tries = 0; tries < 40; tries++) {
      const vertical = rng.chance(0.5);
      let x;
      let y;
      if (vertical) {
        const col = rng.int(0, 7) * ROAD_EVERY + rng.int(0, ROAD_W);
        x = (col * TILE + TILE / 2) + rng.range(-14, 14);
        y = rng.range(TILE * 2, BEACH_TOP - TILE);
      } else {
        const row = rng.int(0, 5) * ROAD_EVERY + rng.int(0, ROAD_W);
        y = (row * TILE + TILE / 2) + rng.range(-14, 14);
        x = rng.range(TILE * 2, WORLD_W - TILE * 2);
      }
      if (fx !== null && Math.hypot(x - fx, y - fy) < minDist) continue;
      if (this.blocked(x, y, 12)) continue;
      return { x, y };
    }
    return { x: 644, y: 824 }; // fallback: player spawn road
  }

  // Nearest intersection (road-centre crossing) to a point.
  nearestIntersection(x, y) {
    return { x: this.roadColCenter(x), y: this.roadRowCenter(y) };
  }

  draw(ctx, cam, time) {
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(Math.ceil((cam.x + cam.w) / TILE), WORLD_W / TILE);
    const y1 = Math.min(Math.ceil((cam.y + cam.h) / TILE), WORLD_H / TILE);

    // Ground base.
    ctx.fillStyle = COLOURS.grass;
    ctx.fillRect(cam.x, cam.y, cam.w, cam.h);

    // Parks.
    ctx.fillStyle = COLOURS.park;
    for (const p of PARKS) {
      ctx.fillRect(p.bx * ROAD_EVERY * TILE, p.by * ROAD_EVERY * TILE, ROAD_EVERY * TILE, ROAD_EVERY * TILE);
    }

    // Beach + water (south edge).
    ctx.fillStyle = COLOURS.sand;
    ctx.fillRect(cam.x, BEACH_TOP, cam.w, WATER_TOP - BEACH_TOP);
    ctx.fillStyle = COLOURS.water;
    ctx.fillRect(cam.x, WATER_TOP, cam.w, WORLD_H - WATER_TOP);
    ctx.fillStyle = COLOURS.waterDeep;
    for (let i = 0; i < 5; i++) {
      const wy = WATER_TOP + 18 + i * 20 + Math.sin(time * 0.001 + i * 1.7) * 3;
      ctx.fillRect(cam.x, wy, cam.w, 3);
    }

    // Roads, sidewalks and dashes, tile by tile.
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const px = tx * TILE;
        const py = ty * TILE;
        const road = this.isRoadTile(tx, ty);
        if (!road) continue;
        const onBeach = py >= BEACH_TOP;
        if (onBeach) continue; // sand/water already painted
        ctx.fillStyle = COLOURS.road;
        ctx.fillRect(px, py, TILE, TILE);
        // Sidewalk rim where road meets a block.
        ctx.fillStyle = COLOURS.sidewalk;
        if ((tx % ROAD_EVERY) === ROAD_W - 1 && (ty % ROAD_EVERY) >= ROAD_W) ctx.fillRect(px + TILE - 6, py, 6, TILE);
        if ((ty % ROAD_EVERY) === ROAD_W - 1 && (tx % ROAD_EVERY) >= ROAD_W) ctx.fillRect(px, py + TILE - 6, TILE, 6);
        // Centre dashes on road-centre tiles.
        ctx.fillStyle = '#d8c25a';
        if ((tx % ROAD_EVERY) === 1 && (ty % ROAD_EVERY) >= ROAD_W) ctx.fillRect(px + TILE / 2 - 2, py + 8, 4, TILE - 16);
        if ((ty % ROAD_EVERY) === 1 && (tx % ROAD_EVERY) >= ROAD_W) ctx.fillRect(px + 8, py + TILE / 2 - 2, TILE - 16, 4);
      }
    }

    // Buildings: wall, roof, windows.
    for (const b of this.buildings) {
      if (b.x + b.w < cam.x || b.x > cam.x + cam.w || b.y + b.h < cam.y || b.y > cam.y + cam.h) continue;
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255, 244, 200, 0.85)';
      const cols = Math.max(1, Math.floor(b.w / 44));
      const rows = Math.max(1, Math.floor(b.h / 44));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (((i * 7 + j * 13 + Math.floor(b.seed * 100)) % 3) === 0) continue;
          ctx.fillRect(b.x + 14 + i * 44, b.y + 14 + j * 44, 18, 14);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    }

    // Park trees.
    for (const t of this.trees) {
      if (t.x < cam.x - 20 || t.x > cam.x + cam.w + 20 || t.y < cam.y - 20 || t.y > cam.y + cam.h + 20) continue;
      ctx.fillStyle = '#5d8a44';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7cbf5e';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hideout marker (a small house + label on the road).
    ctx.fillStyle = '#ffd32a';
    ctx.fillRect(this.hideout.x - 14, this.hideout.y - 10, 28, 20);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(this.hideout.x - 17, this.hideout.y - 10);
    ctx.lineTo(this.hideout.x, this.hideout.y - 22);
    ctx.lineTo(this.hideout.x + 17, this.hideout.y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HIDEOUT', this.hideout.x, this.hideout.y + 34);
  }
}
