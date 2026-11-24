// Neon Tides — the player on foot.
// Walks with WASD/arrows, sprints with Shift, aims toward the mouse while
// firing. walkPhase drives a small ±2px bob in draw() (fix #18: the phase
// used to be computed and never shown, so the player slid like a statue).

import { PLAYER_R, WALK_SPEED, SPRINT_SPEED, COLOURS } from './config.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = PLAYER_R;
    this.angle = -Math.PI / 2;
    this.health = 100;
    this.money = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.inCar = null;
    this.fireCooldown = 0;
  }

  update(dt, input, city) {
    const mv = input.moveVector();
    this.moving = mv.x !== 0 || mv.y !== 0;
    const speed = (input.down('ShiftLeft') || input.down('ShiftRight')) ? SPRINT_SPEED : WALK_SPEED;
    if (this.moving) {
      this.x += mv.x * speed * dt;
      this.y += mv.y * speed * dt;
      this.walkPhase += dt * 11;
      if (!input.firing) this.angle = Math.atan2(mv.y, mv.x);
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    city.resolveCircle(this, this.r);
  }

  draw(ctx) {
    const bob = this.moving ? Math.sin(this.walkPhase) * 2 : 0;
    const by = this.y + bob;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 9, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = COLOURS.player;
    ctx.beginPath();
    ctx.arc(this.x, by, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Facing nose + simple arms that swing with the walk.
    const nx = Math.cos(this.angle);
    const ny = Math.sin(this.angle);
    const swing = this.moving ? Math.sin(this.walkPhase) * 4 : 0;
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x - ny * 6, by + nx * 6 + swing * 0.4);
    ctx.lineTo(this.x - ny * 6 + nx * 8, by + nx * 6 + ny * 8 + swing * 0.4);
    ctx.moveTo(this.x + ny * 6, by - nx * 6 - swing * 0.4);
    ctx.lineTo(this.x + ny * 6 + nx * 8, by - nx * 6 + ny * 8 - swing * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(this.x + nx * 9, by + ny * 9, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
