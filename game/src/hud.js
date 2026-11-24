// Neon Tides — HUD: money, health, wanted stars, objective banner, toasts,
// speed, mission tracker, minimap and the title / busted / wasted overlays.
//
// The minimap pre-renders the whole city once at boot onto an offscreen
// canvas and blits it each frame (fix #21: the old code re-scaled the
// 4032x3072 city canvas every frame).

import { WORLD_W, WORLD_H, COLOURS } from './config.js';

const MINI = 168;

export class HUD {
  constructor(city) {
    this.city = city;
    this.toasts = [];
    this._mini = null;
    this._prerenderMinimap();
  }

  _prerenderMinimap() {
    const c = document.createElement('canvas');
    c.width = MINI;
    c.height = Math.round((MINI * WORLD_H) / WORLD_W);
    const g = c.getContext('2d');
    const sx = MINI / WORLD_W;
    const sy = c.height / WORLD_H;
    g.fillStyle = COLOURS.grass;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = COLOURS.road;
    for (let ty = 0; ty < WORLD_H / 48; ty++) {
      for (let tx = 0; tx < WORLD_W / 48; tx++) {
        if (!this.city.isRoadTile(tx, ty)) continue;
        g.fillRect(tx * 48 * sx, ty * 48 * sy, 48 * sx + 1, 48 * sy + 1);
      }
    }
    g.fillStyle = COLOURS.sand;
    g.fillRect(0, (WORLD_H - 4 * 48) * sy, c.width, 2 * 48 * sy);
    g.fillStyle = COLOURS.water;
    g.fillRect(0, (WORLD_H - 2 * 48) * sy, c.width, 2 * 48 * sy);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (const b of this.city.buildings) {
      g.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    }
    this._mini = c;
  }

