// Neon Tides — pedestrians.
// They wander road to road, flee when scared (gunshots, carjackings), and
// walk with a small bob (fix #18). The dead fade out: a body stays visible
// for 30 seconds, fading over its last 5, then the game removes it (fix #12).

import { COLOURS } from './config.js';

export class Ped {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.r = 10;
    this.color = rng.pick(COLOURS.ped);
    this.speed = rng.range(42, 68);
    this.angle = rng.range(0, Math.PI * 2);
    this.target = null;
    this.walkPhase = rng.range(0, Math.PI * 2);
    this.moving = false;
    this.dead = false;
    this.deadTime = 0;
    this.fleeUntil = 0;
    this.fleeX = 0;
    this.fleeY = 0;
  }

  scare(fromX, fromY, now) {
    if (this.dead) return;
    this.fleeUntil = now + 3;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.fleeX = this.x + Math.cos(a) * 320;
    this.fleeY = this.y + Math.sin(a) * 320;
  }

  update(dt, city, rng, now) {
    if (this.dead) {
      this.deadTime += dt;
      return;
    }
    let tx;
    let ty;
    let speed = this.speed;
    if (now < this.fleeUntil) {
      tx = this.fleeX;
      ty = this.fleeY;
      speed = this.speed * 2.4;
    } else {
      if (!this.target || Math.hypot(this.target.x - this.x, this.target.y - this.y) < 24) {
        this.target = city.randomRoadPoint(rng);
      }
      tx = this.target.x;
      ty = this.target.y;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    this.moving = d > 4;
    if (this.moving) {
      this.angle = Math.atan2(dy, dx);
      this.x += (dx / d) * speed * dt;
      this.y += (dy / d) * speed * dt;
      this.walkPhase += dt * 9;
    }
    city.resolveCircle(this, this.r);
  }

  draw(ctx) {
    if (this.dead) {
      // Lying body, fading out over the last 5 of its 30 seconds.
      const fade = this.deadTime > 25 ? Math.max(0, 1 - (this.deadTime - 25) / 5) : 1;
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 14, 7, this.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x - Math.cos(this.angle) * 8, this.y - Math.sin(this.angle) * 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    const bob = this.moving ? Math.sin(this.walkPhase) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 8, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(this.angle) * 4, this.y + bob + Math.sin(this.angle) * 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function spawnPeds(city, rng, count, nearX, nearY) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng, nearX, nearY, 120);
    peds.push(new Ped(p.x, p.y, rng));
  }
  return peds;
}
