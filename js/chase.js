const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

class ChaseScore {
  constructor() {
    this.reset();
  }

  reset() {
    this.points = 0;
    this.totalDistance = 0;
    this.chainDistance = 0;
    this.chainSeconds = 0;
    this.grace = 0;
    this.multiplier = 1;
    this.confusion = 0;
    this.visitedDriftCells = new Set();
  }

  step(car, dt) {
    if (car.on && car.slip > 22 && car.speed > 28) {
      const distance = car.speed * dt;
      this.totalDistance += distance;
      this.chainDistance += distance;
      this.chainSeconds += dt;
      this.grace = 1.5;
      this.multiplier = Math.min(5, 1 + this.chainSeconds * 0.12 + this.chainDistance / 500);
      this.confusion = Math.min(5, this.confusion + dt * (.5 + Math.min(car.slip, 100) / 200));
      const cell = `${Math.floor(car.x / 64)},${Math.floor(car.y / 64)}`;
      if (!this.visitedDriftCells.has(cell) && this.visitedDriftCells.size < 40000) {
        this.visitedDriftCells.add(cell);
        this.points += 35 * clampValue(car.slip / 42, 0.5, 1.8) * this.multiplier;
      }
    } else if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - dt);
      this.confusion = Math.max(0, this.confusion - dt * .025);
    } else {
      this.chainDistance = this.chainSeconds = 0;
      this.multiplier = Math.max(1, this.multiplier - dt * .4);
      this.confusion = Math.max(0, this.confusion - dt * .24);
    }
  }
}

class CopChase {
  constructor() {
    this.cops = [];
    this.elapsed = 0;
    this.nextCopAt = 28;
  }

  reset(player) {
    this.cops.length = 0;
    this.elapsed = 0;
    this.nextCopAt = 28;
    this.addCop(player);
  }

  addCop(player) {
    const distance = 650 + this.cops.length * 110;
    const approachAngle = player.a + Math.PI + Math.max(0, this.cops.length - 1) * .55;
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = attempt * Math.PI * 2 / 32 + approachAngle;
      const x = Math.round((player.x + Math.cos(angle) * distance) / CITY.blockSize) * CITY.blockSize;
      const y = Math.round((player.y + Math.sin(angle) * distance) / CITY.blockSize) * CITY.blockSize;
      if (Math.hypot(player.x - x, player.y - y) < 520) {
        continue;
      }
      const pos = CITY.resolve(x, y, 10);
      if (pos.hit) continue;
      const car = new Car();
      car.setCfg({ ENG: 285, VMAX: 170, BRK: 380, REV: 95, L: 9.2, GRIP: 340 });
      car.reset(pos.x, pos.y, Math.atan2(player.y - pos.y, player.x - pos.x));
      car.id = this.cops.length;
      car.navX = pos.x;
      car.navY = pos.y;
      car.waypoint = null;
      car.nextNavAt = 0;
      this.cops.push(car);
      return;
    }

