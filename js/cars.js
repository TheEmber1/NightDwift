// ---------- smooth vector cars ----------
// Local car space: +x = nose, +y = right side, 1 unit ~ 0.285 m. Origin = middle of the car.
const mixc = (h, t, to = 255) => {
  const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(v + (to - v) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

// polygon with rounded corners; r is a wish, clamped so neighbouring arcs never collide
function rpoly(c, P) {
  const n = P.length;
  const R = P.map((p, i) => {
    const a = P[(i + n - 1) % n], b = P[(i + 1) % n];
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || !lv || !p[2]) return 0;
    const ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
    if (ang > 3.1) return 0;
    return Math.min(p[2], Math.min(lu, lv) / 2 * Math.tan(ang / 2));
  });
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = m(P[n - 1], P[0]);
  c.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const p = P[i], e = m(p, P[(i + 1) % n]);
    if (R[i] > 0) c.arcTo(p[0], p[1], e[0], e[1], R[i]); else { c.lineTo(p[0], p[1]); c.lineTo(e[0], e[1]); }
  }
  c.closePath();
}
// half outline (nose centre -> tail centre, y >= 0) -> mirrored Path2D
function sym(half) {
  const top = half.map(p => [p[0], -p[1], p[2]]);
  const bot = half.slice(1, -1).reverse().map(p => [p[0], p[1], p[2]]);
  const path = new Path2D();
  rpoly(path, top.concat(bot));
  return path;
}
// rounded rectangle path from corner coordinates
function rect(c, x0, y0, x1, y1, r) {
  r = Math.min(r, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2);
  c.moveTo(x0 + r, y0); c.arcTo(x1, y0, x1, y1, r); c.arcTo(x1, y1, x0, y1, r);
  c.arcTo(x0, y1, x0, y0, r); c.arcTo(x0, y0, x1, y0, r); c.closePath();
}
const mirrorRect = (c, x0, ya, x1, yb, r) => { rect(c, x0, ya, x1, yb, r); rect(c, x0, -yb, x1, -ya, r); };

const GLASS = '#121a24', LAMP = '#f3efe2', TAIL = '#a8262c', TAIL_ON = '#ff4044', DARK = '#161c25';

