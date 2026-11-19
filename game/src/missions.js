// Mara Voss's five-mission story chain plus repeatable side jobs.
// A mission is a small state machine of stages; each stage has a marker the
// player must reach (on foot or in a car), optional timer and dialogue.
import { dist } from './random.js';

export const STORY = [
  {
    id: 'first-run', title: 'First Run', reward: 250,
    intro: 'Mara Voss: "Kai. A package waits by the pier lockers, east beach. Bring it to my garage up north — no questions."',
    stages: [
      { text: 'Pick up the package at the beach lockers', x: 3640, y: 900, mode: 'foot' },
      { text: 'Deliver the package to Mara\'s garage', x: 900, y: 420, mode: 'any' },
    ],
    done: 'Mara Voss: "Clean work. Port Azure might suit you after all."',
  },
  {
    id: 'fare-game', title: 'Fare Game', reward: 300, needFares: 3,
    intro: 'Mara Voss: "My cab fleet is short a driver. Run three fares — pick up, drop off, smile."',
    stages: [], done: 'Mara Voss: "Three happy riders. The meter loves you."',
  },
  {
    id: 'hot-wheels', title: 'Hot Wheels', reward: 400,
    intro: 'Mara Voss: "A pink sports car near the marina is... misplaced. Take it to the Shine Shop."',
    stages: [{ text: 'Deliver the marked sports car to the Shine Shop', x: 1824, y: 1248, mode: 'car', needCarType: 'sports' }],
    done: 'Mara Voss: "Beautiful. It never existed, understood?"',
  },
  {
    id: 'rampage', title: 'Rampage', reward: 450, timer: 90, needCrates: 12,
    intro: 'Mara Voss: "A rival crew stacked crates downtown. Flatten twelve of them. In a car. Quickly."',
    stages: [], done: 'Mara Voss: "Splinters everywhere. Perfect message."',
  },
  {
    id: 'heat-escape', title: 'Heat Escape', reward: 600, forceStars: 3,
    intro: 'Mara Voss: "Last job. The heat is already on — shake it and reach the hideout, northwest."',
    stages: [{ text: 'Reach the hideout while the heat is on', x: 384, y: 384, mode: 'any' }],
    done: 'Mara Voss: "You\'re one of us now, Kai. Port Azure is yours."',
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game; this.active = null; this.stageIndex = 0;
    this.faresDone = 0; this.cratesDone = 0; this.timer = 0; this.sideJob = null; this.passenger = null;
  }
  get objective() {
    const m = this.active ?? this.sideJob; if (!m) return null;
    if (m.kind === 'taxi-loop') return this.taxiObjective();
    if (m.id === 'fare-game') return this.taxiObjective();
    if (m.id === 'rampage') return { text: `Smash crates by car: ${this.cratesDone}/${m.needCrates}`, marker: this.game.nearestCrate(), timer: this.timer };
    const stage = m.stages?.[this.stageIndex];
    if (stage) return { text: stage.text, marker: stage, timer: m.timer ? this.timer : 0 };
    return null;
  }
  taxiObjective() {
    const t = this.current()?.timer ? this.timer : 0;
    if (this.passenger) return { text: 'Drop off your passenger at the gold marker', marker: this.passenger.dest, timer: t };
    return { text: `Taxi: pick up a passenger (${this.faresDone}/${this.active?.needFares ?? 3} fares)`, marker: this.game.taxiPickup, timer: t };
  }
  startStory(index) {
    const def = STORY[index]; if (!def) return;
    this.active = { ...def, kind: 'story' }; this.stageIndex = 0; this.faresDone = 0; this.cratesDone = 0;
    this.timer = def.timer ?? 0; this.passenger = null;
    this.game.toast(def.intro, 6);
    if (def.id === 'fare-game' || def.kind === 'taxi-loop') this.game.spawnTaxiPickup();
    if (def.id === 'rampage') this.game.spawnCrates(def.needCrates);
    if (def.id === 'hot-wheels') this.game.spawnMarkedSportsCar();
    if (def.forceStars) this.game.setHeatForStars(def.forceStars);
  }
  startSideJob(kind) {
    if (kind === 'taxi') { this.sideJob = { id: 'taxi-job', kind: 'taxi-loop', title: 'Taxi Job', reward: 90 }; this.faresDone = 0; this.game.spawnTaxiPickup(); this.game.toast('Side job: pick up the passenger at the gold marker.', 4); }
    if (kind === 'delivery') { this.sideJob = { id: 'delivery-job', kind: 'delivery', title: 'Delivery', reward: 120, stages: [{ text: 'Deliver the parcel across town', x: 3300, y: 2500, mode: 'any' }] }; this.stageIndex = 0; this.game.toast('Side job: deliver the parcel to the gold marker.', 4); }
    if (kind === 'race') { this.sideJob = { id: 'race-job', kind: 'race', title: 'Checkpoint Race', reward: 150, timer: 60, stages: [{ text: 'Hit the checkpoint before time runs out', x: 2900, y: 500, mode: 'car' }] }; this.stageIndex = 0; this.timer = 60; this.game.toast('Side job: checkpoint race — 60 seconds, must be driving!', 4); }
  }
  current() { return this.active ?? this.sideJob; }
  update(dt) {
    const m = this.current(); if (!m) return 'none';
    if (m.timer || m.kind === 'race') { this.timer -= dt; if (this.timer <= 0) return 'failed'; }
    const g = this.game, p = g.player;
    const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
    // Taxi flow (story mission 2 and the side job share it).
    if (m.id === 'fare-game' || m.kind === 'taxi-loop') {
      if (!this.passenger && g.taxiPickup && dist(px, py, g.taxiPickup.x, g.taxiPickup.y) < 60 && p.inCar) {
        this.passenger = { dest: g.makeDropOff() }; g.taxiPickup = null; g.audio.pickup(); g.toast('Passenger in! Follow the gold marker.', 3);
      } else if (this.passenger && dist(px, py, this.passenger.dest.x, this.passenger.dest.y) < 64 && p.inCar) {
        this.passenger = null; this.faresDone++;
        g.earn(m.kind === 'taxi-loop' ? 90 : 60, 'fare');
        if (m.id === 'fare-game' && this.faresDone >= m.needFares) return 'passed';
        if (m.kind === 'taxi-loop') { this.completeSideJob(); return 'side-done'; }
        g.spawnTaxiPickup(); g.toast(`Fare done! ${this.faresDone}/${m.needFares}`, 3);
      }
      return 'active';
    }
    if (m.id === 'rampage') { if (this.cratesDone >= m.needCrates) return 'passed'; return 'active'; }
    const stage = m.stages?.[this.stageIndex]; if (!stage) return 'active';
    if (stage.mode === 'car' && !p.inCar) return 'active';
    if (stage.mode === 'foot' && p.inCar) return 'active';
    if (stage.needCarType && p.inCar?.type !== stage.needCarType && !g.markedCarDelivered) return 'active';
    if (dist(px, py, stage.x, stage.y) < 62) {
      this.stageIndex++;
      if (this.stageIndex >= m.stages.length) return m.kind === 'story' ? 'passed' : 'side-done';
      g.audio.pickup(); g.toast('Objective updated — follow the gold marker.', 3);
    }
    return 'active';
  }
  completeSideJob() { /* reward already paid per fare for taxi */ }
  finishPassed() {
    const m = this.active;
    if (m) { this.game.earn(m.reward, 'mission'); this.game.onMissionPassed(m); this.active = null; }
    else if (this.sideJob) { this.game.earn(this.sideJob.reward, 'mission'); this.game.onSideJobDone(this.sideJob); this.sideJob = null; }
    this.passenger = null;
  }
  fail() {
    const m = this.current();
    this.game.toast(`"${m?.title ?? 'Job'}" failed. Talk to Mara's marker to retry.`, 5);
    this.game.audio.fail();
    if (this.active) { const idx = STORY.findIndex((s) => s.id === this.active.id); this.active = null; this.game.pendingStoryIndex = idx; }
    this.sideJob = null; this.passenger = null;
  }
}
