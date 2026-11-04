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
const ROAD = '#292a25', EDGE = '#68604d', MARK = 'rgba(210,190,145,.35)';

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

  const wear = [];
  for (let i = 0; i < pts.length * 1.6; i++) {
    const index = Math.floor(rnd() * pts.length), p = pts[index];
    const prev = pts[(index + pts.length - 1) % pts.length], next = pts[(index + 1) % pts.length];
    const dx = next[0] - prev[0], dy = next[1] - prev[1], length = Math.hypot(dx, dy) || 1;
    const offset = (rnd() - .5) * HW * 1.65;
    wear.push({
      x: p[0] - dy / length * offset,
      y: p[1] + dx / length * offset,
      w: .8 + rnd() * 3.2,
      h: .8 + rnd() * 2,
      color: rnd() > .58 ? 'rgba(10,11,9,.24)' : 'rgba(194,168,119,.15)'
    });
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
      for (const mark of wear) if (vis(v, mark.x, mark.y, 3)) {
        c.fillStyle = mark.color;
        c.fillRect(mark.x, mark.y, mark.w, mark.h);
      }
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
    opts: { W: 1400, H: 940, HW: 31, seed: 7, props: 40, ground: '#171b17', curbs: ['#a85546', '#c4b998'] }
  },
  {
    id: 'tech', name: 'TECHNICAL', laps: 3,
    P: [[200, 200], [400, 120], [650, 180], [900, 100], [1100, 250], [1050, 450], [850, 520],
        [700, 400], [550, 550], [400, 480], [250, 600], [150, 450], [180, 300]],
    opts: { W: 1300, H: 800, HW: 27, seed: 42, props: 25, ground: '#191a17', curbs: ['#c2a15c', '#403d34'], tree1: '#242c23', tree2: '#30362a' }
  },
  {
    id: 'flow', name: 'FLOW', laps: 3,
    P: [[250, 300], [500, 150], [800, 200], [1100, 150], [1250, 350], [1150, 550], [900, 600],
        [700, 500], [500, 650], [300, 580], [150, 450], [180, 280]],
    opts: { W: 1400, H: 850, HW: 33, seed: 99, props: 55, ground: '#151b1b', curbs: ['#558c89', '#c4b998'], tree1: '#1b302c', tree2: '#284139' }
  },
  {
    id: 'dock', name: 'DOCKSIDE', laps: 3,
    P: [[180, 400], [350, 200], [600, 150], [900, 220], [1150, 180], [1250, 400], [1100, 600],
        [850, 700], [600, 650], [400, 750], [200, 650], [120, 500]],
    opts: { W: 1400, H: 900, HW: 29, seed: 13, props: 30, ground: '#1b1918', curbs: ['#a75d61', '#c4b998'], tree1: '#302725', tree2: '#40312d' }
  }
];

const TRACK_MAP = {};
TRACKS.forEach(t => { TRACK_MAP[t.id] = buildTrack(t.P, t.opts); TRACK_MAP[t.id].meta = t; });

