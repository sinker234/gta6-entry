// Neon Tides — story missions and side jobs.
// Five story missions in Port Azure, plus taxi / delivery / race side jobs
// that unlock after mission 1. Every stage point sits on a road tile
// (fixes #1 and #2: the old (900,420) garage and (384,384) hideout were
// inside buildings and could never trigger).
//
// Fixes carried here:
//  #3  hot-wheels only counts the MARKED car (p.inCar === game.markedCar),
//      never just any sports car.
//  #4  taxi pays per fare on drop-off; the side-job reward is 0 for the
//      taxi loop, so finishing never pays it a second time.
//  #10 heat-escape sets 3 stars ONCE in startStory (forceStars) — no
//      per-frame top-up anywhere, so the heat can decay while you run.

import { STAGE_RADIUS, MARA_RADIUS, PAD_RADIUS } from './config.js';

export const STORY = [
  {
    id: 'first-run',
    title: 'First Run',
    brief: 'Mara needs a package moved across Port Azure. Pick it up, bring it to her garage.',
    reward: 200,
    stages: [
      { text: 'Pick up the package at the east docks', x: 3600, y: 648, mode: 'any' },
      { text: "Deliver the package to Mara's garage", x: 900, y: 624, mode: 'any' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    brief: 'A marked sports car is waiting at the docks. Bring THAT car to the Shine Shop — a $150 wash fee comes off on delivery.',
    reward: 350,
    washFee: 150,
    stages: [
      { text: 'Pick up the marked car at the docks', x: 2900, y: 500, mode: 'any' },
      { text: 'Drive the marked car to the Shine Shop', x: 1824, y: 1248, mode: 'marked' },
    ],
  },
  {
    id: 'dockside-deal',
    title: 'Dockside Deal',
    brief: 'Meet Mara by the garage, then run the goods down to the south docks.',
    reward: 300,
    stages: [
      { text: 'Meet Mara near the garage', x: 1050, y: 620, mode: 'any', radius: MARA_RADIUS },
      { text: 'Drop the goods at the south docks', x: 3300, y: 2440, mode: 'any' },
    ],
  },
  {
    id: 'midnight-run',
    title: 'Midnight Run',
    brief: 'Three checkpoints, 75 seconds. Drive like the tide is behind you.',
    reward: 400,
    timeLimit: 75,
    stages: [
      { text: 'Checkpoint 1: west road', x: 648, y: 648, mode: 'any' },
      { text: 'Checkpoint 2: Shine Shop corner', x: 1824, y: 1248, mode: 'any' },
      { text: 'Checkpoint 3: east docks', x: 3600, y: 648, mode: 'any' },
    ],
  },
  {
    id: 'heat-escape',
    title: 'Heat Escape',
    brief: 'The heat is already on. Shake it and reach the hideout.',
    reward: 500,
    forceStars: 3,
    stages: [
      { text: 'Reach the hideout while the heat is on', x: 384, y: 624, mode: 'any' },
    ],
  },
];

// Side-job pads (unlock once mission 1 is done).
export const SIDE_PADS = [
  { kind: 'taxi', x: 1728, y: 1152, label: 'TAXI' },
  { kind: 'delivery', x: 1968, y: 1152, label: 'DELIVERY' },
  { kind: 'race', x: 2208, y: 1152, label: 'RACE' },
];

const RACE_POINTS = [
  { x: 648, y: 648 },
  { x: 1824, y: 1248 },
  { x: 3600, y: 648 },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0; // next story mission to play
    this.active = null; // active story def
    this.stageIndex = 0;
    this.timer = 0;
    this.sideJob = null;
    this.storyDone = false;
  }

  current() {
    return this.active;
  }

  currentStage() {
    if (!this.active) return null;
    return this.active.stages[this.stageIndex] || null;
  }

  currentText() {
    const s = this.currentStage();
    if (s) return s.text;
    if (this.sideJob) return this.sideJob.text;
    return null;
  }

  startStory(index) {
    const def = STORY[index];
    if (!def) return;
    this.active = def;
    this.stageIndex = 0;
    this.timer = def.timeLimit || 0;
    // Fix #10: heat is set ONCE here, then decays naturally.
    if (def.forceStars) this.game.setHeatForStars(def.forceStars);
    if (def.id === 'hot-wheels') this.game.spawnMarkedCar();
    this.game.toast(`${def.title}: ${def.brief}`);
  }

  // ---- side jobs -------------------------------------------------------

  startSideJob(kind) {
    const g = this.game;
    if (kind === 'taxi') {
      // Reward 0: fares pay per drop-off, never again at the finish (fix #4).
      this.sideJob = { id: 'taxi-job', kind: 'taxi-loop', title: 'Taxi Job', reward: 0, fares: 0, faresTotal: 3, phase: 'pickup', text: 'Taxi: pick up the fare' };
      this._taxiNextPickup();
      g.toast('Taxi Job: pick up the fare, 3 fares to go.');
    } else if (kind === 'delivery') {
      this.sideJob = { id: 'delivery-job', kind: 'delivery', title: 'Delivery Job', reward: 0, drops: 0, dropsTotal: 3, text: 'Delivery: reach the drop point' };
      this._deliveryNextDrop();
      g.toast('Delivery Job: 3 drops, $60 each.');
    } else if (kind === 'race') {
      this.sideJob = { id: 'race-job', kind: 'race', title: 'Street Race', reward: 150, cp: 0, timer: 60, text: 'Race: checkpoint 1 of 3 — 60s' };
      g.toast('Street Race: 3 checkpoints in 60 seconds!');
    }
  }

  _taxiNextPickup() {
    const g = this.game;
    const p = g.city.randomRoadPoint(g.rng, g.player.x, g.player.y, 400);
    this.sideJob.pickup = p;
    this.sideJob.phase = 'pickup';
    this.sideJob.text = 'Taxi: pick up the fare';
  }

  _taxiNextDrop() {
    const g = this.game;
    const p = g.city.randomRoadPoint(g.rng, g.player.x, g.player.y, 400);
    this.sideJob.drop = p;
    this.sideJob.phase = 'dropoff';
    this.sideJob.text = 'Taxi: drop the fare off';
  }

  _deliveryNextDrop() {
    const g = this.game;
    const p = g.city.randomRoadPoint(g.rng, g.player.x, g.player.y, 350);
    this.sideJob.drop = p;
    this.sideJob.text = `Delivery: drop ${this.sideJob.drops + 1} of 3`;
  }

  sideTarget() {
    if (!this.sideJob) return null;
    if (this.sideJob.kind === 'taxi-loop') {
      return this.sideJob.phase === 'pickup' ? this.sideJob.pickup : this.sideJob.drop;
    }
    if (this.sideJob.kind === 'delivery') return this.sideJob.drop;
    if (this.sideJob.kind === 'race') return RACE_POINTS[this.sideJob.cp];
    return null;
  }

  // ---- per-frame update -------------------------------------------------

  update(dt) {
    const g = this.game;
    const p = g.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;

    // Timed story mission.
    if (this.active && this.active.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        g.toast(`${this.active.title} failed — out of time. Try again!`);
        this.stageIndex = 0;
        this.timer = this.active.timeLimit;
        return { type: 'failed' };
      }
    }

    // Story stage.
    if (this.active) {
      const stage = this.currentStage();
      if (stage) {
        const radius = stage.radius || STAGE_RADIUS;
        const inCarOk = stage.mode === 'any' || p.inCar;
        // Fix #3: 'marked' means the marked car specifically.
        const markedOk = stage.mode !== 'marked' || p.inCar === g.markedCar;
        if (inCarOk && markedOk && Math.hypot(px - stage.x, py - stage.y) < radius) {
          if (this.active.id === 'hot-wheels' && this.stageIndex === 1 && !g.markedCarDelivered) {
            g.markedCarDelivered = true;
            const fee = Math.min(this.active.washFee || 0, p.money);
            p.money -= fee;
            g.toast(`Shine Shop wash: -$${fee}.`);
            g.audio.pickup();
          }
          this.stageIndex++;
          g.audio.pickup();
          if (this.stageIndex >= this.active.stages.length) {
            const def = this.active;
            this.active = null;
            this.storyIndex++;
            if (this.storyIndex >= STORY.length) this.storyDone = true;
            return { type: 'story-complete', def };
          }
          return { type: 'stage' };
        }
      }
    }

    // Side job.
    if (this.sideJob) {
      const job = this.sideJob;
      if (job.kind === 'race') {
        job.timer -= dt;
        if (job.timer <= 0) {
          g.toast('Race failed — out of time.');
          this.sideJob = null;
          return { type: 'failed' };
        }
        const cp = RACE_POINTS[job.cp];
        if (Math.hypot(px - cp.x, py - cp.y) < STAGE_RADIUS) {
          job.cp++;
          g.audio.pickup();
          if (job.cp >= RACE_POINTS.length) {
            this.sideJob = null;
            return { type: 'side-complete', job };
          }
          job.text = `Race: checkpoint ${job.cp + 1} of 3 — ${Math.ceil(job.timer)}s`;
        }
        return null;
      }
      if (job.kind === 'taxi-loop') {
        if (!p.inCar) return null; // fares need a car
        const t = job.phase === 'pickup' ? job.pickup : job.drop;
        const radius = job.phase === 'pickup' ? 40 : 50;
        if (Math.hypot(px - t.x, py - t.y) < radius) {
          if (job.phase === 'pickup') {
            this._taxiNextDrop();
            g.audio.pickup();
          } else {
            const fare = 60 + g.rng.int(0, 31);
            g.earn(fare, 'fare');
            job.fares++;
            g.audio.pickup();
            if (job.fares >= job.faresTotal) {
              this.sideJob = null;
              return { type: 'side-complete', job };
            }
            this._taxiNextPickup();
          }
        }
        return null;
      }
      if (job.kind === 'delivery') {
        const t = job.drop;
        if (Math.hypot(px - t.x, py - t.y) < 50) {
          g.earn(60, 'delivery');
          job.drops++;
          g.audio.pickup();
          if (job.drops >= job.dropsTotal) {
            this.sideJob = null;
            return { type: 'side-complete', job };
          }
          this._deliveryNextDrop();
        }
        return null;
      }
    }
    return null;
  }
}
