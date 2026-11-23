// Neon Tides — game state machine and main loop.
// States: title, playing, paused, busted, wasted, storycomplete, howto.
import { TILE, WORLD_W, WORLD_H, SHINE_COST } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { City } from './city.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { makeCar, driveCar, damageCar, TrafficCar, drawCar, carSpeed } from './vehicles.js';
import { spawnPeds } from './pedestrians.js';
import { Wanted, PoliceCar, spawnPolice, desiredPolice } from './police.js';
import { MissionManager, STORY } from './missions.js';
import { drawHUD } from './hud.js';
import { defaultSave, loadSave, writeSave, hasSave, clearSave } from './save.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.view = { w: 1280, h: 800 };
    this.input = new Input(canvas); this.audio = new AudioEngine(); this.fx = new Effects();
    this.rng = makeRng(20261119);
    this.city = new City(1337);
    this.state = 'title'; this.time = 0; this.last = 0;
    this.saveData = loadSave() ?? defaultSave();
    this.hasExistingSave = hasSave();
    this.titleSel = 0; this.toastText = ''; this.toastT = 0;
    this.bannerText = ''; this.bannerT = 0; this.prompt = '';
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.bullets = []; this.cars = []; this.traffic = []; this.police = [];
    this.peds = []; this.crates = []; this.taxiPickup = null;
    this.markedCar = null; this.markedCarDelivered = false;
    this.pendingStoryIndex = this.saveData.storyDone ? -1 : this.saveData.storyIndex;
    this.missionMarker = null; this.sideMarkers = [];
    this.deathT = 0; this.shotSetup = null;
    this.player = new Player(this.city.hideout.x + 260, this.city.hideout.y + 200);
    this.wanted = new Wanted();
    this.missions = new MissionManager(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.view.w = window.innerWidth; this.view.h = window.innerHeight;
    this.canvas.width = this.view.w * dpr; this.canvas.height = this.view.h * dpr;
    this.canvas.style.width = this.view.w + 'px'; this.canvas.style.height = this.view.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // ---------- lifecycle ----------
  newGame() {
    clearSave(); this.saveData = defaultSave(); this.hasExistingSave = false;
    this.resetWorld(); this.state = 'playing';
    this.toast('Mara Voss: "Welcome to Port Azure, Kai. Come see me at the pink marker."', 6);
  }
  continueGame() { this.saveData = loadSave() ?? this.saveData; this.resetWorld(); this.state = 'playing'; this.toast('Welcome back to Port Azure.', 3); }
  resetWorld() {
    this.player = new Player(this.city.hideout.x + 260, this.city.hideout.y + 200);
    this.wanted = new Wanted(); this.missions = new MissionManager(this);
    this.bullets = []; this.police = []; this.crates = []; this.taxiPickup = null;
    this.markedCar = null; this.markedCarDelivered = false;
    this.pendingStoryIndex = this.saveData.storyDone ? -1 : this.saveData.storyIndex;
    // Parked cars + traffic.
    this.cars = []; this.traffic = [];
    const spots = [[700, 700, 'sports'], [1500, 1300, 'sedan'], [2300, 800, 'taxi'], [900, 2200, 'sedan'], [2600, 2100, 'truck'], [3200, 1200, 'sedan'], [1800, 2600, 'sports'], [600, 1500, 'taxi'], [3000, 2600, 'sedan'], [1200, 500, 'truck']];
    for (const [x, y, t] of spots) this.cars.push(makeCar(t, x, y, this.rng.range(0, 6.28), undefined, {}));
    const { v, h } = this.city.roadCenterlines();
    for (let i = 0; i < 12; i++) {
      const onV = this.rng.chance(0.5);
      const car = makeCar(this.rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports']), onV ? this.rng.pick(v) : this.rng.range(300, 3400), onV ? this.rng.range(300, 2800) : this.rng.pick(h), this.rng.range(0, 6.28), undefined, { driver: 'traffic' });
      this.cars.push(car); this.traffic.push(new TrafficCar(car, this.city));
    }
    this.peds = spawnPeds(this.city, 46, this.rng);
    this.refreshMarkers();
    this.snapCamera();
  }
  refreshMarkers() {
    // Pink marker offers the next story mission; gold side-job pads sit by the Shine Shop.
    this.missionMarker = (!this.saveData.storyDone && !this.missions.active) ? { x: 1050, y: 620 } : null;
    this.sideMarkers = this.saveData.storyDone && !this.missions.current()
      ? [{ x: 1700, y: 1150, kind: 'taxi', label: 'TAXI JOB' }, { x: 1950, y: 1150, kind: 'delivery', label: 'DELIVERY' }, { x: 2200, y: 1150, kind: 'race', label: 'RACE' }] : [];
  }
  snapCamera() { this.camera.x = this.player.x - this.view.w / 2; this.camera.y = this.player.y - this.view.h / 2; }
  autosave() { writeSave(this.saveData); this.hasExistingSave = true; }
  earn(amount, why) {
    this.saveData.money += amount; this.saveData.stats.earned += amount;
    if (why === 'fare') this.saveData.stats.fares++;
    this.autosave();
  }
  toast(text, secs = 4) { this.toastText = text; this.toastT = secs; }
  banner(text) { this.bannerText = text; this.bannerT = 2.6; }
  setHeatForStars(stars) { this.wanted.heat = Math.max(this.wanted.heat, stars <= 1 ? 1 : (stars - 1) * 30 + 5); }
  crime(amount, x, y) {
    // Witnessed if any ped or cop is near the scene.
    const witnessed = this.peds.some((p) => !p.dead && dist(p.x, p.y, x, y) < 300) || this.police.length > 0 || this.wanted.stars > 0;
    this.wanted.addHeat(amount, witnessed);
    for (const p of this.peds) if (dist(p.x, p.y, x, y) < 200) p.scare(x, y);
  }
  // ---------- mission helpers used by MissionManager ----------
  spawnTaxiPickup() {
    const { v, h } = this.city.roadCenterlines();
    this.taxiPickup = { x: this.rng.pick(v) + 30, y: this.rng.pick(h) };
    if (this.city.blocked(this.taxiPickup.x, this.taxiPickup.y, 20)) this.taxiPickup = { x: 1600, y: 720 };
  }
  makeDropOff() {
    const { v, h } = this.city.roadCenterlines();
    return { x: this.rng.pick(v), y: this.rng.pick(h) };
  }
  spawnCrates(n) {
    this.crates = [];
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, guard = 0;
      do { x = this.rng.range(700, 2900); y = this.rng.range(600, 2400); } while (this.city.blocked(x, y, 16) && guard++ < 40);
      this.crates.push({ x, y, w: 26, h: 26, smashed: false });
    }
  }
  nearestCrate() { return this.crates.find((c) => !c.smashed) ?? null; }
  spawnMarkedSportsCar() {
    this.markedCarDelivered = false;
    this.markedCar = makeCar('sports', 3350, 1900, 0.4, '#ff2e88', {});
    this.cars.push(this.markedCar);
  }
  onMissionPassed(m) {
    this.saveData.stats.missions++;
    this.banner('MISSION PASSED'); this.audio.jingle();
    this.toast(m.done, 6);
    const idx = STORY.findIndex((s) => s.id === m.id);
    this.saveData.storyIndex = idx + 1;
    if (idx + 1 >= STORY.length) { this.saveData.storyDone = true; this.pendingStoryIndex = -1; this.state = 'storycomplete'; this.deathT = 0; }
    else this.pendingStoryIndex = idx + 1;
    this.crates = this.crates.filter(() => false);
    this.autosave(); this.refreshMarkers();
  }
  onSideJobDone(job) { this.banner('JOB DONE'); this.audio.jingle(); if (job.kind === 'delivery') this.saveData.stats.deliveries++; if (job.kind === 'race') this.saveData.stats.races++; this.autosave(); this.refreshMarkers(); }
  // ---------- per-frame ----------
  start() { requestAnimationFrame((t) => this.loop(t)); }
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016); this.last = t; this.time += dt;
    this.update(dt); this.draw();
    this.input.endFrame();
    requestAnimationFrame((nt) => this.loop(nt));
  }
  focusPos() { const p = this.player; return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y }; }

  update(dt) {
    this.fx.update(dt);
    this.toastT = Math.max(0, this.toastT - dt); this.bannerT = Math.max(0, this.bannerT - dt);
    const inp = this.input;
    if (inp.wasPressed('KeyM')) this.audio.toggleMute();
    if (this.state === 'title' || this.state === 'howto') return this.updateTitle(dt);
    if (this.state === 'busted' || this.state === 'wasted' || this.state === 'storycomplete') {
      this.deathT += dt;
      if (this.deathT > 1.4 && (inp.wasPressed('Enter') || inp.wasPressed('Space') || inp.wasPressed('Click'))) this.dismissEndCard();
      return;
    }
    if (inp.wasPressed('Escape') || inp.wasPressed('KeyP')) { this.state = this.state === 'paused' ? 'playing' : 'paused'; return; }
    if (this.state === 'paused') return;
    this.audio.ensure();
    this.updatePlay(dt);
  }
  updateTitle(dt) {
    const inp = this.input;
    if (this.state === 'howto') { if (inp.wasPressed('Escape') || inp.wasPressed('Enter') || inp.wasPressed('Click')) this.state = 'title'; return; }
    const options = this.hasExistingSave ? 3 : 2;
    if (inp.wasPressed('ArrowDown') || inp.wasPressed('KeyS')) this.titleSel = (this.titleSel + 1) % options;
    if (inp.wasPressed('ArrowUp') || inp.wasPressed('KeyW')) this.titleSel = (this.titleSel + options - 1) % options;
    // Mouse selection.
    const my = inp.mouse.y, cx = this.view.w / 2;
    if (Math.abs(inp.mouse.x - cx) < 150) {
      if (my > this.view.h * 0.52 && my < this.view.h * 0.52 + 40) this.titleSel = 0;
      else if (my > this.view.h * 0.52 + 48 && my < this.view.h * 0.52 + 88) this.titleSel = 1;
      else if (my > this.view.h * 0.52 + 96 && my < this.view.h * 0.52 + 136) this.titleSel = 2;
    }
    if (inp.wasPressed('Enter') || inp.wasPressed('Click')) {
      this.audio.ensure();
      const labels = this.hasExistingSave ? ['new', 'continue', 'howto'] : ['new', 'howto'];
      const pick = labels[this.titleSel] ?? 'new';
      if (pick === 'new') this.newGame();
      else if (pick === 'continue') this.continueGame();
      else this.state = 'howto';
    }
  }
  dismissEndCard() {
    if (this.state === 'busted') {
      const fine = Math.min(this.saveData.money, 100 + this.wanted.stars * 25);
      this.saveData.money -= fine; this.saveData.stats.busted++;
      this.player.x = this.city.policeStation.x + 60; this.player.y = this.city.policeStation.y + 40;
      this.player.inCar = null; this.player.health = 100; this.wanted.clear(); this.police = [];
      this.toast(`Busted! Fine of $${fine} paid. Released outside Port Azure PD.`, 5);
    } else if (this.state === 'wasted') {
      const fee = Math.min(this.saveData.money, 150);
      this.saveData.money -= fee; this.saveData.stats.wasted++;
      this.player.x = this.city.hospital.x + 50; this.player.y = this.city.hospital.y + 30;
      this.player.inCar = null; this.player.healFull(); this.wanted.clear(); this.police = [];
      this.toast(`Wasted! Hospital fee of $${fee} paid.`, 5);
    }
    this.autosave(); this.state = 'playing'; this.snapCamera(); this.refreshMarkers();
  }

  updatePlay(dt) {
    const inp = this.input, p = this.player, city = this.city;
    const aim = { x: this.camera.x + inp.mouse.x / this.camera.zoom, y: this.camera.y + inp.mouse.y / this.camera.zoom };
    this.prompt = '';
    // --- mission start / side jobs ---
    if (!this.missions.current()) {
      if (this.missionMarker && !p.inCar && dist(p.x, p.y, this.missionMarker.x, this.missionMarker.y) < 46) {
        this.prompt = 'Press E — Talk to Mara Voss';
        if (inp.wasPressed('KeyE')) { this.missions.startStory(this.pendingStoryIndex); this.missionMarker = null; this.sideMarkers = []; }
      }
      for (const s of this.sideMarkers) {
        if (dist(p.inCar?.x ?? p.x, p.inCar?.y ?? p.y, s.x, s.y) < 56) {
          this.prompt = `Drive/walk in — start ${s.label}`;
          if (inp.wasPressed('KeyE')) { this.missions.startSideJob(s.kind); this.sideMarkers = []; }
        }
      }
    }
    // --- player ---
    if (p.inCar) this.updateDriving(dt, aim);
    else this.updateOnFoot(dt, aim);
    // --- traffic, peds, police ---
    const danger = { x: this.focusPos().x, y: this.focusPos().y, hot: this.wanted.stars > 0 || (p.inCar && carSpeed(p.inCar) > 200) };
    for (const t of this.traffic) t.update(dt, this.cars, this.fx, this.audio);
    for (const ped of this.peds) ped.update(dt, city, danger);
    this.updatePolice(dt);
    // --- car vs car / car vs ped / crates ---
    this.updateCollisions(dt);
    // --- bullets ---
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    this.bullets = this.bullets.filter((b) => b.life > 0 && !city.blocked(b.x, b.y, 2));
    // --- wanted decay / bust ---
    const focus = this.focusPos();
    const observed = this.police.some((c) => dist(c.car.x, c.car.y, focus.x, focus.y) < 460);
    this.wanted.update(dt, observed);
    // --- missions ---
    const result = this.missions.update(dt);
    if (result === 'passed' || result === 'side-done') this.missions.finishPassed();
    else if (result === 'failed') { this.missions.fail(); this.refreshMarkers(); }
    if (this.missions.current() && this.missions.active?.id === 'heat-escape') this.setHeatForStars(3);
    // --- Shine Shop ---
    if (p.inCar && dist(p.inCar.x, p.inCar.y, city.shineShop.x, city.shineShop.y) < 58) {
      if (this.wanted.stars > 0 || p.inCar.hp < p.inCar.spec.hp) {
        this.prompt = `Shine Shop: repaint + repair for $${SHINE_COST} — press E`;
        if (inp.wasPressed('KeyE')) {
          if (this.saveData.money >= SHINE_COST) {
            this.saveData.money -= SHINE_COST; this.wanted.clear(); this.police = [];
            p.inCar.hp = p.inCar.spec.hp; p.inCar.wrecked = false;
            this.audio.jingle(); this.toast('Shine Shop: fresh paint, fresh plates. Heat gone.', 4); this.autosave();
            if (this.missions.active?.id === 'hot-wheels' && p.inCar === this.markedCar) this.markedCarDelivered = true;
          } else this.toast('Not enough cash for the Shine Shop.', 3);
        }
      }
    }
    // Hot Wheels completes at the Shine Shop in the marked car.
    if (this.missions.active?.id === 'hot-wheels' && this.markedCarDelivered) { this.missions.finishPassed(); this.markedCarDelivered = false; }
    // --- camera: follow with velocity lookahead, zoom out at speed ---
    const vel = p.inCar ? { x: p.inCar.vx, y: p.inCar.vy } : { x: p.vx, y: p.vy };
    const speedN = clamp(Math.hypot(vel.x, vel.y) / 430, 0, 1);
    const targetZoom = 1 - speedN * 0.22;
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, dt * 3);
    const tx = focus.x + vel.x * 0.35 - (this.view.w / this.camera.zoom) / 2;
    const ty = focus.y + vel.y * 0.35 - (this.view.h / this.camera.zoom) / 2;
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 5);
    this.camera.x = clamp(this.camera.x, 0, Math.max(0, WORLD_W - this.view.w / this.camera.zoom));
    this.camera.y = clamp(this.camera.y, 0, Math.max(0, WORLD_H - this.view.h / this.camera.zoom));
    // --- audio ---
    this.audio.update(dt, speedN, !!p.inCar, this.police.length > 0 && observed);
    // --- death ---
    if (p.health <= 0 && this.state === 'playing') { this.state = 'wasted'; this.deathT = 0; this.audio.fail(); }
  }

  updateOnFoot(dt, aim) {
    const inp = this.input, p = this.player;
    p.update(dt, inp, this.city, aim);
    if (inp.wasPressed('KeyQ')) { p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol'; this.audio.pickup(); }
    // Combat: click or F.
    const attacking = inp.mouse.down || inp.down('KeyF');
    if (attacking && p.punchCd <= 0 && p.shotCd <= 0) {
      if (p.weapon === 'pistol') {
        p.shotCd = 0.22;
        const a = p.angle;
        this.bullets.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * 780, vy: Math.sin(a) * 780, life: 0.55 });
        this.fx.muzzle(p.x, p.y, a); this.audio.gunshot(); this.fx.addShake(1.2);
        this.crime(16, p.x, p.y);
        // Bullet vs peds/cars resolved instantly along a short ray for feel.
        for (const ped of this.peds) if (!ped.dead && dist(ped.x, ped.y, p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60) < 42) { ped.dead = true; this.crime(30, ped.x, ped.y); this.fx.burst(ped.x, ped.y, '#e33e5a', 10); }
      } else {
        p.punchCd = 0.32; this.audio.punch();
        for (const ped of this.peds) if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 34) { ped.scare(p.x, p.y); ped.x += Math.cos(p.angle) * 14; ped.y += Math.sin(p.angle) * 14; this.crime(8, p.x, p.y); this.fx.burst(ped.x, ped.y, '#ffd34d', 5); }
        for (const car of this.cars) if (dist(car.x, car.y, p.x, p.y) < 44) { damageCar(car, 4, this.fx); this.crime(6, p.x, p.y); }
      }
    }
    // Enter nearest car.
    let nearest = null, nd = 58;
    for (const car of this.cars) { const d = dist(car.x, car.y, p.x, p.y); if (d < nd) { nd = d; nearest = car; } }
    if (nearest) {
      this.prompt = nearest.wrecked ? 'This car is wrecked' : `Press E — ${nearest.driver === 'traffic' ? 'Steal' : 'Enter'} ${nearest.type}`;
      if (inp.wasPressed('KeyE') && !nearest.wrecked) {
        const wasTraffic = nearest.driver === 'traffic';
        if (wasTraffic) {
          // Driver ejects and flees.
          const driver = this.peds[0];
          if (driver) { driver.x = nearest.x + 30; driver.y = nearest.y + 10; driver.scare(nearest.x, nearest.y); }
          this.crime(14, nearest.x, nearest.y);
          this.toast('Driver fled! The car is yours.', 2.5);
        } else if (!nearest.driver) this.crime(10, nearest.x, nearest.y);
        nearest.driver = 'player'; p.inCar = nearest;
        this.traffic = this.traffic.filter((t) => t.car !== nearest);
        this.audio.ensure();
      }
    }
  }

  updateDriving(dt, aim) {
    const inp = this.input, p = this.player, car = p.inCar;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    const input = {
      throttle: (inp.down('KeyW', 'ArrowUp') ? 1 : 0) + (inp.down('KeyS', 'ArrowDown') ? -1 : 0),
      steer: (inp.down('KeyD', 'ArrowRight') ? 1 : 0) + (inp.down('KeyA', 'ArrowLeft') ? -1 : 0),
      handbrake: inp.down('Space'),
    };
    driveCar(car, input, dt, this.city, this.fx, this.audio);
    if (car.wrecked) { this.prompt = 'Wrecked! Press E to climb out'; }
    if (inp.wasPressed('KeyE') && carSpeed(car) < 60) {
      car.driver = null; p.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30; p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      this.city.resolveCircle(p, 11);
    }
    // Running over crates counts only while driving.
    if (this.missions.active?.id === 'rampage') {
      for (const crate of this.crates) {
        if (!crate.smashed && dist(crate.x, crate.y, car.x, car.y) < 40) {
          crate.smashed = true; this.missions.cratesDone++; this.audio.crash(false);
          this.fx.burst(crate.x, crate.y, '#c98d4b', 12); this.toast(`Crates smashed: ${this.missions.cratesDone}/12`, 1.6);
        }
      }
    }
  }

  updatePolice(dt) {
    const stars = this.wanted.stars, focus = this.focusPos();
    const want = desiredPolice(stars);
    // Despawn when heat is gone.
    if (stars === 0) { this.police = this.police.filter((c) => dist(c.car.x, c.car.y, focus.x, focus.y) < 700); for (const c of this.police) c.car.driver = 'traffic'; if (this.police.length) { for (const c of this.police) if (!this.cars.includes(c.car)) this.cars.push(c.car); this.police = []; } return; }
    if (this.police.length < want && Math.random() < dt * 1.6) {
      const cop = spawnPolice(this.city, focus, this.rng, this.police);
      if (cop) { this.police.push(cop); if (!this.cars.includes(cop.car)) this.cars.push(cop.car); }
    }
    if (this.police.length > want + 2) this.police.length = want + 2;
    for (const cop of this.police) cop.update(dt, focus, this.city, this.fx, this.audio);
    // Bust meter: close police + slow/on-foot player.
    const p = this.player;
    const near = this.police.some((c) => dist(c.car.x, c.car.y, focus.x, focus.y) < 120);
    const slow = !p.inCar || carSpeed(p.inCar) < 45;
    if (near && slow && stars > 0) this.wanted.bust = clamp(this.wanted.bust + dt * 0.45, 0, 1);
    else this.wanted.bust = clamp(this.wanted.bust - dt * 0.7, 0, 1);
    if (this.wanted.bust >= 1 && this.state === 'playing') { this.state = 'busted'; this.deathT = 0; this.audio.fail(); }
  }

  updateCollisions(dt) {
    const p = this.player;
    // Car-car impacts.
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j];
      if (dist(a.x, a.y, b.x, b.y) < 44) {
        const rel = Math.abs(carSpeed(a) - carSpeed(b)) + Math.min(carSpeed(a), carSpeed(b)) * 0.3;
        if (rel > 60) {
          damageCar(a, rel * 0.05, this.fx); damageCar(b, rel * 0.05, this.fx);
          this.fx.sparks((a.x + b.x) / 2, (a.y + b.y) / 2); this.audio.crash(rel > 160); this.fx.addShake(rel > 160 ? 5 : 2);
          if (a === p.inCar || b === p.inCar) { this.crime(7, p.x, p.y); if (rel > 200) p.health -= 6; }
        }
        // Push apart.
        const dx = (b.x - a.x) || 1, dy = (b.y - a.y) || 0, d = Math.hypot(dx, dy) || 1, push = (44 - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push;
        const tvx = a.vx; a.vx = b.vx * 0.6; b.vx = tvx * 0.6; const tvy = a.vy; a.vy = b.vy * 0.6; b.vy = tvy * 0.6;
      }
    }
    // Cars vs peds.
    for (const car of this.cars) {
      if (carSpeed(car) < 25) continue;
      for (const ped of this.peds) {
        if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 30) {
          ped.dead = true; this.fx.burst(ped.x, ped.y, '#e33e5a', 12, 200);
          if (car === p.inCar) { this.crime(26, ped.x, ped.y); this.fx.addShake(3); this.audio.crash(false); }
        }
      }
    }
    // Police ramming hurts the player a little.
    if (p.inCar) for (const cop of this.police) if (dist(cop.car.x, cop.car.y, p.inCar.x, p.inCar.y) < 42 && carSpeed(cop.car) > 150) { /* handled by car-car */ }
    // Bullets vs cars.
    for (const b of this.bullets) for (const car of this.cars) if (dist(b.x, b.y, car.x, car.y) < 26) { damageCar(car, 12, this.fx); b.life = 0; }
    // Bullets vs peds.
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      for (const ped of this.peds) {
        if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) {
          ped.dead = true; b.life = 0;
          this.crime(30, ped.x, ped.y);
          this.fx.burst(ped.x, ped.y, '#e33e5a', 10);
          break;
        }
      }
    }
  }

  // ---------- drawing ----------
  draw() {
    const ctx = this.ctx, { w, h } = this.view;
    ctx.fillStyle = '#0b0e1a'; ctx.fillRect(0, 0, w, h);
    if (this.state === 'title' || this.state === 'howto') { this.drawWorld(0.5); this.drawTitle(); return; }
    this.drawWorld(1);
    if (this.state === 'playing' || this.state === 'paused') drawHUD(ctx, this.view, this);
    if (this.state === 'paused') this.drawOverlayCard('PAUSED', 'Esc / P to resume · M mute · progress autosaves', '#00e5ff');
    if (this.state === 'busted') this.drawOverlayCard('BUSTED', 'The Port Azure PD got you. Press Enter to pay the fine and walk free.', '#ff5252');
    if (this.state === 'wasted') this.drawOverlayCard('WASTED', 'You wake up at Port Azure General. Press Enter to continue.', '#ff4d6d');
    if (this.state === 'storycomplete') this.drawOverlayCard('STORY COMPLETE', 'Kai Mercer owns the night. Free roam unlocked — taxi, delivery and race pads wait by the Shine Shop. Press Enter.', '#ffd34d');
  }
  drawWorld(alpha) {
    const ctx = this.ctx, cam = this.camera;
    const shake = this.fx.shakeOffset();
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + shake.x, -cam.y + shake.y);
    const vx = cam.x - 20, vy = cam.y - 20, vw = this.view.w / cam.zoom + 40, vh = this.view.h / cam.zoom + 40;
    ctx.drawImage(this.city.canvas, vx, vy, vw, vh, vx, vy, vw, vh);
    // Animated water shimmer on the east edge.
    ctx.fillStyle = 'rgba(120,225,255,0.20)';
    for (let y = 0; y < WORLD_H; y += 64) { const off = Math.sin(this.time * 1.6 + y * 0.02) * 14; ctx.fillRect(3792 + off, y + 10, 60, 5); ctx.fillRect(3900 - off, y + 38, 46, 4); }
    // Mission / side markers.
    const pulse = 26 + Math.sin(this.time * 5) * 5;
    const gold = (x, y, label) => { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, pulse, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(255,211,77,0.18)'; ctx.beginPath(); ctx.arc(x, y, pulse, 0, 7); ctx.fill(); if (label) { ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - pulse - 8); } };
    if (this.missionMarker) { ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.missionMarker.x, this.missionMarker.y, pulse, 0, 7); ctx.stroke(); ctx.fillStyle = '#ff2e88'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('MARA VOSS', this.missionMarker.x, this.missionMarker.y - pulse - 8); }
    for (const s of this.sideMarkers) gold(s.x, s.y, s.label);
    const obj = this.missions.objective;
    if (obj?.marker) gold(obj.marker.x, obj.marker.y, '');
    if (this.taxiPickup) gold(this.taxiPickup.x, this.taxiPickup.y, 'FARE');
    if (this.markedCar && !this.markedCarDelivered) { ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.markedCar.x, this.markedCar.y, 36 + Math.sin(this.time * 5) * 4, 0, 7); ctx.stroke(); }
    // Crates.
    for (const c of this.crates) { if (c.smashed) continue; ctx.fillStyle = '#b07a3f'; ctx.fillRect(c.x - 13, c.y - 13, 26, 26); ctx.strokeStyle = '#6e4a20'; ctx.strokeRect(c.x - 13, c.y - 13, 26, 26); ctx.beginPath(); ctx.moveTo(c.x - 13, c.y - 13); ctx.lineTo(c.x + 13, c.y + 13); ctx.moveTo(c.x + 13, c.y - 13); ctx.lineTo(c.x - 13, c.y + 13); ctx.stroke(); }
    this.fx.drawWorld(ctx);
    for (const car of this.cars) drawCar(ctx, car, this.time);
    for (const ped of this.peds) ped.draw(ctx);
    if (!this.player.inCar) this.player.draw(ctx);
    // Bullets.
    ctx.fillStyle = '#ffe9a3';
    for (const b of this.bullets) ctx.fillRect(b.x - 3, b.y - 1.5, 6, 3);
    ctx.restore();
    // Dusk vignette + headlight warmth.
    const grad = ctx.createRadialGradient(this.view.w / 2, this.view.h / 2, Math.min(this.view.w, this.view.h) * 0.42, this.view.w / 2, this.view.h / 2, Math.max(this.view.w, this.view.h) * 0.75);
    grad.addColorStop(0, 'rgba(10,8,30,0)'); grad.addColorStop(1, 'rgba(10,8,38,0.42)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, this.view.w, this.view.h);
    if (alpha < 1) { ctx.fillStyle = 'rgba(6,8,20,0.45)'; ctx.fillRect(0, 0, this.view.w, this.view.h); }
  }
  drawOverlayCard(title, body, color) {
    const ctx = this.ctx, { w, h } = this.view;
    ctx.fillStyle = 'rgba(5,6,16,0.62)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px system-ui, sans-serif'; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 30; ctx.fillText(title, w / 2, h * 0.42); ctx.shadowBlur = 0;
    ctx.font = '17px system-ui, sans-serif'; ctx.fillStyle = '#e8ecf8';
    // Simple word wrap.
    const words = body.split(' '); let line = '', yy = h * 0.42 + 46;
    for (const word of words) { if (ctx.measureText(line + word).width > w - 160) { ctx.fillText(line, w / 2, yy); yy += 24; line = ''; } line += word + ' '; }
    ctx.fillText(line, w / 2, yy);
  }
  drawTitle() {
    const ctx = this.ctx, { w, h } = this.view;
    ctx.textAlign = 'center';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 34; ctx.fillStyle = '#ff2e88';
    ctx.fillText('NEON', w / 2, h * 0.30);
    ctx.shadowColor = '#00e5ff'; ctx.fillStyle = '#00e5ff';
    ctx.fillText('TIDES', w / 2, h * 0.30 + 82); ctx.shadowBlur = 0;
    ctx.font = '600 17px system-ui, sans-serif'; ctx.fillStyle = '#ffe9f4';
    ctx.fillText('An original top-down caper in Port Azure · Kai Mercer runs errands for Mara Voss', w / 2, h * 0.30 + 118);
    if (this.state === 'howto') {
      ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = '#e8ecf8';
      const lines = ['WASD / arrows — move · Shift — sprint · Mouse — aim', 'Click or F — punch · Q — fists / pistol · E — enter car, talk, use garage', 'In a car: WASD drive · Space — handbrake · E (slow) — exit', 'Gold marker = objective · Pink marker = Mara Voss · Shine Shop clears heat for $150', 'Esc / P — pause · M — mute · Stars bring police: slow + close = BUSTED', '', 'Press Esc or Enter to go back'];
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.52 + i * 26));
      return;
    }
    const labels = this.hasExistingSave ? ['NEW GAME', 'CONTINUE', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
    labels.forEach((label, i) => {
      const y = h * 0.52 + i * 48 + 28;
      ctx.font = this.titleSel === i ? 'bold 26px system-ui, sans-serif' : '600 22px system-ui, sans-serif';
      ctx.fillStyle = this.titleSel === i ? '#ffd34d' : '#aeb8d4';
      ctx.fillText((this.titleSel === i ? '▶ ' : '') + label, w / 2, y);
    });
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(230,236,255,0.65)';
    ctx.fillText('Neon Tides © Port Azure Interactive — an original game. No affiliation with any other franchise.', w / 2, h - 26);
    ctx.fillText('↑↓ + Enter, or click a menu item', w / 2, h - 48);
  }
  // Screenshot staging hook (used by main.js ?shot=N).
  stageShot(n) {
    this.newGame();
    const p = this.player;
    if (n === 1) {
      // On foot at a neon downtown intersection: peds, traffic, a parked sports car.
      p.x = 1272; p.y = 700; p.angle = 0.6;
      const sports = this.cars.find((c) => c.type === 'sports');
      if (sports && !sports.driver) { sports.x = 1420; sports.y = 636; sports.angle = 0; }
      this.peds.slice(0, 6).forEach((ped, i) => { ped.x = 1180 + i * 62; ped.y = 596 + (i % 3) * 54; ped.dead = false; });
    }
    if (n === 2) {
      const car = this.cars.find((c) => c.type === 'sports') ?? this.cars[0];
      car.x = 1560; car.y = 648; car.angle = 0; car.driver = 'player'; p.inCar = car; p.x = car.x; p.y = car.y;
      this.setHeatForStars(4);
      for (let i = 0; i < 3; i++) { const cop = spawnPolice(this.city, { x: car.x, y: car.y }, this.rng, []); if (cop) { cop.car.x = car.x - 260 - i * 110; cop.car.y = 648 + (i - 1) * 34; cop.car.angle = 0; this.police.push(cop); this.cars.push(cop.car); } }
    }
    if (n === 3) {
      const taxi = this.cars.find((c) => c.type === 'taxi') ?? this.cars[0];
      taxi.x = 1500; taxi.y = 648; taxi.driver = 'player'; p.inCar = taxi; p.x = taxi.x; p.y = taxi.y;
      this.saveData.storyIndex = 1; this.missions.startStory(1);
      this.missionMarker = null;
      this.missions.passenger = { dest: { x: 2400, y: 1440 } };
      if (this.missions.active) this.missions.active.timer = 90;
      this.missions.timer = 74;
    }
    if (n === 4) {
      const car = this.cars.find((c) => c.type === 'sedan') ?? this.cars[0];
      car.x = 3560; car.y = 720; car.angle = 0.2; car.driver = 'player'; p.inCar = car; p.x = car.x; p.y = car.y;
    }
    this.snapCamera();
    const f = this.focusPos(); this.camera.x = clamp(f.x - this.view.w / 2, 0, WORLD_W - this.view.w); this.camera.y = clamp(f.y - this.view.h / 2, 0, WORLD_H - this.view.h);
    this.state = 'playing';
  }
}
export { TILE };
