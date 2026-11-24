// Neon Tides — particles, screen shake and floating text.

export class FX {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  puff(x, y) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 20,
      vy: -30 - Math.random() * 20,
      life: 0.7,
      max: 0.7,
      color: '#888888',
      size: 5 + Math.random() * 4,
    });
  }

  floatText(x, y, text, color = '#ffd32a') {
    this.texts.push({ x, y, text, color, life: 1.1 });
  }

  addShake(amount) {
    this.shake = Math.min(14, this.shake + amount);
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.2, dt);
      p.vy *= Math.pow(0.2, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.y -= 34 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 26);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life));
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