const CAR_SPECS = {
  // ---- Nissan Skyline GT-R (R34): square-shouldered, big wing, four round tail lamps ----
  skyline: {
    full: 'NISSAN SKYLINE GT-R R34', color: '#2f62d6', fx: 4.7, rx: -4.7, hw: 3.15,
    half: [[8.05,0,0],[8.05,2.0,1.2],[7.4,2.95,1.5],[6.0,3.12,1.2],[3.2,3.15,1],[-2.5,3.15,1],[-5.8,3.12,1.2],[-7.5,3.0,1.8],[-8.05,2.2,1.2],[-8.05,0,0]],
    glass: [[2.9,0,0],[2.7,2.35,1.4],[-0.6,2.6,1],[-4.6,2.3,1.4],[-4.9,0,0]],
    roof:  [[1.0,0,0],[0.8,2.4,1.4],[-3.0,2.3,1.4],[-3.3,0,0]],
    detail(c, col, o) {
      c.fillStyle = DARK; c.beginPath(); mirrorRect(c, 4.2, 0.9, 5.4, 1.9, 0.25); c.fill();       // hood vents
      c.fillStyle = LAMP; c.beginPath(); mirrorRect(c, 7.0, 1.3, 7.9, 2.8, 0.45); c.fill();      // headlights
      c.fillStyle = o.brake ? TAIL_ON : TAIL;                                                     // 4 round tail lamps
      for (const y of [-2.4, -1.2, 1.2, 2.4]) { c.beginPath(); c.arc(-7.5, y, 0.52, 0, 7); c.fill(); }
      c.fillStyle = '#10151c'; c.beginPath(); rect(c, -6.9, -2.85, -5.5, 2.85, 0.4); c.fill();    // wing
      c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); rect(c, -6.6, -2.6, -6.3, 2.6, 0.15); c.fill();
    }
  },
  // ---- Toyota Supra (A80): long bonnet, rear-set bubble cabin, huge wing ----
  supra: {
    full: 'TOYOTA SUPRA A80', color: '#f0762a', fx: 4.6, rx: -4.4, hw: 3.18,
    half: [[7.9,0,0],[7.8,1.6,2],[6.9,2.75,2.4],[4.6,3.1,2.2],[1.5,3.18,2],[-2.5,3.18,2.2],[-5.5,3.1,2.6],[-7.2,2.75,2.5],[-7.9,1.8,1.5],[-7.9,0,0]],
    glass: [[1.3,0,0],[1.1,2.2,1.6],[-1.2,2.55,1.2],[-4.0,2.35,2],[-4.4,0,0]],
    roof:  [[-0.1,0,0],[-0.3,2.1,2],[-2.6,2.15,2],[-2.9,0,0]],
    detail(c, col, o) {
      c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 0.22; c.lineCap = 'round';                // bonnet creases
      c.beginPath(); for (const s of [-1, 1]) { c.moveTo(7.2, s * 0.9); c.lineTo(2.3, s * 1.45); } c.stroke();
      c.fillStyle = LAMP; c.beginPath(); mirrorRect(c, 6.5, 1.4, 7.6, 2.6, 0.5); c.fill();
      c.fillStyle = o.brake ? TAIL_ON : TAIL; c.beginPath(); rect(c, -7.95, -2.7, -7.45, 2.7, 0.25); c.fill();
      const wc = mixc(col, 0.4, 0);                                                                // big GT wing
      c.fillStyle = wc; c.beginPath(); rect(c, -7.3, -3.15, -5.8, 3.15, 0.5); c.fill();
      c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); rect(c, -7.0, -2.9, -6.6, 2.9, 0.2); c.fill();
      c.fillStyle = DARK; c.beginPath(); rect(c, -7.3, -3.15, -5.8, -2.8, 0.15); rect(c, -7.3, 2.8, -5.8, 3.15, 0.15); c.fill();
    }
  },
  // ---- Porsche 911: rear-engine teardrop, round lamps on fender humps, fastback ----
  porsche: {
    full: 'PORSCHE 911 CARRERA', color: '#b9c3cf', fx: 4.45, rx: -3.55, hw: 3.05,
    half: [[7.45,0,0],[7.35,1.3,2.5],[6.4,2.4,3],[4.8,2.9,3.5],[2.5,2.98,3],[0,2.9,4],[-3.0,3.05,4],[-5.8,3.1,4],[-7.1,2.5,3],[-7.45,1.5,2],[-7.45,0,0]],
    glass: [[2.6,0,0],[2.4,2.3,1.5],[-0.4,2.55,1.6],[-3.8,2.4,2.2],[-5.4,1.5,1.5],[-5.6,0,0]],
    roof:  [[0.9,0,0],[0.7,2.25,1.5],[-2.6,2.2,2],[-4.6,1.1,1.5],[-4.7,0,0]],
    detail(c, col, o) {
      c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.22; c.beginPath();                        // fender / bonnet shape
      rpoly(c, [[7.0,0,0],[6.7,-1.55,2],[3.0,-1.95,2],[2.7,0,0],[3.0,1.95,2],[6.7,1.55,2]]); c.stroke();
      for (const s of [-1, 1]) {                                                                   // round headlamps
        c.fillStyle = '#c9c6b8'; c.beginPath(); c.arc(5.9, s * 2.2, 0.8, 0, 7); c.fill();
        c.fillStyle = LAMP; c.beginPath(); c.arc(5.9, s * 2.2, 0.55, 0, 7); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); rect(c, -7.0, -1.5, -5.9, 1.5, 0.4); c.fill(); // engine grille
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 0.14; c.beginPath();
      for (let x = -6.8; x < -5.9; x += 0.3) { c.moveTo(x, -1.3); c.lineTo(x, 1.3); } c.stroke();
      c.fillStyle = o.brake ? TAIL_ON : TAIL; c.beginPath(); rect(c, -7.15, -2.5, -6.65, 2.5, 0.25); c.fill();
    }
  },
  // ---- Mazda RX-7 (FD3S): low bubble canopy, pronounced haunches, twin bonnet vents ----
  rx7: {
    full: 'MAZDA RX-7 FD', color: '#d6382f', fx: 4.55, rx: -3.9, hw: 3.08,
    half: [[7.5,0,0],[7.45,1.4,2.5],[6.6,2.5,3.2],[4.6,3.0,3],[2.5,3.08,2.5],[-0.5,2.95,3.5],[-3.5,3.08,3.5],[-5.8,3.08,3.2],[-7.1,2.5,2.8],[-7.5,1.4,2],[-7.5,0,0]],
    glass: [[2.0,0,0],[1.8,2.2,1.6],[-0.5,2.45,1.3],[-3.4,2.3,2],[-4.7,1.4,1.8],[-4.9,0,0]],
    roof:  [[0.5,0,0],[0.3,2.1,1.8],[-2.2,2.15,2],[-3.6,1.2,1.5],[-3.7,0,0]],
    detail(c, col, o) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); mirrorRect(c, 3.6, 0.55, 5.3, 1.7, 0.4); c.fill();  // twin vents
      c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.22; c.beginPath();
      for (const s of [-1, 1]) { c.moveTo(7.0, s * 1.5); c.quadraticCurveTo(4.5, s * 2.1, 2.7, s * 2.1); } c.stroke();
      c.fillStyle = LAMP; c.beginPath(); mirrorRect(c, 6.7, 1.7, 7.35, 2.7, 0.3); c.fill();             // retracted pop-ups
      c.fillStyle = o.brake ? TAIL_ON : TAIL;
      for (const [x, y] of [[-6.9,-1.1],[-6.6,-2.15],[-6.9,1.1],[-6.6,2.15]]) { c.beginPath(); c.arc(x, y, 0.45, 0, 7); c.fill(); }
      c.fillStyle = mixc(col, 0.35, 0); c.beginPath(); rect(c, -6.1, -2.7, -5.0, 2.7, 0.4); c.fill();  // wing
      c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); rect(c, -5.9, -2.5, -5.6, 2.5, 0.12); c.fill();
    }
  },
  // ---- Nissan Silvia (S15): compact three-box coupe, slim lamps, boot lip ----
  silvia: {
    full: 'NISSAN SILVIA S15', color: '#f3c623', fx: 4.5, rx: -4.35, hw: 2.98,
    half: [[7.8,0,0],[7.7,1.5,1.5],[7.0,2.5,2],[5.0,2.9,2],[2.5,2.98,2],[-2,2.98,2],[-5.5,2.95,2.2],[-7.2,2.8,2],[-7.8,2.1,1.2],[-7.8,0,0]],
    glass: [[2.7,0,0],[2.5,2.25,1.4],[-0.3,2.45,1.1],[-4.0,2.2,1.5],[-4.4,0,0]],
    roof:  [[0.9,0,0],[0.7,2.15,1.4],[-2.8,2.1,1.4],[-3.1,0,0]],
    detail(c, col, o) {
      c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.2; c.lineCap = 'round';
      c.beginPath(); for (const s of [-1, 1]) { c.moveTo(7.3, s * 0.8); c.lineTo(3.2, s * 1.2); } c.stroke();
      c.fillStyle = LAMP; c.beginPath(); mirrorRect(c, 6.7, 1.2, 7.6, 2.7, 0.4); c.fill();
      c.fillStyle = o.brake ? TAIL_ON : TAIL; c.beginPath(); mirrorRect(c, -7.75, 0.9, -7.2, 2.6, 0.25); c.fill();
      c.fillStyle = mixc(col, 0.3, 0); c.beginPath(); rect(c, -6.9, -2.45, -6.2, 2.45, 0.3); c.fill();
    }
  },
  // ---- Toyota Sprinter Trueno AE86: tiny and boxy, black bonnet "panda", hatch ----
  ae86: {
    full: 'TOYOTA AE86 TRUENO', color: '#eef0f2', fx: 4.4, rx: -4.1, hw: 2.85,
    half: [[7.35,0,0],[7.35,1.7,1.2],[6.8,2.65,1.6],[4.5,2.85,1.5],[2.5,2.85,1.5],[-3,2.85,1.5],[-6.3,2.82,1.6],[-7.35,2.4,1.2],[-7.35,0,0]],
    glass: [[2.8,0,0],[2.6,2.25,1.2],[-0.5,2.5,1],[-4.2,2.3,1.5],[-5.0,1.7,1.5],[-5.2,0,0]],
    roof:  [[1.0,0,0],[0.8,2.25,1.2],[-2.9,2.25,1.3],[-3.9,1.6,1.3],[-4.0,0,0]],
    paint(c, col, body) {
      c.save(); c.clip(body);
      c.fillStyle = '#12161c'; c.beginPath(); rpoly(c, [[7.6,-2.45,0],[7.6,2.45,0],[2.9,2.5,1.2],[2.9,-2.5,1.2]]); c.fill();   // black bonnet
      c.fillStyle = '#12161c'; c.beginPath(); rect(c, -6, 2.5, 5.5, 3.1, 0.2); rect(c, -6, -3.1, 5.5, -2.5, 0.2); c.fill(); // side skirts
      c.restore();
    },
    detail(c, col, o) {
      c.fillStyle = LAMP; c.beginPath(); for (const s of [-1, 1]) { c.arc(6.7, s * 2.0, 0.6, 0, 7); c.closePath(); } c.fill();
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.15; c.beginPath(); mirrorRect(c, 6.2, 1.5, 7.2, 2.5, 0.3); c.stroke();
      c.fillStyle = o.brake ? TAIL_ON : TAIL; c.beginPath(); mirrorRect(c, -7.3, 1.0, -6.7, 2.6, 0.25); c.fill();
      c.fillStyle = '#12161c'; c.beginPath(); rect(c, -6.5, -2.3, -5.9, 2.3, 0.25); c.fill();
    }
  }
};

