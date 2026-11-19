// HUD and minimap, drawn on the main canvas in screen space.
import { WORLD_W, WORLD_H } from './config.js';
import { clamp } from './random.js';

export function drawHUD(ctx, view, game) {
  const { w, h } = view;
  const p = game.player, save = game.saveData;
  ctx.save();
  ctx.font = '600 15px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'left';
  // Money + health, top-left.
  ctx.fillStyle = 'rgba(8,10,22,0.72)'; ctx.beginPath(); ctx.roundRect(12, 12, 218, 64, 10); ctx.fill();
  ctx.fillStyle = '#7cff4f'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText(`$${save.money}`, 24, 40);
  ctx.fillStyle = '#3a4358'; ctx.fillRect(24, 47, 190, 11);
  ctx.fillStyle = p.health > 30 ? '#ff4d6d' : '#ff2222'; ctx.fillRect(24, 47, 190 * clamp(p.health / 100, 0, 1), 11);
  ctx.fillStyle = '#fff'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('KAI MERCER — PORT AZURE', 24, 71);
  // Wanted stars, top-right.
  const stars = game.wanted.stars;
  ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < stars ? '#ffd34d' : 'rgba(255,255,255,0.25)'; ctx.fillText('★', w - 16 - (4 - i) * 30, 40); }
  if (game.wanted.bust > 0.02) {
    ctx.fillStyle = 'rgba(8,10,22,0.72)'; ctx.fillRect(w - 216, 52, 200, 14);
    ctx.fillStyle = '#ff5252'; ctx.fillRect(w - 214, 54, 196 * game.wanted.bust, 10);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.fillText('BUST METER', w - 16, 50);
  }
  // Weapon / vehicle + speed, bottom-right.
  ctx.textAlign = 'right'; ctx.font = '600 15px system-ui, sans-serif'; ctx.fillStyle = '#fff';
  const mode = p.inCar ? `${p.inCar.type.toUpperCase()} · ${Math.round(Math.abs(p.inCar.speed) * 0.22)} mph · HP ${Math.max(0, Math.round(p.inCar.hp))}` : (p.weapon === 'pistol' ? 'PISTOL' : 'FISTS');
  ctx.fillStyle = 'rgba(8,10,22,0.72)'; ctx.beginPath(); ctx.roundRect(w - 286, h - 46, 274, 34, 8); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(mode, w - 24, h - 24);
  if (game.audio.muted) { ctx.fillStyle = '#ffd34d'; ctx.fillText('MUTED (M)', w - 24, h - 56); }
  // Objective banner, top-centre.
  const obj = game.missions.objective;
  ctx.textAlign = 'center';
  if (obj) {
    ctx.font = '600 15px system-ui, sans-serif';
    const tw = ctx.measureText(obj.text).width + 90;
    ctx.fillStyle = 'rgba(8,10,22,0.78)'; ctx.beginPath(); ctx.roundRect(w / 2 - tw / 2, 12, tw, 36, 10); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillText('◆ ' + obj.text + (obj.timer > 0 ? `  ⏱ ${Math.ceil(obj.timer)}s` : ''), w / 2, 36);
  }
  // Toast (dialogue), bottom-centre.
  if (game.toastText && game.toastT > 0) {
    ctx.font = 'italic 15px system-ui, sans-serif';
    const tw = Math.min(w - 80, ctx.measureText(game.toastText).width + 32);
    ctx.fillStyle = 'rgba(8,10,22,0.85)'; ctx.beginPath(); ctx.roundRect(w / 2 - tw / 2, h - 92, tw, 34, 8); ctx.fill();
    ctx.fillStyle = '#ffe9f4'; ctx.fillText(game.toastText, w / 2, h - 70);
  }
  if (game.prompt) {
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.fillStyle = '#00e5ff';
    ctx.fillText(game.prompt, w / 2, h - 110);
  }
  if (game.bannerT > 0) {
    ctx.globalAlpha = clamp(game.bannerT, 0, 1);
    ctx.font = 'bold 44px system-ui, sans-serif'; ctx.fillStyle = '#ffd34d';
    ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 24;
    ctx.fillText(game.bannerText, w / 2, h * 0.32); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  drawMinimap(ctx, view, game);
  ctx.restore();
}

function drawMinimap(ctx, view, game) {
  const size = 168, x = view.w - size - 14, y = view.h - size - 58;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,22,0.8)'; ctx.beginPath(); ctx.roundRect(x - 4, y - 4, size + 8, size + 8, 8); ctx.fill();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  ctx.drawImage(game.city.canvas, 0, 0, WORLD_W, WORLD_H, x, y, size, size);
  const sx = (wx) => x + (wx / WORLD_W) * size, sy = (wy) => y + (wy / WORLD_H) * size;
  // Police blips.
  ctx.fillStyle = '#3388ff';
  for (const cop of game.police) { ctx.beginPath(); ctx.arc(sx(cop.car.x), sy(cop.car.y), 3.5, 0, 7); ctx.fill(); }
  // Objective blip (pulsing gold).
  const obj = game.missions.objective;
  if (obj?.marker) {
    ctx.fillStyle = '#ffd34d'; const r = 5 + Math.sin(performance.now() / 200) * 1.6;
    ctx.beginPath(); ctx.arc(sx(obj.marker.x), sy(obj.marker.y), r, 0, 7); ctx.fill();
  }
  // Mission giver blip.
  if (game.missionMarker) { ctx.fillStyle = '#ff2e88'; ctx.beginPath(); ctx.arc(sx(game.missionMarker.x), sy(game.missionMarker.y), 4.5, 0, 7); ctx.fill(); }
  // Player arrow.
  const p = game.player, px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  const ang = p.inCar ? p.inCar.angle : p.angle;
  ctx.translate(sx(px), sy(py)); ctx.rotate(ang);
  ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.fill();
  ctx.restore();
}
