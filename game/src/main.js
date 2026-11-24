// Neon Tides — boot, fixed-step loop and staged screenshots.
// ?seed= picks the world seed. ?shot= stages a scene for screenshots:
//   start — the title screen
//   play  — mid-game, driving on a road with HUD, minimap and mission banner
//   chase — wanted 3 stars with two police cars in pursuit
// Each staged scene paints twice, then sets window.__shotReady so the
// screenshot tool knows the frame is settled.

import { STEP } from './config.js';
import { Game } from './game.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7) || 7;
const shot = params.get('shot') || '';
const debug = params.get('debug') === '1';

const canvas = document.getElementById('game');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

fitCanvas();

const game = new Game(canvas, seed);
window.__game = game;

window.addEventListener('resize', () => {
  fitCanvas();
  game.resize(canvas.width, canvas.height);
});

const statusEl = document.getElementById('status');
function announce() {
  if (!statusEl) return;
  const m = game.missions;
  const obj = m.currentText();
  statusEl.textContent = game.state === 'playing'
    ? `Neon Tides — $${Math.floor(game.player.money)} — wanted ${game.stars} star${game.stars === 1 ? '' : 's'}${obj ? ` — ${obj}` : ''}`
    : `Neon Tides — ${game.state}`;
}

function stageShot(kind) {
  game.startNewGame();
  if (kind === 'start') {
    game.state = 'title';
    game.resetWorld();
    return;
  }
  // play + chase: player already driving on the spawn road.
  game.forceIntoCar('sedan');
  game.player.x = 644;
  game.player.y = 824;
  game.player.inCar.x = 644;
  game.player.inCar.y = 824;
  game.player.inCar.angle = 0;
  game.player.inCar.speed = 160;
  game.camera.x = Math.max(0, 644 - game.view.w / 2);
  game.camera.y = Math.max(0, 824 - game.view.h / 2);
  if (kind === 'chase') {
    game.setHeatForStars(3);
    game.spawnPoliceNear(2);
    // Pull the pursuit cars in close so the chase reads in one frame.
    game.police.forEach((pc, i) => {
      pc.car.x = 644 - 180 - i * 90;
      pc.car.y = 824 + (i === 0 ? -60 : 60);
      pc.car.angle = 0;
      pc.car.speed = 200;
    });
  }
  // Let the world settle a few steps so traffic, peds and particles exist.
  for (let i = 0; i < 30; i++) game.updatePlay(STEP);
  if (kind === 'chase') {
    // Re-assert 3 stars after the settle steps: heat decays during them
    // and would otherwise dip just under the 3-star line at render time.
    game.setHeatForStars(3);
  }
  game.state = 'playing';
}

if (shot) stageShot(shot);

let acc = 0;
let last = performance.now();
let paints = 0;

function markShotReady() {
  window.__shotReady = true;
  // Mirror to the DOM too: some automation harnesses evaluate in an
  // isolated world that cannot see the page's own window properties,
  // but the DOM is always shared.
  document.documentElement.setAttribute('data-shot-ready', 'true');
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!shot) {
    acc += dt;
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
  }
  game.render();
  announce();
  if (debug) {
    const p = game.player;
    document.documentElement.setAttribute('data-dbg', JSON.stringify({
      state: game.state,
      x: Math.round(p.x),
      y: Math.round(p.y),
      money: Math.floor(p.money),
      health: Math.round(p.health),
      stars: game.stars,
      heat: Math.round(game.heat),
      inCar: p.inCar ? p.inCar.type : null,
      speed: p.inCar ? Math.round(Math.abs(p.inCar.speed)) : 0,
      bullets: game.bullets.length,
      peds: game.peds.length,
      cars: game.cars.length,
      police: game.police.length,
      mission: game.missions.active ? game.missions.active.id : null,
      stage: game.missions.currentText(),
      storyIndex: game.missions.storyIndex,
    }));
  }
  if (shot) {
    paints++;
    if (paints >= 2) markShotReady();
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Fallback: never leave a screenshot tool waiting forever.
if (shot) {
  setTimeout(markShotReady, 2000);
}