// cache Path2Ds and wheel layout once
for (const k in CAR_SPECS) {
  const S = CAR_SPECS[k];
  S.body = sym(S.half); S.glassP = sym(S.glass); S.roofP = sym(S.roof);
}

// Optional sprite override: add named PNGs to a "sprites" folder next to the game page.
// SPRITE_FACING sets where the art's nose points (0 = right, -Math.PI/2 = up,
// Math.PI/2 = down). Missing files fall back to the vector cars.
const SPRITE_DIR = 'sprites/', SPRITE_FACING = -Math.PI / 2, SPRITES = {};
for (const k in CAR_SPECS) {
  const img = new Image();
  img.onload = () => { SPRITES[k] = img; };
  img.src = SPRITE_DIR + k + '.png';
}

// Draws one car. o = { steer (front wheel angle, radians), brake, shadow, lights }
function drawCar(c, S, x, y, a, o = {}) {
  if (o.shadow !== false) {
    c.save(); c.translate(x + 0.9, y + 1.5); c.rotate(a);
    c.fillStyle = 'rgba(0,0,0,.32)'; c.fill(S.body);
    c.restore();
  }
  c.save(); c.translate(x, y); c.rotate(a);
  if (o.lights) {                                   // soft headlight cone
    const g = c.createLinearGradient(7, 0, 46, 0);
    g.addColorStop(0, 'rgba(255,246,220,.16)'); g.addColorStop(1, 'rgba(255,246,220,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(7, -2.2); c.lineTo(46, -11); c.lineTo(46, 11); c.lineTo(7, 2.2); c.closePath(); c.fill();
  }
  if (o.brake) {                                    // brake glow
    const x0 = S.half[S.half.length - 2][0] - 0.8, g = c.createRadialGradient(x0, 0, 0, x0, 0, 6);
    g.addColorStop(0, 'rgba(255,50,50,.22)'); g.addColorStop(1, 'rgba(255,50,50,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x0, 0, 6, 0, 7); c.fill();
  }
  const spr = SPRITES[S.key];
  if (spr) {                                         // sprite mode
    const up = Math.abs(Math.abs(SPRITE_FACING) - Math.PI / 2) < .01, len = S.half[0][0] * 2;
    const sc = len / (up ? spr.height : spr.width);
    c.rotate(-SPRITE_FACING);
    c.drawImage(spr, -spr.width * sc / 2, -spr.height * sc / 2, spr.width * sc, spr.height * sc);
    c.restore();
    return;
  }
  // wheels (front pair steers)
  c.fillStyle = '#0c1015';
  for (const [wx, steer] of [[S.fx, o.steer || 0], [S.rx, 0]]) for (const s of [-1, 1]) {
    c.save(); c.translate(wx, s * (S.hw - 0.5)); c.rotate(steer);
    c.beginPath(); rect(c, -1.1, -0.55, 1.1, 0.55, 0.35); c.fill(); c.restore();
  }
  // body
  c.fillStyle = S.color; c.fill(S.body);
  if (S.paint) S.paint(c, S.color, S.body);
  c.save(); c.clip(S.body); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1.1; c.stroke(S.body); c.restore();
  // glasshouse
  c.fillStyle = GLASS; c.fill(S.glassP);
  c.fillStyle = S.roofColor || mixc(S.color, 0.1); if (S.key === 'ae86') c.fillStyle = '#f4f6f8';
  c.fill(S.roofP);
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.18; c.stroke(S.glassP);
  S.detail(c, S.color, o);
  c.restore();
}
for (const k in CAR_SPECS) CAR_SPECS[k].key = k;

// closed Catmull-Rom spline
