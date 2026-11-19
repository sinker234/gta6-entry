// Particles, skid marks, muzzle flashes and screen shake.
export class Effects {
  constructor() { this.particles = []; this.skids = []; this.shake = 0; this.flashes = []; }
  burst(x, y, color, n = 10, speed = 160, life = 0.5, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  smoke(x, y, n = 2) { this.burst(x, y, 'rgba(200,200,200,0.7)', n, 40, 0.9, 6); }
  sparks(x, y) { this.burst(x, y, '#ffd34d', 8, 220, 0.3, 2); }
  muzzle(x, y, angle) { this.flashes.push({ x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20, life: 0.06 }); this.burst(x, y, '#ffe9a3', 3, 90, 0.15, 2); }
  addSkid(x, y) { this.skids.push({ x, y, life: 6 }); if (this.skids.length > 900) this.skids.splice(0, this.skids.length - 900); }
  addShake(amount) { this.shake = Math.min(14, this.shake + amount); }
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }
  drawWorld(ctx) {
    ctx.fillStyle = 'rgba(20,20,24,0.55)';
    for (const s of this.skids) { ctx.globalAlpha = Math.min(0.55, s.life); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(f.x, f.y, 12, 0, 7); ctx.fill(); }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  shakeOffset() { return { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake }; }
}
