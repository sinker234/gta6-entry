// Cars: arcade physics, traffic AI on the road grid, parked cars to steal.
import { CAR_TYPES, TILE } from './config.js';
import { clamp, dist } from './random.js';

let nextId = 1;
export function makeCar(type, x, y, angle, color, opts = {}) {
  const spec = CAR_TYPES[type];
  return {
    id: nextId++, type, spec, x, y, angle, vx: 0, vy: 0, speed: 0,
    w: spec.w, h: spec.h, color: color ?? spec.colors[0], hp: spec.hp,
    driver: opts.driver ?? null, // 'traffic' | 'police' | 'player' | null (parked)
    ai: opts.ai ?? null, wrecked: false, smokeT: 0,
  };
}

export function carSpeed(car) { return Math.hypot(car.vx, car.vy); }

// Player / generic arcade driving. input: {throttle -1..1, steer -1..1, handbrake}
export function driveCar(car, input, dt, city, fx, audio) {
  // Wrecked cars can't accelerate: throttle dies, steering goes mushy, the
  // car coasts to a stop instead of driving around like nothing happened.
  if (car.wrecked) input = { throttle: 0, steer: input.steer * 0.4, handbrake: false };
  const fwdX = Math.cos(car.angle), fwdY = Math.sin(car.angle);
  const fwdSpeed = car.vx * fwdX + car.vy * fwdY;
  const accel = input.throttle > 0 ? car.spec.accel : car.spec.accel * 0.6;
  let ns = fwdSpeed + input.throttle * accel * dt;
  ns -= ns * (input.handbrake ? 1.8 : 0.35) * dt; // drag / brake
  ns = clamp(ns, -car.spec.maxSpeed * 0.45, car.spec.maxSpeed);
  const steerAuthority = clamp(Math.abs(ns) / 120, 0, 1) * (ns < 0 ? -1 : 1);
  car.angle += input.steer * 2.4 * steerAuthority * dt * (input.handbrake ? 1.5 : 1);
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  const latX = -nfy, latY = nfx;
  const latSpeed = car.vx * latX + car.vy * latY;
  const grip = input.handbrake ? 1.6 : car.spec.grip;
  const keptLat = latSpeed * Math.exp(-grip * dt);
  car.vx = nfx * ns + latX * keptLat;
  car.vy = nfy * ns + latY * keptLat;
  car.speed = ns;
  const sliding = Math.abs(latSpeed) > 55;
  if (sliding && Math.abs(ns) > 60) {
    fx.addSkid(car.x - nfx * 14 + latX * 9, car.y - nfy * 14 + latY * 9);
    fx.addSkid(car.x - nfx * 14 - latX * 9, car.y - nfy * 14 - latY * 9);
    if (Math.random() < 0.3) fx.smoke(car.x, car.y, 1);
    if (audio && Math.random() < 0.25) audio.skid();
  }
  car.x += car.vx * dt; car.y += car.vy * dt;
  if (city.resolveCircle(car, 20)) {
    const impact = Math.abs(fwdSpeed - ns) + carSpeed(car) * 0.4;
    if (carSpeed(car) > 130) { damageCar(car, 6, fx); fx.sparks(car.x, car.y); audio?.crash(false); fx.addShake(3); }
    car.vx *= 0.35; car.vy *= 0.35;
  }
  if (car.hp < 35 && !car.wrecked) { car.smokeT -= dt; if (car.smokeT <= 0) { car.smokeT = 0.12; fx.smoke(car.x, car.y, 2); } }
  if (car.hp <= 0) car.wrecked = true;
  return sliding;
}

export function damageCar(car, amount, fx) {
  car.hp -= amount;
  if (fx) fx.sparks(car.x, car.y);
  if (car.hp <= 0) car.wrecked = true;
}

// Traffic AI: follow lane centrelines, turn at intersections, stop for trouble.
export class TrafficCar {
  constructor(car, city) { this.car = car; this.city = city; this.target = null; this.stuck = 0; this.pickTarget(); }
  pickTarget() {
    const { v, h } = this.city.roadCenterlines();
    const c = this.car;
    // (Round 3) Stay on the road grid: 70% of the time pick a point on the
    // same centreline the car is already on (only one axis changes), so the
    // car drives along roads to the next intersection instead of bee-lining
    // through buildings. The rest of the time pick any intersection.
    const nearestV = v.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a, v[0]);
    const nearestH = h.reduce((a, b) => Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a, h[0]);
    let tx, ty;
    if (Math.random() < 0.7) {
      if (Math.random() < 0.5) { tx = nearestV; ty = c.y + (Math.random() - 0.5) * 900; }
      else { tx = c.x + (Math.random() - 0.5) * 900; ty = nearestH; }
    } else {
      tx = v[Math.floor(Math.random() * v.length)]; ty = h[Math.floor(Math.random() * h.length)];
    }
    this.target = { x: Math.max(60, Math.min(3800, tx)), y: Math.max(60, Math.min(3000, ty)) };
  }
  update(dt, obstacles, fx, audio) {
    const c = this.car;
    if (c.wrecked || c.driver !== 'traffic') return;
    if (!this.target || dist(c.x, c.y, this.target.x, this.target.y) < 90) this.pickTarget();
    const want = Math.atan2(this.target.y - c.y, this.target.x - c.x);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.6, -1, 1);
    // Stop when something is right ahead.
    const aheadX = c.x + Math.cos(c.angle) * 62, aheadY = c.y + Math.sin(c.angle) * 62;
    let blocked = this.city.blocked(aheadX, aheadY, 6);
    for (const o of obstacles) { if (o !== c && dist(aheadX, aheadY, o.x, o.y) < 46) { blocked = true; break; } }
    const throttle = blocked ? (carSpeed(c) > 12 ? -0.7 : 0) : 0.75;
    if (blocked) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 2.5) { this.pickTarget(); this.stuck = 0; }
    driveCar(c, { throttle, steer, handbrake: false }, dt, this.city, fx, audio);
  }
}

export function drawCar(ctx, car, time) {
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
  const { w, h } = car;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,45,0.9)'; ctx.fillRect(-w * 0.12, -h / 2 + 3, w * 0.3, h - 6); // windshield/cabin
  ctx.fillStyle = '#111'; // wheels
  for (const [wx, wy] of [[-w / 2 + 7, -h / 2 - 2], [w / 2 - 7, -h / 2 - 2], [-w / 2 + 7, h / 2 - 2], [w / 2 - 7, h / 2 - 2]]) ctx.fillRect(wx - 5, wy, 10, 4);
  if (car.type === 'taxi') { ctx.fillStyle = '#111'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, 3); }
  if (car.type === 'police') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 + 6, -h / 2 + 2, w - 12, h - 4);
    ctx.fillStyle = (Math.floor(time * 3) % 2 === 0) ? '#ff3355' : '#3388ff';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#122'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PD', -w / 4, 3);
  }
  // Headlight glow cones.
  ctx.fillStyle = 'rgba(255,240,180,0.20)';
  ctx.beginPath(); ctx.moveTo(w / 2, -h / 3); ctx.lineTo(w / 2 + 52, -h / 1.4); ctx.lineTo(w / 2 + 52, h / 1.4); ctx.lineTo(w / 2, h / 3); ctx.fill();
  ctx.restore();
  if (car.hp < 100 && !car.wrecked) { // damage bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(car.x - 22, car.y - 26, 44, 5);
    ctx.fillStyle = car.hp > 40 ? '#7cff4f' : '#ff5252'; ctx.fillRect(car.x - 21, car.y - 25, 42 * Math.max(0, car.hp / car.spec.hp), 3);
  }
}
