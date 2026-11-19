// Neon Tides bootstrap: build the game, honour ?shot=1..4 staging for
// screenshots, and start the loop. First input unlocks audio (browser rule).
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  const n = Number.parseInt(shot, 10);
  if (n >= 1 && n <= 4) game.stageShot(n);
}
window.__neonTides = game;
game.start();
