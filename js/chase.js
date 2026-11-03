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
      let x = player.x + Math.cos(angle) * distance;
      let y = player.y + Math.sin(angle) * distance;
      const horizontalStreet = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle));
      if (horizontalStreet)
        x = Math.round(x / CITY.blockSize) * CITY.blockSize;
      else
        y = Math.round(y / CITY.blockSize) * CITY.blockSize;
      if (Math.hypot(player.x - x, player.y - y) < 520) {
        if (horizontalStreet)
          x += Math.sign(Math.cos(angle)) * CITY.blockSize;
        else
          y += Math.sign(Math.sin(angle)) * CITY.blockSize;
      }
      if (Math.hypot(player.x - x, player.y - y) < 520) continue;
      const pos = CITY.resolve(x, y, 10);
      if (pos.hit) continue;
      const car = new Car();
      car.setCfg({ ENG: 330, VMAX: 220, BRK: 340, REV: 80, L: 9.2, GRIP: 320 });
      car.reset(pos.x, pos.y, Math.atan2(player.y - pos.y, player.x - pos.x));
      car.id = this.cops.length;
      this.cops.push(car);
      return;
    }

    const x = Math.round(player.x / CITY.blockSize) * CITY.blockSize;
    const y = player.y - distance;
    const car = new Car();
    car.setCfg({ ENG: 330, VMAX: 220, BRK: 340, REV: 80, L: 9.2, GRIP: 320 });
    const pos = CITY.resolve(x, y, 10);
    car.reset(pos.x, pos.y, Math.atan2(player.y - pos.y, player.x - pos.x));
    car.id = this.cops.length;
    this.cops.push(car);
  }

  step(player, dt, confusion = 0) {
    this.elapsed += dt;
    if (this.cops.length < 10 && this.elapsed >= this.nextCopAt) {
      this.addCop(player);
      this.nextCopAt += 24;
    }

    for (let i = 0; i < this.cops.length; i++) {
      const cop = this.cops[i];
      const dx = player.x - cop.x, dy = player.y - cop.y;
      const distance = Math.hypot(dx, dy);
      const lead = Math.min(1.7, distance / 240) * Math.max(.35, 1 - confusion * .13);
      let targetX = player.x + player.vx * lead;
      let targetY = player.y + player.vy * lead;
      const decoyPhase = this.elapsed * 2.2 + cop.id * 2.4;
      const decoy = confusion * 40;
      targetX += -dy / Math.max(distance, 1) * Math.sin(decoyPhase) * decoy;
      targetY += dx / Math.max(distance, 1) * Math.sin(decoyPhase) * decoy;

      let avoidX = 0, avoidY = 0;
      for (const b of CITY.buildingsIn(cop.x - 230, cop.y - 230, cop.x + 230, cop.y + 230)) {
        const px = Math.max(b.x - 18, Math.min(cop.x, b.x + b.w + 18));
        const py = Math.max(b.y - 18, Math.min(cop.y, b.y + b.h + 18));
        const ox = cop.x - px, oy = cop.y - py;
        const obstacleDistance = Math.hypot(ox, oy);
        if (obstacleDistance > 100) continue;
        const strength = (1 - obstacleDistance / 100) * 1.8;
        if (obstacleDistance > 0) {
          avoidX += ox / obstacleDistance * strength;
          avoidY += oy / obstacleDistance * strength;
        } else {
          const angle = wrapAngle(cop.a + (cop.id % 2 ? 1 : -1) * Math.PI / 2);
          avoidX += Math.cos(angle) * strength;
          avoidY += Math.sin(angle) * strength;
        }
      }

      targetX += avoidX * 100;
      targetY += avoidY * 100;
      const confusedTurn = Math.sin(decoyPhase * .8 + cop.id) * confusion * .045;
      const target = Math.atan2(targetY - cop.y, targetX - cop.x) + confusedTurn;
      const steer = clampValue(wrapAngle(target - cop.a) * 2.2, -1, 1);
      cop.cfg.VMAX = 230 + Math.min(90, this.elapsed * .8) + Math.max(0, this.cops.length - 1) * 8;
      cop.step({ steer, throttle: 1, brake: 0, hand: 0 }, dt, true);
      const pos = CITY.resolve(cop.x, cop.y, 9);
      cop.x = pos.x;
      cop.y = pos.y;
      if (pos.hit) {
        cop.vx *= 0.82;
        cop.vy *= 0.82;
        cop.w += steer * 0.025;
      }
    }
  }
}
