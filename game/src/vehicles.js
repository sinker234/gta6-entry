// Neon Tides — vehicles.
// Arcade driving: throttle/steer/handbrake on a heading + speed model.
// A wrecked car (hp <= 0) loses its throttle and coasts to a stop (fix #7);
// damage clamps hp at 0 and the damage bar never draws a negative width
// (fix #15). Traffic drives road to road: 70% of new targets stay on the
// car's current road line (only one axis changes), 30% any intersection,
// and a car stuck for 2.5s retargets (fix #9, traffic half).

import { TILE, BEACH_TOP } from './config.js';

export const SPECS = {
  sedan: { name: 'Sedan', color: '#c0392b', hp: 100, accel: 260, top: 330, grip: 2.6, len: 46, wid: 24 },
  sports: { name: 'Sports', color: '#f39c12', hp: 80, accel: 340, top: 430, grip: 3.1, len: 46, wid: 23 },
  taxi: { name: 'Taxi', color: '#f1c40f', hp: 100, accel: 250, top: 320, grip: 2.6, len: 46, wid: 24 },
  truck: { name: 'Truck', color: '#7f8c8d', hp: 160, accel: 180, top: 260, grip: 2.1, len: 58, wid: 28 },
  police: { name: 'Interceptor', color: '#2c6fd6', hp: 140, accel: 320, top: 400, grip: 3.0, len: 48, wid: 25 },
};

let nextCarId = 1;

export function makeCar(type, x, y, angle = 0) {
  const spec = SPECS[type] || SPECS.sedan;
  return {
    id: nextCarId++,
    type,
    spec,
    x,
    y,
    angle,
    speed: 0,
    hp: spec.hp,
    wrecked: false,
    driver: null, // 'traffic' | 'police' | null (parked / stolen)
    smokeT: 0,
  };
}

export function carSpeed(car) {
  return Math.abs(car.speed);
}

export function damageCar(car, amount, fx) {
  if (car.wrecked) return;
  car.hp = Math.max(0, car.hp - amount); // clamp: hp never goes negative (fix #15)
  if (car.hp <= 0) {
    car.wrecked = true;
    if (fx) fx.burst(car.x, car.y, '#888888', 14);
  }
}

// input: { throttle: -1..1, steer: -1..1, handbrake: bool }
export function driveCar(car, input, dt, city, fx) {
  if (car.wrecked) {
    // Wrecked: no throttle, heavy steering loss, coast to a stop (fix #7).
    input = { throttle: 0, steer: input.steer * 0.4, handbrake: false };
  }
  const spec = car.spec;

  car.speed += input.throttle * spec.accel * dt;
  if (input.handbrake) car.speed *= Math.pow(0.12, dt);
  else car.speed *= Math.pow(0.35, dt); // rolling drag
  if (car.speed > spec.top) car.speed = spec.top;
  if (car.speed < -spec.top * 0.45) car.speed = -spec.top * 0.45;
  if (Math.abs(car.speed) < 2 && input.throttle === 0) car.speed = 0;

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 90);
  car.angle += input.steer * spec.grip * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  city.resolveCircle(car, spec.len / 2 - 4);
  if (car.wrecked || car.hp < 40) {
    car.smokeT -= dt;
    if (car.smokeT <= 0 && fx) {
      car.smokeT = 0.12;
      fx.puff(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14);
    }
  }
}

export class TrafficCar {
  constructor(car, city, rng) {
    this.car = car;
    this.city = city;
    this.rng = rng;
    this.target = null;
    this.stuckT = 0;
    this.lastX = car.x;
    this.lastY = car.y;
    this.pickTarget();
  }

  pickTarget() {
    const c = this.car;
    const rng = this.rng;
    const onVertical = (Math.floor(c.x / TILE) % 12) < 3;
    const onHorizontal = (Math.floor(c.y / TILE) % 12) < 3;
    if (rng.chance(0.7) && (onVertical || onHorizontal)) {
      // Same road line: only one axis changes.
      if (onVertical && (!onHorizontal || rng.chance(0.5))) {
        const col = this.city.roadColCenter(c.x);
        this.target = { x: col + rng.range(-10, 10), y: rng.range(TILE * 2, BEACH_TOP - TILE) };
      } else {
        const row = this.city.roadRowCenter(c.y);
        this.target = { x: rng.range(TILE * 2, 4032 - TILE * 2), y: row + rng.range(-10, 10) };
      }
    } else {
      // Any intersection.
      const ix = (rng.int(0, 7) * 12 + 1) * TILE + TILE / 2;
      const iy = (rng.int(0, 5) * 12 + 1) * TILE + TILE / 2;
      this.target = { x: ix, y: iy };
    }
  }

  update(dt, fx) {
    const c = this.car;
    if (c.wrecked) return;
    if (!this.target) this.pickTarget();
    const dx = this.target.x - c.x;
    const dy = this.target.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) {
      this.pickTarget();
      return;
    }
    const want = Math.atan2(dy, dx);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const throttle = dist < 120 ? 0.45 : 0.8;
    driveCar(c, { throttle, steer, handbrake: false }, dt, this.city, fx);

    // Stuck detection: barely moved in one frame while trying to drive.
    // A car at cruise moves well over 1px/frame; under 0.4px it is jammed.
    const moved = Math.hypot(c.x - this.lastX, c.y - this.lastY);
    if (moved < 0.4) this.stuckT += dt;
    else this.stuckT = 0;
    this.lastX = c.x;
    this.lastY = c.y;
    if (this.stuckT > 2.5) {
      this.stuckT = 0;
      this.pickTarget();
    }
  }
}

export function drawCar(ctx, car) {
  const spec = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = spec.len;
  const W = spec.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L, W);
  // Body.
  ctx.fillStyle = car.wrecked ? '#5a5a5a' : spec.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Windshield + rear window.
  ctx.fillStyle = car.wrecked ? '#333' : '#bfe3f0';
  roundRect(ctx, L * 0.08, -W / 2 + 4, L * 0.22, W - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,40,60,0.85)';
  roundRect(ctx, -L * 0.34, -W / 2 + 4, L * 0.16, W - 8, 4);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 5);
  // Police livery.
  if (car.type === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L * 0.1, -W / 2, L * 0.2, W);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
  }
  // Taxi sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-6, -W / 2 - 2, 12, 5);
  }
  ctx.restore();
  // Damage bar (never a negative width — fix #15).
  if (car.hp < car.spec.hp) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(car.x - 21, car.y - 25, 42, 3);
    ctx.fillStyle = car.hp > 40 ? '#7cff4f' : '#ff5252';
    ctx.fillRect(car.x - 21, car.y - 25, 42 * Math.max(0, car.hp / car.spec.hp), 3);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
