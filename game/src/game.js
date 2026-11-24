// Neon Tides — the Game: states, loop, collisions, wanted level, respawns.
// Fixes carried here (see review-round3):
//  #5  no instant-ray ped kill on shoot — only flying bullets; the
//      bullet-vs-car loop skips spent bullets and breaks after one hit.
//  #6  cars can hit the on-foot player (knockback, damage over 60 speed).
//  #8  carjack driver = nearest ALIVE ped within 80px, else no driver.
//  #10 NO per-frame heat top-up for heat-escape (that lives once in
//      missions.startStory via forceStars).
//  #11 wanted-clear removes police cars from cars[] and traffic[] and
//      clears police[].
//  #12 every 5s: top live peds up to 40 (off-screen road spawns), traffic
//      up to 10, drop peds dead over 30s.
//  #13 title CONTINUE only clickable when a save exists.
//  #14 pausing zeroes engine/siren gains.
//  #17 enter-car search skips wrecked cars.
//  #19 E exits a wrecked car at any speed.

import {
  WORLD_W, WORLD_H, BULLET_SPEED, FIRE_INTERVAL,
  RESPAWN, WANTED, starsForHeat,
} from './config.js';
import { City, PLAYER_SPAWN as SPAWN } from './city.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Ped, spawnPeds } from './pedestrians.js';
import { makeCar, driveCar, damageCar, carSpeed, TrafficCar, drawCar } from './vehicles.js';
import { PoliceCar } from './police.js';
import { MissionManager, STORY, SIDE_PADS } from './missions.js';
import { FX } from './effects.js';
import { AudioSys } from './audio.js';
import { HUD } from './hud.js';
import { loadSave, writeSave } from './save.js';

const PARKED_SPOTS = [
  { type: 'sedan', x: 700, y: 824, angle: 0 },
  { type: 'sports', x: 644, y: 900, angle: Math.PI / 2 },
  { type: 'taxi', x: 760, y: 760, angle: Math.PI },
  { type: 'sports', x: 1824, y: 1330, angle: 0 },
  { type: 'truck', x: 2900, y: 580, angle: Math.PI / 2 },
];

export class Game {
  constructor(canvas, seed = 7) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = seed;
    this.rng = makeRng(seed);
    this.view = { w: canvas.width, h: canvas.height };
    this.city = new City(seed);
    this.input = new Input(canvas);
    this.fx = new FX();
    this.audio = new AudioSys();
    this.hud = new HUD(this.city);
    this.missions = new MissionManager(this);
    this.player = new Player(SPAWN.x, SPAWN.y);
    this.camera = { x: 0, y: 0, w: this.view.w, h: this.view.h };
    this.state = 'title'; // title | playing | paused | busted | wasted | storycomplete
    this.stateT = 0;
    this.time = 0;
    this.heat = 0;
    this.stars = 0;
    this.bullets = [];
    this.peds = [];
    this.cars = [];
    this.traffic = [];
    this.police = [];
    this.markedCar = null;
    this.markedCarDelivered = false;
    this.titleSel = 0;
    this.showHelp = false;
    this.best = 0;
    this.nextMissionT = 0;
    this.respawnT = 0;
    this._vignette = null;

