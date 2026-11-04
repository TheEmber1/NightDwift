// Arcade-accurate drift model, run at a fixed 120 Hz step.
// Velocity is split into forward (vl) and sideways (vt) parts. Heading turns from
// steering; the tyres can only remove sideways speed up to a grip limit, so when
// yaw outpaces grip the car slides. Handbrake / throttle lower rear grip.
const BASE_CFG = { ENG: 255, VMAX: 215, BRK: 340, REV: 95, L: 9.5, GRIP: 265 };

class Car {
  constructor() { this.cfg = { ...BASE_CFG }; this.reset(0, 0, 0); }
  setCfg(c) { this.cfg = { ...BASE_CFG, ...c }; }
  reset(x, y, a) { Object.assign(this, { x, y, a, vx: 0, vy: 0, w: 0, slip: 0, on: true }); }
  get speed() { return Math.hypot(this.vx, this.vy); }

  step(i, dt, on) {
    const { ENG, VMAX, BRK, REV, L, GRIP } = this.cfg;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    let vl = this.vx * c + this.vy * s, vt = -this.vx * s + this.vy * c;
    this.on = on; this.slip = Math.abs(vt);

    // longitudinal
    let acc = i.throttle * ENG * (1 - Math.max(vl, 0) / VMAX) * (on ? 1 : .55) - (on ? .22 : 1.15) * vl;
    if (i.brake > .02) acc -= vl > 8 ? BRK * i.brake : REV * i.brake * Math.max(0, 1 + vl / 60);
    if (i.hand) acc -= vl * .85;
    if (vl > 0) acc -= Math.abs(vt) * .45;
    vl += acc * dt;
    if (!i.throttle && !i.brake && Math.abs(vl) < 3) vl = 0;

    // yaw
    const sp = Math.abs(vl), hb = i.hand ? 1 : 0;
    const sa = i.steer * .62 / (1 + sp / 55);
    let wt = vl * Math.tan(sa) / L;
    if (vl > 0) wt += vt * (hb ? .0018 : .0038);
    if (hb) {
      wt += i.steer * Math.sign(vl) * Math.min(1.25, sp / 95);
      wt *= 1.55;
    }
    wt = Math.max(-5.5, Math.min(5.5, wt));
    this.w += (wt - this.w) * (1 - Math.exp(-dt * (hb ? 9 : 16)));

    // lateral grip
    let G = GRIP * .9 * (on ? 1 : .5);
    if (Math.abs(vt) > 28) G *= .72;
    G *= 1 - .42 * i.throttle * Math.min(1, sp / 70);
    if (hb) G *= .09;
    const dv = G * dt;
    vt -= Math.max(-dv, Math.min(dv, vt));

    this.vx = vl * c - vt * s;
    this.vy = vl * s + vt * c;
    this.a += this.w * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
