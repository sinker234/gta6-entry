// Pedestrians: stroll sidewalks, flee danger, fall when hit.
import { TILE, PALETTE } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { isRoadTile } from './city.js';

let nextId = 1;
export class Pedestrian {
  constructor(x, y, rng) {
    this.id = nextId++; this.x = x; this.y = y;
    this.angle = rng.range(0, Math.PI * 2); this.speed = rng.range(34, 62);
    this.color = rng.pick(PALETTE.ped); this.state = 'walk'; this.timer = rng.range(1, 4);
    this.dead = false; this.fleeX = 0; this.fleeY = 0; this.walkPhase = rng.range(0, 6);
  }
  scare(fromX, fromY) { if (!this.dead) { this.state = 'flee'; this.timer = 2.2; this.fleeX = fromX; this.fleeY = fromY; } }
  update(dt, city, danger) {
    if (this.dead) return;
    this.walkPhase += dt * 8;
    if (danger && dist(this.x, this.y, danger.x, danger.y) < 130 && danger.hot) this.scare(danger.x, danger.y);
    this.timer -= dt;
    let vx = 0, vy = 0, sp = this.speed;
    if (this.state === 'flee') {
      const a = Math.atan2(this.y - this.fleeY, this.x - this.fleeX);
      vx = Math.cos(a); vy = Math.sin(a); sp = 150;
      if (this.timer <= 0) { this.state = 'walk'; this.timer = 1; }
    } else {
      if (this.timer <= 0) { this.angle = Math.random() * Math.PI * 2; this.timer = 1.5 + Math.random() * 3; }
      vx = Math.cos(this.angle); vy = Math.sin(this.angle);
    }
    const nx = this.x + vx * sp * dt, ny = this.y + vy * sp * dt;
    // Prefer sidewalks: if the next step lands on a road while strolling, turn.
    if (this.state === 'walk' && isRoadTile(Math.floor(nx / TILE), Math.floor(ny / TILE))) { this.angle += Math.PI / 2; return; }
    if (!city.blocked(nx, ny, 8)) { this.x = nx; this.y = ny; } else { this.angle += 2.2 * dt + 0.4; }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.dead) { ctx.rotate(Math.PI / 2); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 3, 8, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c79b'; ctx.beginPath(); ctx.arc(0, -2, 4, 0, 7); ctx.fill();
    ctx.restore();
  }
}

export function spawnPeds(city, count, rng) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < count * 60) {
    const tx = rng.int(1, 76), ty = rng.int(1, 62);
    if (isRoadTile(tx, ty)) continue;
    const x = tx * TILE + 24, y = ty * TILE + 24;
    if (city.blocked(x, y, 10)) continue;
    peds.push(new Pedestrian(x, y, rng));
  }
  return peds;
}
export { clamp };