    const save = loadSave();
    this.save = save;
    this.hasExistingSave = !!save;
    if (save) {
      this.best = save.best || 0;
      this.audio.setMuted(!!save.muted);
    }
    this.resetWorld();
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.view.w = w;
    this.view.h = h;
    this.camera.w = w;
    this.camera.h = h;
    this._vignette = null;
  }

  titleOptions() {
    const opts = ['NEW GAME', 'HOW TO PLAY'];
    if (this.hasExistingSave) opts.push('CONTINUE');
    return opts;
  }

  // ---- world setup ------------------------------------------------------

  resetWorld() {
    this.peds = spawnPeds(this.city, this.rng, 46, this.player.x, this.player.y);
    this.cars = [];
    this.traffic = [];
    this.police = [];
    this.bullets = [];
    for (let i = 0; i < 12; i++) {
      const p = this.city.randomRoadPoint(this.rng, this.player.x, this.player.y, 200);
      const type = this.rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports']);
      const car = makeCar(type, p.x, p.y, this.rng.range(0, Math.PI * 2));
      car.driver = 'traffic';
      this.cars.push(car);
      this.traffic.push(new TrafficCar(car, this.city, this.rng));
    }
    for (const s of PARKED_SPOTS) {
      const car = makeCar(s.type, s.x, s.y, s.angle);
      car.driver = null;
      this.cars.push(car);
    }
    this.markedCar = null;
    this.markedCarDelivered = false;
  }

  startNewGame() {
    this.player = new Player(SPAWN.x, SPAWN.y);
    this.player.money = 0;
    this.heat = 0;
    this.stars = 0;
    this.missions = new MissionManager(this);
    this.resetWorld();
    this.state = 'playing';
    this.missions.startStory(0);
    this.audio.ensure();
  }

  continueGame() {
    if (!this.save) return;
    this.startNewGame();
    this.player.money = this.save.money || 0;
    this.missions.storyIndex = this.save.storyIndex || 0;
    if (this.missions.storyIndex >= STORY.length) {
      this.missions.storyDone = true;
      this.missions.active = null;
    } else {
      this.missions.startStory(this.missions.storyIndex);
    }
  }

  saveGame() {
    this.best = Math.max(this.best, Math.floor(this.player.money));
    writeSave({
      money: Math.floor(this.player.money),
      storyIndex: this.missions.storyIndex,
      best: this.best,
      muted: this.audio.muted,
    });
    this.hasExistingSave = true;
  }

  // ---- helpers used by missions / shots ---------------------------------

  toast(text) {
    this.hud.toast(text);
  }

  earn(amount, kind) {
    this.player.money += amount;
    this.best = Math.max(this.best, Math.floor(this.player.money));
    this.fx.floatText(this.player.x, this.player.y - 24, `+$${amount}`, '#7cff4f');
    void kind;
  }

  crime(amount, x, y) {
    this.heat = Math.min(100, this.heat + amount);
    void x;
    void y;
  }

  setHeatForStars(n) {
    const need = n >= 3 ? WANTED.star3 : n === 2 ? WANTED.star2 : WANTED.star1;
    this.heat = Math.max(this.heat, need);
    this.stars = starsForHeat(this.heat);
  }

  spawnMarkedCar() {
    if (this.markedCar) return;
    const car = makeCar('sports', 2900, 500, Math.PI / 2);
    car.driver = null;
    car.marked = true;
    this.cars.push(car);
    this.markedCar = car;
    this.toast('Marked car waiting at the docks — look for the gold sports car.');
  }

  spawnPoliceNear(n) {
    for (let i = 0; i < n; i++) {
      const p = this.city.randomRoadPoint(this.rng, this.player.x, this.player.y, 500);
      const car = makeCar('police', p.x, p.y, 0);
      car.driver = 'police';
      this.cars.push(car);
      this.police.push(new PoliceCar(car, this.city));
    }
  }

  forceIntoCar(type = 'sedan') {
    const p = this.player;
    const car = makeCar(type, p.x + 4, p.y, 0);
    car.driver = null;
    this.cars.push(car);
    p.inCar = car;
    car.speed = 120;
  }

  mouseWorld() {
    return { x: this.input.mouse.x + this.camera.x, y: this.input.mouse.y + this.camera.y };
  }

  // ---- main update ------------------------------------------------------

  update(dt) {
    const inp = this.input;
    this.time += dt;

    if (inp.wasPressed('KeyM')) {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
      this.toast(this.audio.muted ? 'Muted' : 'Sound on');
      this.saveGame();
    }

    if (this.state === 'title') {
      this.updateTitle(dt);
      this.input.endFrame();
      return;
    }

    if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) {
      if (this.state === 'playing' || this.state === 'paused') {
        this.state = this.state === 'paused' ? 'playing' : 'paused';
        if (this.state === 'paused') {
          // Fix #14: silence engine + siren the moment we pause.
          this.audio.silence();
          if (this.audio.engineGain) this.audio.engineGain.gain.value = 0;
          if (this.audio.sirenGain) this.audio.sirenGain.gain.value = 0;
        }
      } else if (this.state === 'storycomplete') {
        this.state = 'playing';
      }
      this.input.endFrame();
      return;
    }

    if (this.state === 'paused') {
      this.input.endFrame();
      return;
    }

    if (this.state === 'busted' || this.state === 'wasted') {
      this.stateT += dt;
      if (this.stateT > 0.8 && (inp.pressed.size > 0 || inp.mouse.down)) {
        this.respawnAfterCaught();
      }
      this.input.endFrame();
      return;
    }

    if (this.state === 'storycomplete') {
      if (inp.pressed.size > 0 || inp.mouse.down) this.state = 'playing';
      this.input.endFrame();
      return;
    }

    if (this.state === 'playing') this.updatePlay(dt);
    this.input.endFrame();
  }

  updateTitle(dt) {
    void dt;
    const inp = this.input;
    const labels = this.titleOptions();
    if (this.showHelp) {
      if (inp.wasPressed('Escape') || inp.mouse.down) this.showHelp = false;
      return;
    }
    const my = inp.mouse.y;
    for (let i = 0; i < labels.length; i++) {
      const y = this.view.h * 0.52 + i * 48;
      if (my > y && my < y + 40) this.titleSel = i;
    }
    if (inp.wasPressed('ArrowDown')) this.titleSel = Math.min(labels.length - 1, this.titleSel + 1);
    if (inp.wasPressed('ArrowUp')) this.titleSel = Math.max(0, this.titleSel - 1);
    if (inp.wasPressed('Enter') || inp.mouse.down) {
      // Fix #13: the third slot only exists when a save exists; titleSel
      // can never point past the labels that are actually shown.
      const sel = Math.min(this.titleSel, labels.length - 1);
      if (sel === 0) this.startNewGame();
      else if (sel === 1) this.showHelp = true;
      else if (sel === 2) this.continueGame();
      this.input.mouse.down = false;
    }
  }

  updatePlay(dt) {
    const p = this.player;
    const inp = this.input;

    // Auto-start the next story mission shortly after one completes.
    if (this.nextMissionT > 0) {
      this.nextMissionT -= dt;
      if (this.nextMissionT <= 0 && this.missions.storyIndex < STORY.length) {
        this.missions.startStory(this.missions.storyIndex);
      }
    }

    if (p.inCar) this.updateDriving(dt);
    else this.updateOnFoot(dt);

    // Heat decay + wanted level.
    this.heat = Math.max(0, this.heat - WANTED.decay * dt);
    const newStars = starsForHeat(this.heat);
    if (newStars === 0 && this.stars > 0) this.clearWanted();
    this.stars = newStars;

    this.updatePolice(dt);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateBullets(dt);
    this.updateCollisions(dt);
    this.updateRespawns(dt);

    // Missions.
    const ev = this.missions.update(dt);
    if (ev) this.handleMissionEvent(ev);

    // Side-job pads (unlock after mission 1).
    if (this.missions.storyIndex >= 1 && !this.missions.active && !this.missions.sideJob) {
      const fx = p.inCar ? p.inCar.x : p.x;
      const fy = p.inCar ? p.inCar.y : p.y;
      for (const pad of SIDE_PADS) {
        if (Math.hypot(fx - pad.x, fy - pad.y) < 56) {
          if (pad.kind === 'taxi' && !p.inCar) {
            this.toast('Taxi Job needs a car — grab one first.');
          } else {
            this.missions.startSideJob(pad.kind);
          }
          break;
        }
      }
    }

    // Camera follows the player (or their car).
    const focus = p.inCar || p;
    const tx = Math.max(0, Math.min(WORLD_W - this.view.w, focus.x - this.view.w / 2));
    const ty = Math.max(0, Math.min(WORLD_H - this.view.h, focus.y - this.view.h / 2));
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 6);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 6);

    // Audio + effects.
    const speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
    this.audio.update(dt, speed, this.stars);
    this.fx.update(dt);
    for (const t of this.hud.toasts) t.life -= dt;
    this.hud.toasts = this.hud.toasts.filter((t) => t.life > 0);

    // Busted / wasted.
    if (p.health <= 0) {
      this.state = 'wasted';
      this.stateT = 0;
      this.audio.silence();
    }
  }

  handleMissionEvent(ev) {
    if (ev.type === 'stage') {
      this.toast('Objective updated.');
    } else if (ev.type === 'story-complete') {
      this.earn(ev.def.reward, 'mission');
      this.toast(`${ev.def.title} complete! +$${ev.def.reward}`);
      this.audio.pickup();
      this.saveGame();
      if (this.missions.storyDone) {
        this.state = 'storycomplete';
        this.stateT = 0;
      } else {
        this.nextMissionT = 2.5;
        this.toast('Next mission starting soon…');
      }
    } else if (ev.type === 'side-complete') {
      // Fix #4: a taxi loop already paid per fare — never pay its
      // sideJob.reward again here.
      if (ev.job.kind !== 'taxi-loop') this.earn(ev.job.reward, 'sidejob');
      this.toast(`${ev.job.title} complete!`);
      this.audio.pickup();
      this.saveGame();
    }
  }

  // ---- on foot / driving ------------------------------------------------

  updateOnFoot(dt) {
    const p = this.player;
    const inp = this.input;
    this.audio.ensure();
    p.update(dt, inp, this.city);

    // Aim toward the mouse while firing.
    if (inp.firing) {
      const m = this.mouseWorld();
      p.angle = Math.atan2(m.y - p.y, m.x - p.x);
    }

    // Shoot: flying bullets only (fix #5 — no instant-ray kill).
    if (inp.firing && p.fireCooldown <= 0) {
      p.fireCooldown = FIRE_INTERVAL;
      const a = p.angle;
      this.bullets.push({
        x: p.x + Math.cos(a) * 16,
        y: p.y + Math.sin(a) * 16,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: 1.1,
      });
      this.audio.gunshot();
      this.crime(8, p.x, p.y);
      this.fx.burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, '#ffd32a', 3);
    }

    // Enter a car (fix #17: wrecked cars are skipped in the search).
    if (inp.wasPressed('KeyE')) {
      let nearest = null;
      let nd = 70;
      let wreckedNear = null;
      let wd = 70;
      for (const car of this.cars) {
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (car.wrecked) {
          if (d < wd) { wd = d; wreckedNear = car; }
          continue;
        }
        if (d < nd) { nd = d; nearest = car; }
      }
      if (nearest) {
        this.enterCar(nearest);
      } else if (wreckedNear) {
        this.toast('This car is wrecked.');
      }
    }
  }

  enterCar(car) {
    const p = this.player;
    // Fix #8: the driver is the nearest ALIVE ped within 80px — never a
    // corpse teleported in from across the map, never peds[0].
    if (car.driver === 'traffic') {
      let driver = null;
      let dd = 80;
      for (const ped of this.peds) {
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (!ped.dead && d < dd) { dd = d; driver = ped; }
      }
      if (driver) {
        driver.x = car.x + 30;
        driver.y = car.y + 10;
        driver.scare(car.x, car.y, this.time);
        this.toast('Driver fled!');
      }
      this.crime(25, car.x, car.y);
      this.traffic = this.traffic.filter((t) => t.car !== car);
    } else if (car.driver === 'police') {
      this.crime(40, car.x, car.y);
      this.toast('You stole a police interceptor!');
      this.police = this.police.filter((pc) => pc.car !== car);
    } else {
      this.crime(10, car.x, car.y);
    }
    car.driver = null;
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    this.audio.ensure();
  }

  updateDriving(dt) {
    const p = this.player;
    const car = p.inCar;
    const inp = this.input;
    const throttle = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0)
      - (inp.down('KeyS') || inp.down('ArrowDown') ? 0.85 : 0);
    const steer = (inp.down('KeyA') || inp.down('ArrowLeft') ? -1 : 0)
      + (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0);
    driveCar(car, {
      throttle,
      steer,
      handbrake: inp.down('Space'),
    }, dt, this.city, this.fx);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.wrecked) this.toast('Wrecked! Press E to climb out.');
    // Fix #19: a wrecked car can be exited at any speed.
    if (inp.wasPressed('KeyE') && (carSpeed(car) < 60 || car.wrecked)) {
      p.inCar = null;
      const a = car.angle + Math.PI / 2;
      p.x = car.x + Math.cos(a) * 32;
      p.y = car.y + Math.sin(a) * 32;
      this.city.resolveCircle(p, p.r);
    }
  }

  // ---- police / traffic / peds ------------------------------------------

  updatePolice(dt) {
    const p = this.player;
    const focus = p.inCar || p;
    // Spawn up to one police car per star.
    if (this.stars > 0) {
      while (this.police.length < this.stars) this.spawnPoliceNear(1);
    }
    for (const pc of this.police) {
      pc.update(dt, focus.x, focus.y, this.fx);
    }
    // Drop wrecked or far-gone pursuit cars (their wrecks stay in cars[]).
    this.police = this.police.filter((pc) => {
      if (pc.car.wrecked) return false;
      if (Math.hypot(pc.car.x - focus.x, pc.car.y - focus.y) > 2200) {
        this.cars = this.cars.filter((c) => c !== pc.car);
        return false;
      }
      return true;
    });
    // Busted: a slow police car catches the on-foot player.
    if (this.stars > 0 && !p.inCar) {
      for (const pc of this.police) {
        if (Math.hypot(pc.car.x - p.x, pc.car.y - p.y) < 30 && carSpeed(pc.car) < 50) {
          this.state = 'busted';
          this.stateT = 0;
          this.audio.silence();
          break;
        }
      }
    }
  }

  // Fix #11: wanted-clear removes every police car from the world.
  clearWanted() {
    for (const pc of this.police) {
      this.cars = this.cars.filter((car) => car !== pc.car);
      this.traffic = this.traffic.filter((t) => t.car !== pc.car);
    }
    this.police = [];
  }

  updateTraffic(dt) {
    for (const t of this.traffic) t.update(dt, this.fx);
    // Wrecked traffic cars stop being traffic (respawn tick replaces them).
    this.traffic = this.traffic.filter((t) => !t.car.wrecked);
  }

  updatePeds(dt) {
    for (const ped of this.peds) ped.update(dt, this.city, this.rng, this.time);
  }

  // Fix #12: keep the city alive — top up peds/traffic, clear old bodies.
  updateRespawns(dt) {
    this.respawnT += dt;
    if (this.respawnT < 5) return;
    this.respawnT = 0;
    const p = this.player;
    this.peds = this.peds.filter((ped) => !ped.dead || ped.deadTime <= 30);
    const alive = this.peds.filter((ped) => !ped.dead).length;
    for (let i = alive; i < 40; i++) {
      const pt = this.city.randomRoadPoint(this.rng, p.x, p.y, 500);
      this.peds.push(new Ped(pt.x, pt.y, this.rng));
    }
    const running = this.traffic.length;
    for (let i = running; i < 10; i++) {
      const pt = this.city.randomRoadPoint(this.rng, p.x, p.y, 500);
      const car = makeCar(this.rng.pick(['sedan', 'sedan', 'taxi', 'truck']), pt.x, pt.y, this.rng.range(0, Math.PI * 2));
      car.driver = 'traffic';
      this.cars.push(car);
      this.traffic.push(new TrafficCar(car, this.city, this.rng));
    }
    // Wrecked cars with no driver and no player fade out of the world.
    this.cars = this.cars.filter((car) => {
      if (car.wrecked && car !== p.inCar && car !== this.markedCar) {
        return this.rng.chance(0.5);
      }
      return true;
    });
  }

  // ---- bullets / collisions ----------------------------------------------

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (this.city.blocked(b.x, b.y, 0)) {
        b.life = 0;
        this.fx.burst(b.x, b.y, '#ffb347', 4);
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  updateCollisions(dt) {
    void dt;
    const p = this.player;

    // Bullets vs peds: close range kills, crime, red burst (fix #5).
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      for (const ped of this.peds) {
        if (ped.dead) continue;
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 14) {
          ped.dead = true;
          ped.deadTime = 0;
          b.life = 0;
          this.crime(30, ped.x, ped.y);
          this.fx.burst(ped.x, ped.y, '#e33e5a', 10);
          break;
        }
      }
    }
    // Bullets vs cars: skip spent bullets, one hit per bullet (fix #5).
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      for (const car of this.cars) {
        if (Math.hypot(b.x - car.x, b.y - car.y) < 26) {
          damageCar(car, 12, this.fx);
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // Cars vs peds: a fast car kills a ped it runs over.
    for (const car of this.cars) {
      const sp = carSpeed(car);
      if (sp < 40) continue;
      for (const ped of this.peds) {
        if (ped.dead) continue;
        if (Math.hypot(car.x - ped.x, car.y - ped.y) < 26) {
          ped.dead = true;
          ped.deadTime = 0;
          this.crime(20, ped.x, ped.y);
          this.fx.burst(ped.x, ped.y, '#e33e5a', 10);
          damageCar(car, 6, this.fx);
        }
      }
    }

    // Fix #6: cars vs the on-foot player — no more driving through people.
    if (!p.inCar) {
      for (const car of this.cars) {
        const sp = carSpeed(car);
        if (sp < 25) continue;
        if (Math.hypot(p.x - car.x, p.y - car.y) < 30) {
          const a = Math.atan2(p.y - car.y, p.x - car.x);
          p.x += Math.cos(a) * 26;
          p.y += Math.sin(a) * 26;
          this.city.resolveCircle(p, p.r);
          if (sp > 60) {
            p.health -= 8;
            this.fx.addShake(4);
            this.audio.crash(false);
          }
        }
      }
    }

    // Car vs car: push apart, damage on hard hits.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 36;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const closing = Math.abs(a.speed - b.speed);
          if (closing > 100) {
            damageCar(a, 5, this.fx);
            damageCar(b, 5, this.fx);
            this.audio.crash(true);
            this.fx.addShake(3);
          }
        }
      }
    }
  }

  respawnAfterCaught() {
    const p = this.player;
    const wasBusted = this.state === 'busted';
    const spot = wasBusted ? RESPAWN.police : RESPAWN.hospital;
    const fine = wasBusted ? 100 : 150;
    p.money = Math.max(0, p.money - fine);
    p.health = 100;
    p.x = spot.x;
    p.y = spot.y;
    p.inCar = null;
    this.city.resolveCircle(p, p.r);
    this.heat = 0;
    this.stars = 0;
    this.clearWanted();
    this.state = 'playing';
    this.toast(wasBusted ? `Busted! The PD took $${fine}.` : `Wasted! The hospital took $${fine}.`);
    this.saveGame();
  }

  // ---- render -------------------------------------------------------------

  _vignetteGradient() {
    if (this._vignette) return this._vignette;
    const g = this.ctx.createRadialGradient(
      this.view.w / 2, this.view.h / 2, Math.min(this.view.w, this.view.h) * 0.45,
      this.view.w / 2, this.view.h / 2, Math.max(this.view.w, this.view.h) * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    this._vignette = g;
    return g;
  }

  render() {
    const ctx = this.ctx;
    if (this.state === 'title') {
      this.hud.drawTitle(ctx, this);
      return;
    }
    const cam = {
      x: this.camera.x + this.fx.shakeX,
      y: this.camera.y + this.fx.shakeY,
      w: this.view.w,
      h: this.view.h,
    };
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    this.city.draw(ctx, cam, this.time * 1000);

    // Mission markers.
    this.drawMarkers(ctx);

    for (const ped of this.peds) ped.draw(ctx);
    for (const car of this.cars) drawCar(ctx, car);
    if (!this.player.inCar) this.player.draw(ctx);

    // Bullets.
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 3;
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    this.fx.draw(ctx);
    ctx.restore();

    // Vignette (gradient cached per resize — fix #21).
    ctx.fillStyle = this._vignetteGradient();
    ctx.fillRect(0, 0, this.view.w, this.view.h);

    if (this.state === 'playing' || this.state === 'paused') this.hud.draw(ctx, this);
    if (this.state === 'paused') {
      this.hud.drawOverlay(ctx, this, 'PAUSED', ['Press P or Esc to resume', 'M mute · progress is saved'], '#ffd32a');
    } else if (this.state === 'busted') {
      this.hud.drawOverlay(ctx, this, 'BUSTED!', ['The Port Azure PD caught you.', 'Press any key to wake up at the police station.'], '#3a86ff');
    } else if (this.state === 'wasted') {
      this.hud.drawOverlay(ctx, this, 'WASTED', ['You blacked out on the streets of Port Azure.', 'Press any key to wake up at the hospital.'], '#ff5252');
    } else if (this.state === 'storycomplete') {
      this.hud.drawOverlay(ctx, this, 'STORY COMPLETE', ['You ran every job in Port Azure and lived to tell it.', `Final haul: $${Math.floor(this.player.money)}`, 'Press any key to keep roaming free.'], '#7cff4f');
    }
  }

  drawMarkers(ctx) {
    const t = this.time;
    const pulse = 1 + Math.sin(t * 5) * 0.15;
    const ring = (x, y, color, r = 26) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    };
    const mm = this.missions;
    const stage = mm.currentStage();
    if (stage) ring(stage.x, stage.y, '#ffd32a');
    const side = mm.sideTarget();
    if (side) ring(side.x, side.y, '#29e6ff', 22);
    if (mm.storyIndex >= 1 && !mm.active && !mm.sideJob) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const pad of SIDE_PADS) {
        ctx.fillStyle = pad.kind === 'taxi' ? '#f1c40f' : pad.kind === 'delivery' ? '#1abc9c' : '#e74c3c';
        ctx.fillRect(pad.x - 22, pad.y - 12, 44, 24);
        ctx.fillStyle = '#111';
        ctx.fillText(pad.label, pad.x, pad.y + 4);
      }
    }
    if (this.markedCar && !this.markedCarDelivered) {
      ring(this.markedCar.x, this.markedCar.y, '#ffd32a', 34);
      ctx.fillStyle = '#ffd32a';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MARKED CAR', this.markedCar.x, this.markedCar.y - 40);
    }
  }
}