  toast(text) {
    this.toasts.push({ text, life: 3.2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  _bar(ctx, x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.55)') {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  // Five-point star path, so the wanted level never depends on a font
  // shipping a ★ glyph.
  _star(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  draw(ctx, game) {
    const W = game.view.w;
    const p = game.player;
    const mm = game.missions;

    // --- top-left: money + health ---
    ctx.fillStyle = COLOURS.hudBg;
    ctx.fillRect(14, 12, 210, 64);
    ctx.fillStyle = '#7cff4f';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${Math.floor(p.money)}`, 26, 38);
    this._bar(ctx, 26, 48, 186, 12, p.health / 100, p.health > 30 ? '#7cff4f' : '#ff5252');

    // --- top-right: wanted stars (vector-drawn, no font glyph needed) ---
    const stars = game.stars;
    ctx.fillStyle = COLOURS.hudBg;
    ctx.fillRect(W - 150, 12, 136, 44);
    for (let i = 0; i < 3; i++) {
      this._star(ctx, W - 122 + i * 40, 34, 13, i < stars ? '#ffd32a' : 'rgba(255,255,255,0.25)');
    }

    // --- objective banner (top centre) ---
    const obj = mm.currentText();
    const timerText = mm.active && mm.active.timeLimit
      ? ` — ${Math.max(0, Math.ceil(mm.timer))}s`
      : mm.sideJob && mm.sideJob.kind === 'race'
        ? ` — ${Math.max(0, Math.ceil(mm.sideJob.timer))}s`
        : '';
    const missionLabel = mm.active
      ? `${mm.active.title}: ${obj}${timerText}`
      : mm.sideJob
        ? `${mm.sideJob.title}: ${obj}${timerText}`
        : mm.storyDone
          ? 'Story complete — free roam Port Azure!'
          : 'Drive to the yellow marker to start the next mission';
    ctx.font = 'bold 16px system-ui, sans-serif';
    const tw = ctx.measureText(missionLabel).width + 28;
    ctx.fillStyle = COLOURS.hudBg;
    ctx.fillRect((W - tw) / 2, 12, tw, 34);
    ctx.fillStyle = '#ffd32a';
    ctx.textAlign = 'center';
    ctx.fillText(missionLabel, W / 2, 35);

    // --- toasts ---
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    this.toasts.forEach((t, i) => {
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.fillStyle = 'rgba(10,14,20,0.8)';
      const w = ctx.measureText(t.text).width + 20;
      ctx.fillRect(14, 92 + i * 30, w, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(t.text, 24, 109 + i * 30);
    });
    ctx.globalAlpha = 1;

    // --- minimap (bottom-left), blitted from the one-time prerender ---
    const mh = this._mini.height;
    const mx = 14;
    const my = game.view.h - mh - 14;
    ctx.drawImage(this._mini, mx, my);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, MINI, mh);
    const sx = MINI / WORLD_W;
    const sy = mh / WORLD_H;
    const dot = (x, y, color, r = 4) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Mission / side-job target.
    const target = mm.currentStage() || mm.sideTarget();
    if (target) dot(target.x, target.y, '#ffd32a', 5);
    // Police.
    for (const pc of game.police) dot(pc.car.x, pc.car.y, '#3a86ff', 3.5);
    // Player.
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    dot(px, py, '#fff', 4.5);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx + px * sx, my + py * sy, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    // --- speed (bottom-right) ---
    if (p.inCar) {
      ctx.fillStyle = COLOURS.hudBg;
      ctx.fillRect(W - 150, game.view.h - 58, 136, 44);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h`, W - 82, game.view.h - 28);
      if (p.inCar.wrecked) {
        ctx.fillStyle = '#ff5252';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText('WRECKED — press E to climb out', W - 82, game.view.h - 64);
      }
    } else {
      ctx.fillStyle = 'rgba(10,14,20,0.6)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.fillText('WASD move · Shift sprint · Click/F shoot · E enter car · M mute', W - 14, game.view.h - 18);
    }

    // --- mission tracker (right edge) ---
    if (mm.active || mm.sideJob) {
      const lines = [];
      if (mm.active) {
        lines.push(mm.active.title);
        mm.active.stages.forEach((s, i) => {
          lines.push(`${i < mm.stageIndex ? '✓' : i === mm.stageIndex ? '►' : '·'} ${s.text}`);
        });
      } else if (mm.sideJob) {
        lines.push(mm.sideJob.title);
        lines.push(mm.sideJob.text);
      }
      ctx.font = '13px system-ui, sans-serif';
      let w = 0;
      for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
      w += 24;
      const h = lines.length * 20 + 14;
      ctx.fillStyle = COLOURS.hudBg;
      ctx.fillRect(W - w - 14, 66, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      lines.forEach((l, i) => ctx.fillText(l, W - w - 2, 66 + 22 + i * 20));
    }
  }

  drawTitle(ctx, game) {
    const W = game.view.w;
    const H = game.view.h;
    // Sun-soaked title backdrop: city from above, warm wash.
    ctx.drawImage(this._mini, 0, 0, W, H);
    ctx.fillStyle = 'rgba(20, 30, 60, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('NEON TIDES', W / 2, H * 0.30);
    ctx.fillStyle = '#fff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An open-world crime story in Port Azure', W / 2, H * 0.30 + 36);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText('Steal cars · Outrun the Port Azure PD · Run 5 story missions · Taxi, delivery & street-race side jobs', W / 2, H * 0.30 + 64);

    const labels = game.titleOptions();
    labels.forEach((label, i) => {
      const y = H * 0.52 + i * 48;
      const sel = i === game.titleSel;
      ctx.fillStyle = sel ? '#ffd32a' : 'rgba(10,14,20,0.75)';
      ctx.fillRect(W / 2 - 170, y, 340, 40);
      ctx.fillStyle = sel ? '#111' : '#fff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(label, W / 2, y + 27);
    });
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('WASD / arrows move · mouse aim · Click or F shoot · E enter / exit car · Space handbrake · P pause · M mute', W / 2, H * 0.52 + labels.length * 48 + 30);
    if (game.best > 0) {
      ctx.fillStyle = '#7cff4f';
      ctx.fillText(`Best haul: $${game.best}`, W / 2, H * 0.52 + labels.length * 48 + 54);
    }
    if (game.showHelp) {
      ctx.fillStyle = 'rgba(5,8,14,0.92)';
      ctx.fillRect(W / 2 - 320, H * 0.2, 640, 300);
      ctx.fillStyle = '#ffd32a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('HOW TO PLAY', W / 2, H * 0.2 + 36);
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui, sans-serif';
      const lines = [
        'Move: WASD or arrow keys. Sprint: Shift.',
        'Aim with the mouse. Shoot: left click or F.',
        'Enter a car: walk close and press E. Exit: E.',
        'Drive: W throttle, S brake / reverse, A D steer, Space handbrake.',
        'Follow the yellow marker. Finish missions to unlock side jobs.',
        'Stars mean the Port Azure PD is after you — lose them or get busted.',
        'Busted: you wake at the police station, $100 lighter.',
        'Wasted: you wake at the hospital, $150 lighter.',
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.2 + 70 + i * 26));
      ctx.fillStyle = '#ffd32a';
      ctx.fillText('Click anywhere or press Esc to close', W / 2, H * 0.2 + 70 + lines.length * 26);
    }
  }

  drawOverlay(ctx, game, title, lines, color = '#fff') {
    const W = game.view.w;
    const H = game.view.h;
    ctx.fillStyle = 'rgba(5,8,14,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H * 0.42);
    ctx.fillStyle = '#fff';
    ctx.font = '18px system-ui, sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.42 + 40 + i * 30));
  }
}
