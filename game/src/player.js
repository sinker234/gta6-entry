// Kai Mercer on foot: movement, aiming, punching and pistol fire.
import { clamp } from './random.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.health = 100; this.angle = 0; this.weapon = 'fists';
    this.inCar = null; this.punchCd = 0; this.shotCd = 0; this.walkPhase = 0; this.speedNow = 0;
  }
  update(dt, input, city, aimWorld) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.angle = Math.atan2(aimWorld.y - this.y, aimWorld.x - this.x);
    let mx = 0, my = 0;
    if (input.down('KeyW', 'ArrowUp')) my -= 1;
    if (input.down('KeyS', 'ArrowDown')) my += 1;
    if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.down('KeyD', 'ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my) || 1;
    const sprint = input.down('ShiftLeft', 'ShiftRight');
    const speed = sprint ? 235 : 145;
    this.vx = (mx / len) * (mx || my ? speed : 0);
    this.vy = (my / len) * (mx || my ? speed : 0);
    this.speedNow = Math.hypot(this.vx, this.vy);
    if (this.speedNow > 1) this.walkPhase += dt * (sprint ? 13 : 9);
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!city.blocked(nx, this.y, 11)) this.x = nx;
    if (!city.blocked(this.x, ny, 11)) this.y = ny;
    city.resolveCircle(this, 11);
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 5, 10, 5, 0, 0, 7); ctx.fill();
    ctx.rotate(this.angle);
    // Body in cyan jacket, head, and gun/fist arm.
    ctx.fillStyle = '#0e7c9c'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#00e5ff'; ctx.fillRect(-4, -10, 12, 20);
    ctx.fillStyle = '#f2c79b'; ctx.beginPath(); ctx.arc(1, 0, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#20303c';
    if (this.weapon === 'pistol') ctx.fillRect(8, -2, 12, 4);
    else ctx.fillRect(8, -2, 6, 4);
    ctx.restore();
    // Direction tick toward aim.
    ctx.strokeStyle = 'rgba(0,229,255,0.5)'; ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(this.angle) * 16, this.y + Math.sin(this.angle) * 16);
    ctx.lineTo(this.x + Math.cos(this.angle) * 24, this.y + Math.sin(this.angle) * 24); ctx.stroke();
  }
  healFull() { this.health = 100; }
}
export { clamp };