    const x = Math.round(player.x / CITY.blockSize) * CITY.blockSize;
    const y = player.y - distance;
    const car = new Car();
    car.setCfg({ ENG: 285, VMAX: 170, BRK: 380, REV: 95, L: 9.2, GRIP: 340 });
    const pos = CITY.resolve(x, y, 10);
    car.reset(pos.x, pos.y, Math.atan2(player.y - pos.y, player.x - pos.x));
    car.id = this.cops.length;
    car.navX = Math.round(pos.x / CITY.blockSize) * CITY.blockSize;
    car.navY = Math.round(pos.y / CITY.blockSize) * CITY.blockSize;
    car.waypoint = null;
    car.nextNavAt = 0;
    this.cops.push(car);
  }

  nextWaypoint(cop, player) {
    const block = CITY.blockSize;
    if (!cop.waypoint) {
      cop.navX = Math.round(cop.x / block) * block;
      cop.navY = Math.round(cop.y / block) * block;
      cop.waypoint = { x: cop.navX, y: cop.navY };
    }

    if (Math.hypot(cop.x - cop.waypoint.x, cop.y - cop.waypoint.y) < 38) {
      cop.navX = cop.waypoint.x;
      cop.navY = cop.waypoint.y;
      const dx = Math.round(player.x / block) * block - cop.navX;
      const dy = Math.round(player.y / block) * block - cop.navY;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0)
        cop.waypoint = { x: cop.navX + Math.sign(dx) * block, y: cop.navY };
      else if (dy !== 0)
        cop.waypoint = { x: cop.navX, y: cop.navY + Math.sign(dy) * block };
      else
        cop.waypoint = { x: player.x, y: player.y };
    }
    return cop.waypoint;
  }

  step(player, dt, confusion = 0) {
    this.elapsed += dt;
    if (this.cops.length < 10 && this.elapsed >= this.nextCopAt) {
      this.addCop(player);
      this.nextCopAt += 24;
    }

    for (let i = 0; i < this.cops.length; i++) {
      const cop = this.cops[i];
      const distance = Math.hypot(player.x - cop.x, player.y - cop.y);
      const direct = distance < 260;
      if (!Number.isFinite(cop.navX) || !Number.isFinite(cop.navY)) {
        cop.navX = Math.round(cop.x / CITY.blockSize) * CITY.blockSize;
        cop.navY = Math.round(cop.y / CITY.blockSize) * CITY.blockSize;
      }

      if (direct) {
        if (!cop.wasDirect || this.elapsed >= cop.nextNavAt) {
          cop.waypoint = { x: player.x, y: player.y };
          cop.nextNavAt = this.elapsed + .3;
        }
      } else {
        if (cop.wasDirect) cop.waypoint = null;
        this.nextWaypoint(cop, player);
      }
      cop.wasDirect = direct;

      let targetX = cop.waypoint.x, targetY = cop.waypoint.y;
      const targetDistance = Math.hypot(targetX - cop.x, targetY - cop.y);
      if (direct) {
        const lead = Math.min(.38, distance / 700) * Math.max(.5, 1 - confusion * .07);
        targetX += player.vx * lead;
        targetY += player.vy * lead;
      }
      const targetAngle = Math.atan2(targetY - cop.y, targetX - cop.x);
      const headingError = wrapAngle(targetAngle - cop.a);
      const steer = clampValue(headingError * 1.8, -1, 1);
      const maxSpeed = Math.min(210, 170 + this.elapsed * .08 + this.cops.length * 2);
      let desiredSpeed = direct
        ? clampValue(distance * .72, 18, maxSpeed)
        : Math.min(maxSpeed, Math.sqrt(Math.max(0, 2 * 145 * (targetDistance - 28))));
      if (Math.abs(headingError) > 1.05) desiredSpeed = Math.min(desiredSpeed, 38);
      const forwardSpeed = cop.vx * Math.cos(cop.a) + cop.vy * Math.sin(cop.a);
      const brake = forwardSpeed > desiredSpeed + 7 ? clampValue((forwardSpeed - desiredSpeed) / 45, .2, 1) : 0;
      const throttle = brake > 0 ? 0 : (forwardSpeed < desiredSpeed - 5 ? 1 : .15);
      cop.cfg.VMAX = maxSpeed;
      cop.step({ steer, throttle, brake, hand: 0 }, dt, true);
      const pos = CITY.resolve(cop.x, cop.y, 9);
      cop.x = pos.x;
      cop.y = pos.y;
      if (pos.hit) {
        const intoWall = cop.vx * pos.nx + cop.vy * pos.ny;
        if (intoWall < 0) {
          cop.vx -= pos.nx * intoWall * 1.35;
          cop.vy -= pos.ny * intoWall * 1.35;
        }
        cop.vx *= .88;
        cop.vy *= .88;
        cop.nextNavAt = 0;
      }
    }
  }
}
