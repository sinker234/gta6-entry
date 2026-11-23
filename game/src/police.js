// Wanted system and police AI: heat builds from witnessed crimes, decays
// when unobserved, and cruisers chase, ram and try to bust the player.
//
// Round 3 rewrite: police no longer bee-line through buildings. They chase
// along the road grid — first to the nearest intersection, then along the
// centreline that shares an axis with the player — and a stuck timer breaks
// them out if they grind against a wall.
import { clamp, dist } from './random.js';
import { makeCar, driveCar, carSpeed } from './vehicles.js';

export class Wanted {
  constructor() { this.heat = 0; this.bust = 0; this.observed = false; }
  get stars() { return this.heat <= 0 ? 0 : Math.min(5, 1 + Math.floor(this.heat / 30)); }
  addHeat(amount, witnessed = true) { if (witnessed) this.heat = clamp(this.heat + amount, 0, 150); }
  update(dt, observed) {
    this.observed = observed;
    if (!observed && this.heat > 0) this.heat = Math.max(0, this.heat - dt * 2.2);
  }
  clear() { this.heat = 0; this.bust = 0; }
}

export class PoliceCar {
  constructor(car) { this.car = car; this.waypoint = null; this.stuck = 0; this.reverseT = 0; }
  // Pick the next road waypoint on the way to the target: if the player is on
  // (or near) the same vertical or horizontal centreline, drive straight at
  // them along it; otherwise head for the nearest intersection first, then
  // re-evaluate from there.
  pickWaypoint(target, city) {
    const { v, h } = city.roadCenterlines();
    const c = this.car;
    const nearestV = v.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a, v[0]);
    const nearestH = h.reduce((a, b) => Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a, h[0]);
    if (Math.abs(target.x - nearestV) < 72) return { x: nearestV, y: target.y };
    if (Math.abs(target.y - nearestH) < 72) return { x: target.x, y: nearestH };
    // Neither axis lines up: go to the nearest intersection, which sits on
    // both a vertical and a horizontal road, then pick again from there.
    return { x: nearestV, y: nearestH };
  }
  update(dt, target, city, fx, audio) {
    const c = this.car;
    if (c.wrecked) return;
    // Stuck detection: a wall right ahead while trying to move.
    const aheadX = c.x + Math.cos(c.angle) * 62, aheadY = c.y + Math.sin(c.angle) * 62;
    if (city.blocked(aheadX, aheadY, 6) && carSpeed(c) < 40) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck > 2) {
      // Break out: back up briefly, then retarget via the nearest intersection.
      this.reverseT = 0.8; this.stuck = 0; this.waypoint = null;
    }
    if (!this.waypoint || dist(c.x, c.y, this.waypoint.x, this.waypoint.y) < 80) {
      this.waypoint = this.pickWaypoint(target, city);
    }
    // Close in: once the player is near and roughly ahead, drop the waypoint
    // and ram directly so the chase still feels aggressive at short range.
    const d = dist(c.x, c.y, target.x, target.y);
    const goal = d < 170 ? target : this.waypoint;
    const want = Math.atan2(goal.y - c.y, goal.x - c.x);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.8, -1, 1);
    // Ram: full throttle until close, then match pace alongside the target.
    let throttle = d > 70 ? 1 : 0.55;
    let handbrake = Math.abs(diff) > 2.2;
    if (this.reverseT > 0) { this.reverseT -= dt; throttle = -0.8; handbrake = false; }
    driveCar(c, { throttle, steer, handbrake }, dt, city, fx, audio);
  }
}

export function spawnPolice(city, player, rng, existing) {
  // Spawn just off-screen on a road, never on top of the player.
  const { v, h } = city.roadCenterlines();
  for (let tries = 0; tries < 12; tries++) {
    const onV = rng.chance(0.5);
    const x = onV ? rng.pick(v) : player.x + rng.range(-700, 700);
    const y = onV ? player.y + rng.range(-700, 700) : rng.pick(h);
    if (dist(x, y, player.x, player.y) < 380) continue;
    if (city.blocked(x, y, 22)) continue;
    const car = makeCar('police', x, y, rng.range(0, 6.28), '#1c2733', { driver: 'police' });
    return new PoliceCar(car);
  }
  return null;
}

export function desiredPolice(stars) { return [0, 1, 2, 3, 4, 6][stars] ?? 0; }
export { carSpeed };