function buildCity() {
  const BLOCK = 400, ROAD = 152, palette = ['#26302a', '#302b27', '#273233', '#352a2d', '#2c302b', '#342d31'];
  const blockCache = new Map();
  const blockKey = (x, y) => `${x},${y}`;
  const getBlock = (bx, by) => {
    const key = blockKey(bx, by);
    if (blockCache.has(key)) {
      const cached = blockCache.get(key);
      blockCache.delete(key);
      blockCache.set(key, cached);
      return cached;
    }
    let seed = (Math.imul(bx | 0, 0x1f123bb5) ^ Math.imul(by | 0, 0x5f356495) ^ 0x6d2b79f5) >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let n = seed;
      n = Math.imul(n ^ n >>> 15, n | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
    const buildings = [];
    const cx = (bx + .5) * BLOCK, cy = (by + .5) * BLOCK;
    const add = (x, y, w, h, style) => buildings.push({
      x: cx + x - w / 2, y: cy + y - h / 2, w, h,
      color: palette[Math.floor(random() * palette.length)],
      accent: palette[Math.floor(random() * palette.length)],
      floors: 1 + Math.floor(random() * 7), style,
      roof: Math.floor(random() * 3), windows: random() > .22
    });
    const layout = random();
    if (layout >= .13) {
      if (layout < .38) {
        const horizontal = random() > .5;
        const offset = 48 + random() * 20;
        const size = 56 + random() * 28;
        if (horizontal) {
          add(-offset, 0, size, 90 + random() * 92, Math.floor(random() * 4));
          add(offset, 0, size, 90 + random() * 92, Math.floor(random() * 4));
        } else {
          add(0, -offset, 90 + random() * 92, size, Math.floor(random() * 4));
          add(0, offset, 90 + random() * 92, size, Math.floor(random() * 4));
        }
      } else {
        add((random() - .5) * 35, (random() - .5) * 35,
          72 + random() * 126, 72 + random() * 126, Math.floor(random() * 4));
      }
    }
    blockCache.set(key, buildings);
    if (blockCache.size > 256) blockCache.delete(blockCache.keys().next().value);
    return buildings;
  };
  const buildingAt = (x, y) => {
    const bx = Math.floor(x / BLOCK), by = Math.floor(y / BLOCK);
    return getBlock(bx, by).find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  };
  const buildingsIn = (x0, y0, x1, y1) => {
    const found = [];
    const bx0 = Math.floor(x0 / BLOCK), by0 = Math.floor(y0 / BLOCK);
    const bx1 = Math.floor(x1 / BLOCK), by1 = Math.floor(y1 / BLOCK);
    for (let by = by0; by <= by1; by++)
      for (let bx = bx0; bx <= bx1; bx++)
        for (const b of getBlock(bx, by))
          if (b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1) found.push(b);
    return found;
  };
  const visible = (v, x, y, margin = 0) =>
    x + margin > v.x0 && x - margin < v.x1 && y + margin > v.y0 && y - margin < v.y1;

  return {
    blockSize: BLOCK, roadWidth: ROAD,
    buildingsIn,
    resolve(x, y, radius) {
      let hit = false, nx = 0, ny = 0;
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const b of buildingsIn(x - radius, y - radius, x + radius, y + radius)) {
          const px = Math.max(b.x, Math.min(x, b.x + b.w));
          const py = Math.max(b.y, Math.min(y, b.y + b.h));
          let dx = x - px, dy = y - py, distance = Math.hypot(dx, dy);
          if (distance >= radius) continue;
          if (distance === 0) {
            const sides = [
              [Math.abs(x - b.x), -1, 0],
              [Math.abs(b.x + b.w - x), 1, 0],
              [Math.abs(y - b.y), 0, -1],
              [Math.abs(b.y + b.h - y), 0, 1]
            ].sort((a, z) => a[0] - z[0]);
            dx = sides[0][1]; dy = sides[0][2];
            x += dx * (radius + sides[0][0]);
            y += dy * (radius + sides[0][0]);
          } else {
            const push = radius - distance;
            dx /= distance; dy /= distance;
            x += dx * push;
            y += dy * push;
          }
          nx += dx; ny += dy;
          hit = moved = true;
        }
        if (!moved) break;
      }
      const length = Math.hypot(nx, ny) || 1;
      return { x, y, hit, nx: nx / length, ny: ny / length };
    },
    isBuilding(x, y) { return !!buildingAt(x, y); },
    drawGround(c, v, viewport) {
      c.fillStyle = '#111411';
      c.fillRect(viewport.x0, viewport.y0, viewport.x1 - viewport.x0, viewport.y1 - viewport.y0);
      c.lineCap = 'butt';
      c.setLineDash([]);
      c.strokeStyle = '#625a49';
      c.lineWidth = ROAD + 18;
      c.beginPath();
      for (let x = Math.floor(viewport.x0 / BLOCK) * BLOCK; x <= viewport.x1 + BLOCK; x += BLOCK) {
        c.moveTo(x, viewport.y0); c.lineTo(x, viewport.y1);
      }
      for (let y = Math.floor(viewport.y0 / BLOCK) * BLOCK; y <= viewport.y1 + BLOCK; y += BLOCK) {
        c.moveTo(viewport.x0, y); c.lineTo(viewport.x1, y);
      }
      c.stroke();
      c.strokeStyle = '#292a25';
      c.lineWidth = ROAD;
      c.stroke();
      c.strokeStyle = 'rgba(207,187,142,.3)';
      c.lineWidth = 1.2;
      c.setLineDash([12, 16]);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(202,170,109,.26)';
      const step = 400;
      for (let x = Math.floor(viewport.x0 / step) * step; x <= viewport.x1; x += step)
        for (let y = Math.floor(viewport.y0 / step) * step; y <= viewport.y1; y += step)
          for (let i = -3; i <= 3; i++) {
            c.fillRect(x + i * 5 - 1, y - 38, 2, 12);
            c.fillRect(x + i * 5 - 1, y + 26, 2, 12);
            c.fillRect(x - 38, y + i * 5 - 1, 12, 2);
            c.fillRect(x + 26, y + i * 5 - 1, 12, 2);
          }
    },
    drawBuildings(c, v) {
      for (const b of buildingsIn(v.x0, v.y0, v.x1, v.y1)) {
        if (!visible(v, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
        c.fillStyle = 'rgba(0,0,0,.48)';
        c.fillRect(b.x + 8, b.y + 10, b.w, b.h);
        c.fillStyle = '#080d18';
        c.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        c.fillStyle = b.color;
        c.fillRect(b.x, b.y, b.w, b.h);
        c.fillStyle = b.accent;
        c.fillRect(b.x + 5, b.y + 5, b.w - 10, 2);
        if (b.windows) {
          const columns = Math.max(2, Math.floor(b.w / 25));
          const rows = Math.max(1, Math.floor(b.floors / 2));
          for (let row = 0; row < rows; row++) {
            c.fillStyle = row % 2 ? 'rgba(204,166,100,.5)' : 'rgba(171,93,76,.45)';
            for (let col = 0; col < columns; col++)
              c.fillRect(b.x + 10 + col * (b.w - 20) / columns, b.y + 16 + row * 14, 5, 7);
          }
        }
        if (b.style === 0) {
          c.fillStyle = '#111a2b';
          c.fillRect(b.x + b.w * .15, b.y + b.h * .56, b.w * .7, b.h * .3);
        } else if (b.style === 1) {
          c.fillStyle = 'rgba(6,11,22,.72)';
          c.fillRect(b.x + b.w * .15, b.y + b.h * .66, b.w * .7, b.h * .18);
          c.fillStyle = b.accent;
          c.fillRect(b.x + b.w * .18, b.y + b.h * .62, b.w * .64, 2);
        } else if (b.style === 2) {
          c.fillStyle = '#0c1421';
          c.fillRect(b.x + b.w * .18, b.y + b.h * .18, b.w * .64, b.h * .64);
        } else {
          c.strokeStyle = 'rgba(8,15,28,.8)';
          c.lineWidth = 2;
          c.strokeRect(b.x + 9, b.y + 9, b.w - 18, b.h - 18);
        }
        if (b.roof === 0) {
          c.fillStyle = '#101729';
          c.fillRect(b.x + b.w * .62, b.y + b.h * .18, b.w * .2, b.h * .16);
        } else if (b.roof === 1) {
          c.fillStyle = '#101729';
          c.fillRect(b.x + b.w * .2, b.y + b.h * .22, b.w * .22, b.h * .2);
          c.fillRect(b.x + b.w * .58, b.y + b.h * .6, b.w * .2, b.h * .18);
        } else {
          c.strokeStyle = 'rgba(150,178,177,.45)';
          c.lineWidth = 2;
          c.strokeRect(b.x + b.w * .2, b.y + b.h * .2, b.w * .6, b.h * .58);
        }
      }
    }
  };
}

const CITY = buildCity();
