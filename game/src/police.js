// Neon Tides — police pursuit.
// A police car chases along the roads in two stages (fix #9): first it
// drives to the nearest intersection on the target's road line, then it
// runs straight at the target along that road. If it gets stuck for 2s it
// reverses briefly and picks a fresh waypoint instead of grinding a wall.

import { TILE } from './config.js';
import { driveCar } from './vehicles.js';

export class PoliceCar {
  constructor(car, city) {
    this.car = car;
    this.city = city;
    this.waypoint = null;
    this.stage = 1; // 1 = align to target's road, 2 = run at target
    this.stuckT = 0;
    this.reverseT = 0;
    this.lastX = car.x;
    this.lastY = car.y;
  }

  _targetRoadPoint(tx, ty) {
    // Snap the target onto the nearest road centre line, keeping the
    // dominant axis: a target east/west of us is chased along its row.
    const dx = tx - this.car.x;
    const dy = ty - this.car.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: tx, y: this.city.roadRowCenter(ty) };
    }
    return { x: this.city.roadColCenter(tx), y: ty };
  }

  _pickWaypoint(tx, ty) {
    const road = this._targetRoadPoint(tx, ty);
    // Meet the target's road line at the intersection nearest to us:
    // target road is a row -> use our nearest column; a column -> our row.
    if (Math.abs(tx - this.car.x) >= Math.abs(ty - this.car.y)) {
      this.waypoint = { x: this.city.roadColCenter(this.car.x), y: road.y };
    } else {
      this.waypoint = { x: road.x, y: this.city.roadRowCenter(this.car.y) };
    }
    this.stage = 1;
  }

  update(dt, tx, ty, fx) {
    const c = this.car;
    if (c.wrecked) return;
    if (!this.waypoint) this._pickWaypoint(tx, ty);

    let goal = this.waypoint;
    const toTarget = Math.hypot(tx - c.x, ty - c.y);
    if (this.stage === 1 && Math.hypot(goal.x - c.x, goal.y - c.y) < 46) {
      this.stage = 2;
    }
    if (this.stage === 2) goal = { x: tx, y: ty };
    // Re-aim the waypoint as the target moves along its road.
    if (this.stage === 1 && toTarget > 500) this._pickWaypoint(tx, ty);

    const dx = goal.x - c.x;
    const dy = goal.y - c.y;
    const want = Math.atan2(dy, dx);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));

    let throttle = 0.95;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = -0.9;
    }
    driveCar(c, { throttle, steer: this.reverseT > 0 ? -steer : steer, handbrake: false }, dt, this.city, fx);

    // Stuck detection: barely moved while driving hard.
    const moved = Math.hypot(c.x - this.lastX, c.y - this.lastY);
    if (moved < 0.4) this.stuckT += dt;
    else this.stuckT = 0;
    this.lastX = c.x;
    this.lastY = c.y;
    if (this.stuckT > 2) {
      this.stuckT = 0;
      this.reverseT = 0.7;
      this._pickWaypoint(tx, ty);
    }
  }
}
