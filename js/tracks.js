function spline(P, n) {
  const out = [], N = P.length;
  for (let i = 0; i < N; i++) {
    const p0 = P[(i + N - 1) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  return out;
}
// Vector track: everything is drawn live from paths, so it stays razor sharp at any zoom.
const ROAD = '#353e4b', EDGE = '#a3adb9', MARK = 'rgba(255,255,255,.24)';

function buildTrack(P, opts = {}) {
  const W = opts.W || 1400, H = opts.H || 940, HW = opts.HW || 24, SEG = opts.SEG || 24;
  const pts = spline(P, SEG);
  const road = new Path2D();
  pts.forEach((p, i) => i ? road.lineTo(p[0], p[1]) : road.moveTo(p[0], p[1]));
  road.closePath();

  const ground = opts.ground || '#1f2f2b', curbs = opts.curbs || ['#e0474c', '#f2f4f7'];
  let s = opts.seed || 7; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;

  // big soft tonal patches on the ground
  const patches = [];
  for (let i = 0; i < 34; i++) patches.push({ x: rnd() * W, y: rnd() * H, r: 50 + rnd() * 120, c: i % 2 ? 'rgba(255,255,255,.028)' : 'rgba(0,0,0,.07)' });

  // trees / bushes, kept clear of the road
  const trees = [];
  for (let i = 0; i < (opts.props || 0) * 2 && trees.length < (opts.props || 0); i++) {
    const px = rnd() * W, py = rnd() * H, r = 4.5 + rnd() * 4.5;
    let minD = 1e9;
    for (let k = 0; k < pts.length; k += 3) { const dx = pts[k][0] - px, dy = pts[k][1] - py; minD = Math.min(minD, dx * dx + dy * dy); }
    if (minD > (HW + 14 + r) * (HW + 14 + r)) trees.push({ x: px, y: py, r });
  }

  // drivable mask at 1 unit resolution (curbs count as road)
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const mg = m.getContext('2d', { willReadFrequently: true });
  mg.lineJoin = 'round'; mg.lineWidth = HW * 2 + 8; mg.strokeStyle = '#fff'; mg.stroke(road);
  const d = mg.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;

  const n = pts.length, a0 = pts[n - 2];
  const line = { x: pts[0][0], y: pts[0][1], a: Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) };
  const vis = (v, x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;

  return {
    W, H, ground,
    on: (x, y) => { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1; },
    cps: Array.from({ length: P.length }, (_, i) => pts[i * SEG]),
    start: { x: a0[0], y: a0[1], a: Math.atan2(pts[0][1] - a0[1], pts[0][0] - a0[0]) },

    drawGround(c, v) {
      for (const p of patches) if (vis(v, p.x, p.y, p.r)) { c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
      c.lineJoin = 'round'; c.lineCap = 'butt';
      c.setLineDash([]); c.lineWidth = HW * 2 + 8; c.strokeStyle = curbs[0]; c.stroke(road);       // kerbs
      c.setLineDash([9, 9]); c.strokeStyle = curbs[1]; c.stroke(road);
      c.setLineDash([]); c.lineWidth = HW * 2; c.strokeStyle = EDGE; c.stroke(road);              // edge lines
      c.lineWidth = HW * 2 - 2.4; c.strokeStyle = ROAD; c.stroke(road);                           // asphalt
      c.lineWidth = .8; c.strokeStyle = MARK; c.setLineDash([6, 12]); c.stroke(road); c.setLineDash([]);
      if (vis(v, line.x, line.y, HW + 10)) {                                                      // start / finish
        c.save(); c.translate(line.x, line.y); c.rotate(line.a);
        for (let y = -HW + 1.2, r = 0; y < HW - 1.2; y += 3, r++) for (let q = 0; q < 2; q++) {
          c.fillStyle = (r + q) & 1 ? '#12171e' : '#f2f4f7';
          c.fillRect(q * 3 - 3, y, 3, Math.min(3, HW - 1.2 - y));
        }
        c.restore();
      }
    },
    drawProps(c, v) {
      for (const t of trees) {
        if (!vis(v, t.x, t.y, 14)) continue;
        c.fillStyle = 'rgba(0,0,0,.26)'; c.beginPath(); c.arc(t.x + 1.4, t.y + 2.2, t.r, 0, 7); c.fill();
        c.fillStyle = opts.tree1 || '#2d4a3f'; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill();
        c.fillStyle = opts.tree2 || '#3a5d4f'; c.beginPath(); c.arc(t.x - t.r * .18, t.y - t.r * .24, t.r * .62, 0, 7); c.fill();
      }
    }
  };
}

const TRACKS = [
  {
    id: 'circuit', name: 'CIRCUIT', laps: 3,
    P: [[300, 150], [620, 120], [940, 150], [1180, 260], [1230, 440], [1080, 570], [860, 520],
        [760, 650], [880, 790], [620, 830], [380, 770], [210, 620], [250, 440], [150, 290]],
    opts: { W: 1400, H: 940, HW: 31, seed: 7, props: 40, ground: '#1f2f2b', curbs: ['#e0474c', '#f2f4f7'] }
  },
  {
    id: 'tech', name: 'TECHNICAL', laps: 3,
    P: [[200, 200], [400, 120], [650, 180], [900, 100], [1100, 250], [1050, 450], [850, 520],
        [700, 400], [550, 550], [400, 480], [250, 600], [150, 450], [180, 300]],
    opts: { W: 1300, H: 800, HW: 27, seed: 42, props: 25, ground: '#232a37', curbs: ['#f2c230', '#1b2129'], tree1: '#323f55', tree2: '#3f5069' }
  },
  {
    id: 'flow', name: 'FLOW', laps: 3,
    P: [[250, 300], [500, 150], [800, 200], [1100, 150], [1250, 350], [1150, 550], [900, 600],
        [700, 500], [500, 650], [300, 580], [150, 450], [180, 280]],
    opts: { W: 1400, H: 850, HW: 33, seed: 99, props: 55, ground: '#1c3033', curbs: ['#2f9bd6', '#f2f4f7'], tree1: '#27494a', tree2: '#33605f' }
  },
  {
    id: 'dock', name: 'DOCKSIDE', laps: 3,
    P: [[180, 400], [350, 200], [600, 150], [900, 220], [1150, 180], [1250, 400], [1100, 600],
        [850, 700], [600, 650], [400, 750], [200, 650], [120, 500]],
    opts: { W: 1400, H: 900, HW: 29, seed: 13, props: 30, ground: '#2a2d2b', curbs: ['#ff6a3d', '#f2f4f7'], tree1: '#3a403c', tree2: '#48504b' }
  }
];

const TRACK_MAP = {};
TRACKS.forEach(t => { TRACK_MAP[t.id] = buildTrack(t.P, t.opts); TRACK_MAP[t.id].meta = t; });
