// Wanted system and police AI: heat builds from witnessed crimes, decays
// when unobserved, and cruisers chase, ram and try to bust the player.
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
  constructor(car) { this.car = car; }
  update(dt, target, city, fx, audio) {
    const c = this.car;
    if (c.wrecked) return;
    const d = dist(c.x, c.y, target.x, target.y);
    const want = Math.atan2(target.y - c.y, target.x - c.x);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.8, -1, 1);
    // Ram: full throttle until close, then match pace alongside the target.
    const throttle = d > 70 ? 1 : 0.55;
    driveCar(c, { throttle, steer, handbrake: Math.abs(diff) > 2.2 }, dt, city, fx, audio);
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
