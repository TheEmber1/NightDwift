(() => {
  const $ = id => document.getElementById(id);
  const cvEl = $('c'), ctx = cvEl.getContext('2d'), stage = $('stage');
  const H = 1 / 120, ZERO = { steer: 0, throttle: 0, brake: 0, hand: 0 };
  const FREE_GROUND = '#080c17';

  // canvas always fills the window; the world is scaled so at least 320x180 units are visible
  let dpr = 1;
  const fit = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cvEl.width = Math.max(2, Math.round(innerWidth * dpr));
    cvEl.height = Math.max(2, Math.round(innerHeight * dpr));
  };
  addEventListener('resize', fit); fit();

  // --- Car roster: real-car vector bodies + the same handling numbers as before ---
  const CARS = [
    { id: 'skyline', name: 'SKYLINE', spec: CAR_SPECS.skyline, cfg: { ENG: 260, VMAX: 218, GRIP: 255, L: 9.6 },  stats: 'POWER SLIDES · easy to hold a wide angle' },
    { id: 'supra',   name: 'SUPRA',   spec: CAR_SPECS.supra,   cfg: { ENG: 280, VMAX: 225, GRIP: 240, L: 10.2 }, stats: 'LONG SLIDES · high torque, loose rear' },
    { id: 'porsche', name: 'PORSCHE', spec: CAR_SPECS.porsche, cfg: { ENG: 250, VMAX: 220, GRIP: 290, L: 8.8 },  stats: 'TIGHT LINES · precise, controlled grip' },
    { id: 'rx7',     name: 'RX-7',    spec: CAR_SPECS.rx7,     cfg: { ENG: 245, VMAX: 210, GRIP: 250, L: 8.5 },  stats: 'QUICK TRANSITIONS · light and responsive' },
    { id: 'silvia',  name: 'SILVIA',  spec: CAR_SPECS.silvia,  cfg: { ENG: 240, VMAX: 208, GRIP: 260, L: 9.2 },  stats: 'ALL-ROUNDER · balanced and forgiving' },
    { id: 'ae86',    name: 'AE86',    spec: CAR_SPECS.ae86,    cfg: { ENG: 220, VMAX: 195, GRIP: 245, L: 8.2 },  stats: 'TIGHT CORNERS · compact and nimble' }
  ];

  let carIdx = 0;
  const car = new Car();
  car.setCfg(CARS[0].cfg);
  let SPEC = CARS[0].spec;
  const chase = new CopChase();
  const chaseScore = new ChaseScore();

  let trackId = TRACKS[0].id;
  let TR = TRACK_MAP[trackId];
  let LAPS = TRACKS[0].laps;

  let best = {};
  try { best = JSON.parse(localStorage.getItem('drift.best')) || {}; } catch (e) {}
  if (best.total && !best.circuit) {
    best.circuit = { total: best.total, lap: best.lap };
    delete best.total; delete best.lap;
  }
  const save = () => { try { localStorage.setItem('drift.best', JSON.stringify(best)); } catch (e) {} };
  const fmt = s => { const m = s / 60 | 0; return m + ':' + (s - m * 60).toFixed(3).padStart(6, '0'); };
  const getBest = id => best[id] || {};

  let menuMode = 'main';
  let mode = 'race', state = 'menu', sel = 0, t = 0, lapT = 0, lap = 1, cp = 1, count = 0, drift = 0, msgT = 0, acc = 0;
  let shake = 0, mult = 1, rankT = 0, rankTxt = '', zoom = 1.3, steerVis = 0, brakeVis = false;
  const cam = { x: 0, y: 0 };

  // tyre marks are stored as line segments (x0,y0,x1,y1) in a ring buffer
  const SK = 9000, sk = new Float32Array(SK * 4);
  let skn = 0, skc = 0;
  const pv = [{ ok: false, x: 0, y: 0 }, { ok: false, x: 0, y: 0 }];
  const parts = [];
  const el = { tl: $('tl'), tr: $('tr'), bl: $('bl'), br: $('br'), msg: $('msg') };
  const minimap = $('minimap'), mapCtx = minimap.getContext('2d');
  const menuItemsEl = $('menu-items');
  const preview = $('car-preview'), pctx = preview.getContext('2d');

  const say = (h, s) => { el.msg.innerHTML = h; msgT = s; };

  function selectCar(i) {
    carIdx = i;
    SPEC = CARS[i].spec;
    car.setCfg(CARS[i].cfg);
  }

  function getMenuItems() {
    if (menuMode === 'main') return [
      { label: 'TIME ATTACK', action: () => { menuMode = 'tracks'; sel = 0; } },
      { label: 'FREEPLAY', action: () => start('free') },
      { label: 'COP CHASE', action: () => start('chase') },
      { label: `<i class="dot" style="background:${SPEC.color}"></i>CAR: ${CARS[carIdx].name}`, action: () => { menuMode = 'cars'; sel = carIdx; } }
    ];
    if (menuMode === 'tracks') return TRACKS.map(tr => ({
      label: tr.name,
      action: () => { trackId = tr.id; TR = TRACK_MAP[tr.id]; LAPS = tr.laps; start('race'); }
    })).concat([{ label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }]);
    if (menuMode === 'cars') return CARS.map((c, i) => ({
      label: `<i class="dot" style="background:${c.spec.color}"></i>${c.name}${i === carIdx ? ' ✓' : ''}`,
      action: () => { selectCar(i); menuMode = 'main'; sel = 0; }
    })).concat([{ label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }]);
    return [];
  }

  function start(m) {
    mode = m; skn = skc = 0; pv[0].ok = pv[1].ok = false; parts.length = 0; drift = 0; msgT = 0; acc = 0;
    shake = 0; mult = 1; rankT = 0; rankTxt = ''; steerVis = 0; brakeVis = false;
    if (m === 'race') {
      const s = TR.start;
      car.reset(s.x, s.y, s.a);
      state = 'count'; count = 3.99; t = lapT = 0; lap = 1; cp = 1;
    } else if (m === 'chase') {
      car.reset(400, 400, 0);
      state = 'play'; t = lapT = 0;
      chaseScore.reset();
      chase.reset(car);
    } else {
      car.reset(0, 0, -Math.PI / 2);
      state = 'play';
    }
    cam.x = car.x; cam.y = car.y;
    stage.className = m === 'chase' ? 'chase' : m === 'race' ? 'race' : '';
  }

  function lapDone() {
    const lt = lapT; lapT = 0;
    const b = getBest(trackId);
    let rec = '';
    if (!b.lap || lt < b.lap) { b.lap = lt; rec = 'NEW FASTEST LAP'; }
    best[trackId] = b;
    if (lap >= LAPS) {
      state = 'done';
      const nr = !b.total || t < b.total;
      if (nr) b.total = t;
      best[trackId] = b;
      save();
      say(`FINISH<br><span class="hl">${fmt(t)}</span><small>${nr ? 'NEW RECORD!' : 'BEST ' + fmt(b.total)}<br>R / TRIANGLE RETRY<br>ESC / OPTIONS MENU</small>`, 1e9);
    } else {
      save(); lap++;
      say(`${fmt(lt)}<small>${rec || 'LAP ' + (lap - 1) + ' DONE'}</small>`, 1.8);
    }
  }

  function addSmoke(x, y, vx, vy, life, kind) {
    if (parts.length > 200) return;
    parts.push({ x, y, vx, vy, l: life, l0: life, kind: kind || 0 });
  }

  function finishChase() {
    state = 'done';
    const score = Math.floor(chaseScore.points);
    const record = getBest('chase');
    const isRecord = !record.score || score > record.score;
    if (isRecord) record.score = score;
    best.chase = record;
    save();
    say(`BUSTED<br><span class="hl">${score.toLocaleString()} POINTS</span><small>SURVIVED ${fmt(t)}<br>DRIFTED ${Math.floor(chaseScore.totalDistance * .285).toLocaleString()} M · ${chaseScore.multiplier.toFixed(1)}× MULTIPLIER<br>${isRecord ? 'NEW CHASE RECORD!' : 'BEST ' + record.score.toLocaleString()}<br>R / TRIANGLE RETRY<br>ESC / OPTIONS MENU</small>`, 1e9);
  }

  function sim(inp) {
    const i = state === 'play' ? inp : ZERO;
    const wasOn = car.on;
    car.step(i, H, mode === 'race' ? TR.on(car.x, car.y) : true);
    if (mode === 'chase') {
      const pos = CITY.resolve(car.x, car.y, 7);
      car.x = pos.x; car.y = pos.y;
      if (pos.hit) {
        car.vx *= 0.78; car.vy *= 0.78; car.w *= 0.75;
        shake = Math.max(shake, 0.18);
      }
    }
    const sp = car.speed, c = Math.cos(car.a), s = Math.sin(car.a);

    if (state === 'play') {
      t += H; lapT += H;
      if (mode === 'chase') {
        chaseScore.step(car, H);
        mult = chaseScore.multiplier;
      } else if (car.on && car.slip > 28 && sp > 30) {
        const add = (car.slip - 18) * sp / 18 * H * mult;
        drift += add;
        if (car.slip > 40) mult = Math.min(4, mult + H * 0.7);
      } else {
        mult = Math.max(1, mult - H * 1.8);
      }

      if (car.slip > 55 && sp > 50 && rankT <= 0) {
        rankTxt = mult >= 3 ? 'INSANE' : mult >= 2 ? 'GREAT' : 'NICE';
        rankT = 1.1;
      }

      if (mode === 'race') {
        const g = TR.cps[cp % TR.cps.length];
        if (Math.hypot(car.x - g[0], car.y - g[1]) < 52) {
          if (cp === TR.cps.length) { cp = 1; lapDone(); } else cp++;
        }
      } else if (mode === 'chase') {
        chase.step(car, H, chaseScore.confusion);
        if (chase.cops.some(cop => Math.hypot(car.x - cop.x, car.y - cop.y) < 27)) finishChase();
      }
    }

    const skidding = state !== 'count' && sp > 18 && car.on && (car.slip > 24 || (i.hand && sp > 28));
    if (skidding) {
      const rx = SPEC.rx, off = SPEC.hw - 0.5;
      [-off, off].forEach((ly, w) => {
        const nx = car.x + c * rx - s * ly, ny = car.y + s * rx + c * ly, p = pv[w];
        if (p.ok) { const o = skc * 4; sk[o] = p.x; sk[o + 1] = p.y; sk[o + 2] = nx; sk[o + 3] = ny; skc = (skc + 1) % SK; skn = Math.min(SK, skn + 1); }
        p.x = nx; p.y = ny; p.ok = true;
      });
      const bx = car.x + c * rx, by = car.y + s * rx;
      if (Math.random() < 0.45)
        addSmoke(bx + (Math.random() - .5) * 4, by + (Math.random() - .5) * 4,
                 car.vx * .15 + (Math.random() - .5) * 18, car.vy * .15 + (Math.random() - .5) * 18,
                 0.5 + Math.random() * 0.5, 0);
      if (car.slip > 45 && Math.random() < 0.35)
        addSmoke(bx - c * 1.5, by - s * 1.5, (Math.random() - .5) * 12, (Math.random() - .5) * 12, 0.7, 0);
    } else { pv[0].ok = pv[1].ok = false; }

    if (state !== 'count' && sp > 18) {
      if ((!car.on || (wasOn && !car.on)) && sp > 40) {
        shake = Math.max(shake, 0.35);
        for (let k = 0; k < 2; k++)
          if (Math.random() < .6) addSmoke(car.x + (Math.random() - .5) * 8, car.y + (Math.random() - .5) * 8,
                   (Math.random() - .5) * 30, (Math.random() - .5) * 30, 0.45, 1);
      } else if (car.slip > 60 && Math.random() < 0.2) {
        addSmoke(car.x - c * 3, car.y - s * 3, (Math.random() - .5) * 20, (Math.random() - .5) * 20, 0.2, 2);
      }
    }

    if (car.slip > 50 && sp > 45) shake = Math.max(shake, Math.min(0.55, (car.slip - 40) / 80));
  }

  function drawFreeGround(v) {
    const g = 32;
    for (let gy = Math.floor(v.y0 / g); gy <= v.y1 / g; gy++)
      for (let gx = Math.floor(v.x0 / g); gx <= v.x1 / g; gx++) {
        const X = gx * g, Y = gy * g;
        if (gx % 5 === 0 && gy % 5 === 0) {
          ctx.strokeStyle = 'rgba(73,223,255,.55)'; ctx.lineWidth = .7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(X - 3, Y); ctx.lineTo(X + 3, Y); ctx.moveTo(X, Y - 3); ctx.lineTo(X, Y + 3); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(122,161,205,.2)'; ctx.beginPath(); ctx.arc(X, Y, .8, 0, 7); ctx.fill();
        }
      }
  }

  function drawMinimap() {
    if (mode === 'race') {
      const w = minimap.width, h = minimap.height, pad = 14;
      const scale = Math.min((w - pad * 2) / TR.W, (h - pad * 2) / TR.H);
      const ox = (w - TR.W * scale) / 2, oy = (h - TR.H * scale) / 2;
      mapCtx.setTransform(1, 0, 0, 1, 0, 0);
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = '#080d19';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.save();
      mapCtx.setTransform(scale, 0, 0, scale, ox, oy);
      mapCtx.lineJoin = 'round';
      mapCtx.lineCap = 'round';
      mapCtx.beginPath();
      TR.cps.forEach((point, index) => index ? mapCtx.lineTo(point[0], point[1]) : mapCtx.moveTo(point[0], point[1]));
      mapCtx.closePath();
      mapCtx.strokeStyle = '#34445c';
      mapCtx.lineWidth = TR.meta.opts.HW * 2 + 14;
      mapCtx.stroke();
      mapCtx.strokeStyle = '#18243a';
      mapCtx.lineWidth = TR.meta.opts.HW * 2;
      mapCtx.stroke();
      mapCtx.setLineDash([5, 8]);
      mapCtx.strokeStyle = 'rgba(125,215,244,.65)';
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke();
      mapCtx.setLineDash([]);

      const target = TR.cps[cp % TR.cps.length];
      mapCtx.fillStyle = '#ff4f91';
      mapCtx.beginPath(); mapCtx.arc(target[0], target[1], 9, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#9bfbff';
      mapCtx.beginPath(); mapCtx.arc(car.x, car.y, 8, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.strokeStyle = '#e7f2ff';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(car.x, car.y, 12, 0, Math.PI * 2); mapCtx.stroke();
      mapCtx.restore();
      return;
    }
    if (mode !== 'chase') return;
    const w = minimap.width, h = minimap.height, scale = Math.min((w - 12) / 1800, (h - 12) / 1200);
    const x0 = car.x - w / scale / 2, y0 = car.y - h / scale / 2;
    const x1 = x0 + w / scale, y1 = y0 + h / scale;
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = '#080d19';
    mapCtx.fillRect(0, 0, w, h);
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.rect(0, 0, w, h);
    mapCtx.clip();
    mapCtx.setTransform(scale, 0, 0, scale, w / 2 - car.x * scale, h / 2 - car.y * scale);

    mapCtx.strokeStyle = '#1b3049';
    mapCtx.lineWidth = CITY.roadWidth;
    mapCtx.beginPath();
    for (let x = Math.floor(x0 / CITY.blockSize) * CITY.blockSize; x <= x1; x += CITY.blockSize) {
      mapCtx.moveTo(x, y0); mapCtx.lineTo(x, y1);
    }
    for (let y = Math.floor(y0 / CITY.blockSize) * CITY.blockSize; y <= y1; y += CITY.blockSize) {
      mapCtx.moveTo(x0, y); mapCtx.lineTo(x1, y);
    }
    mapCtx.stroke();
    for (const b of CITY.buildingsIn(x0, y0, x1, y1)) {
      mapCtx.fillStyle = b.color;
      mapCtx.fillRect(b.x, b.y, b.w, b.h);
      mapCtx.strokeStyle = b.accent;
      mapCtx.lineWidth = 3;
      mapCtx.strokeRect(b.x, b.y, b.w, b.h);
    }
    for (const cop of chase.cops) {
      mapCtx.fillStyle = 'rgba(255,54,94,.35)';
      mapCtx.beginPath(); mapCtx.arc(cop.x, cop.y, 26, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#ff426b';
      mapCtx.beginPath(); mapCtx.arc(cop.x, cop.y, 12, 0, Math.PI * 2); mapCtx.fill();
    }
    mapCtx.save();
    mapCtx.translate(car.x, car.y);
    mapCtx.rotate(car.a);
    mapCtx.shadowColor = '#55efff';
    mapCtx.shadowBlur = 14;
    mapCtx.fillStyle = '#9bfbff';
    mapCtx.beginPath();
    mapCtx.moveTo(20, 0); mapCtx.lineTo(-11, -10); mapCtx.lineTo(-7, 0); mapCtx.lineTo(-11, 10);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
    mapCtx.restore();
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapCtx.strokeStyle = 'rgba(93,220,255,.3)';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(w / 2 - 4, h / 2); mapCtx.lineTo(w / 2 + 4, h / 2);
    mapCtx.moveTo(w / 2, h / 2 - 4); mapCtx.lineTo(w / 2, h / 2 + 4);
    mapCtx.stroke();
  }

  function draw() {
    const cw = cvEl.width, ch = cvEl.height;
    let ox = 0, oy = 0;
    if (shake > 0.04) { ox = (Math.random() - .5) * shake * 1.8; oy = (Math.random() - .5) * shake * 1.8; }
    const k = Math.min(cw / 320, ch / 180) * zoom, cx = cam.x + ox, cy = cam.y + oy;
    const v = { x0: cx - cw / 2 / k, y0: cy - ch / 2 / k, x1: cx + cw / 2 / k, y1: cy + ch / 2 / k };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = mode === 'race' ? TR.ground : FREE_GROUND;
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(k, 0, 0, k, cw / 2 - cx * k, ch / 2 - cy * k);

    if (mode === 'race') TR.drawGround(ctx, v);
    else if (mode === 'chase') CITY.drawGround(ctx, v, v);
    else drawFreeGround(v);
    if (mode === 'chase') CITY.drawBuildings(ctx, v);

    // tyre marks (one stroke, so overlaps never get darker)
    if (skn) {
      ctx.lineWidth = 1.05; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(6,8,12,.36)';
      ctx.beginPath();
      for (let i = 0; i < skn; i++) {
        const o = i * 4, x0 = sk[o], y0 = sk[o + 1];
        if (x0 < v.x0 - 4 || x0 > v.x1 + 4 || y0 < v.y0 - 4 || y0 > v.y1 + 4) continue;
        ctx.moveTo(x0, y0); ctx.lineTo(sk[o + 2], sk[o + 3]);
      }
      ctx.stroke();
    }

    if (mode === 'race') TR.drawProps(ctx, v);

    // smoke sits under the car, sparks over it
    for (const p of parts) if (p.kind < 2) {
      const u = Math.max(0, p.l / p.l0);
      if (p.kind === 0) { ctx.globalAlpha = .34 * u * u; ctx.fillStyle = '#e9eef4'; }
      else { ctx.globalAlpha = .3 * u; ctx.fillStyle = '#b9c79a'; }
      ctx.beginPath(); ctx.arc(p.x, p.y, (p.kind ? 1 : 1.5) + (1 - u) * (p.kind ? 3 : 5.5), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (mode === 'chase') {
      const sirenOn = Math.floor(performance.now() / 180) % 2;
      for (let i = 0; i < chase.cops.length; i++) {
        const cop = chase.cops[i];
        drawCar(ctx, CARS[2].spec, cop.x, cop.y, cop.a, { shadow: true });
        ctx.save();
        ctx.translate(cop.x, cop.y);
        ctx.rotate(cop.a);
        ctx.fillStyle = '#111820';
        ctx.fillRect(-1.5, -1.05, 3, 2.1);
        ctx.globalCompositeOperation = 'lighter';
        const pulse = .65 + .35 * Math.sin(performance.now() / 80 + i);
        ctx.globalAlpha = pulse;
        ctx.shadowBlur = 12;
        ctx.shadowColor = sirenOn ? '#399dff' : '#ff263f';
        ctx.fillStyle = sirenOn ? '#68c7ff' : '#ff6673';
        ctx.fillRect(-1.15, -0.78, 1.05, 1.56);
        ctx.shadowColor = sirenOn ? '#ff263f' : '#399dff';
        ctx.fillStyle = sirenOn ? '#ff6673' : '#68c7ff';
        ctx.fillRect(0.1, -0.78, 1.05, 1.56);
        ctx.restore();
      }
    }

    const sp = car.speed;
    const steerRad = Math.max(-.6, Math.min(.6, steerVis * .68 / (1 + sp / 55) * 1.5));
    drawCar(ctx, SPEC, car.x, car.y, car.a, { steer: steerRad, brake: brakeVis, lights: true });

    for (const p of parts) if (p.kind === 2) {
      ctx.globalAlpha = Math.min(1, p.l * 5);
      ctx.fillStyle = p.l > .12 ? '#ffb347' : '#ffe9c4';
      ctx.beginPath(); ctx.arc(p.x, p.y, .6, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawMinimap();
  }

  function hud(dt) {
    const b = getBest(trackId);
    if (mode === 'race') {
      el.tl.innerHTML = `<span class="lbl">${TR.meta.name} · LAP ${lap}/${LAPS}</span><span class="val big">${fmt(t)}</span>`;
      el.tr.innerHTML = `<span class="lbl">BEST</span><span class="val">${b.total ? fmt(b.total) : '--'}</span><span class="lbl">FASTEST LAP</span><span class="val">${b.lap ? fmt(b.lap) : '--'}</span>`;
    } else if (mode === 'chase') {
      const score = Math.floor(chaseScore.points);
      const chaseBest = getBest('chase').score || 0;
      el.tl.innerHTML = `<span class="lbl">COP CHASE · SURVIVED ${fmt(t)}</span><span class="val big">${score.toLocaleString()}<span class="unit">POINTS</span></span>`;
      el.tr.innerHTML = `<span class="lbl">PURSUIT · ${chase.cops.length} COP${chase.cops.length === 1 ? '' : 'S'}</span><span class="val">DISTRACTION ${Math.round(chaseScore.confusion * 20)}%</span><span class="lbl">BEST SCORE</span><span class="val">${chaseBest ? chaseBest.toLocaleString() : '--'}</span>`;
    } else {
      el.tl.innerHTML = `<span class="lbl">FREEPLAY</span><span class="val big">${CARS[carIdx].name}</span>`;
      el.tr.innerHTML = '<span class="lbl">R / TRIANGLE RESET</span>';
    }
    el.bl.innerHTML = `<span class="val big">${Math.round(car.speed * 1.4)}<span class="unit">KM/H</span></span>`;
    el.br.innerHTML = mode === 'chase'
      ? `<span class="lbl">DRIFT CHAIN · ${Math.floor(chaseScore.chainDistance * .285)} M</span><span class="val big hl">${mult.toFixed(1)}<span class="mult">×</span></span>`
      : `<span class="lbl">DRIFT</span><span class="val big hl">${Math.floor(drift)}${mult > 1.15 ? `<span class="mult">×${mult.toFixed(1)}</span>` : ''}</span>`;

    rankT -= dt;
    if (rankT > 0 && state === 'play') {
      el.msg.innerHTML = `<span class="hl">${rankTxt}</span>`;
      el.msg.style.display = 'block';
    } else {
      msgT -= dt;
      el.msg.style.display = msgT > 0 ? 'block' : 'none';
    }
  }

  let lastSig = '';
  function paintPreview() {
    if (menuMode !== 'cars' || sel >= CARS.length) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, preview.width, preview.height);
    const a = performance.now() / 2600;
    pctx.setTransform(22, 0, 0, 22, preview.width / 2, preview.height / 2);
    drawCar(pctx, CARS[sel].spec, 0, 0, a, { steer: 0, shadow: true });
  }

  function paint() {
    const items = getMenuItems();
    const sig = menuMode + '|' + sel + '|' + carIdx + '|' + trackId;
    if (sig !== lastSig) {
      lastSig = sig;
      menuItemsEl.innerHTML = items.map((it, i) => `<div class="item${i === sel ? ' sel' : ''}">${it.label}</div>`).join('');
      menuItemsEl.querySelectorAll('.item').forEach((e, i) => {
        e.onclick = () => { items[i].action(); lastSig = ''; };
        e.onmouseenter = () => { if (sel !== i) { sel = i; } };
      });

      const b = getBest(trackId);
      if (menuMode === 'main') {
        const raceRecord = b.total ? 'BEST ' + TRACKS.find(t => t.id === trackId).name + ' ' + fmt(b.total) : '';
        const chaseRecord = getBest('chase').score ? 'CHASE BEST ' + getBest('chase').score.toLocaleString() : '';
        $('best').textContent = [raceRecord, chaseRecord].filter(Boolean).join(' · ');
      } else if (menuMode === 'tracks') {
        const tr = TRACKS[Math.min(sel, TRACKS.length - 1)];
        const bb = tr ? getBest(tr.id) : {};
        $('best').textContent = bb.total ? 'RECORD ' + fmt(bb.total) : (tr ? 'NO RECORD YET' : '');
      } else if (menuMode === 'cars' && sel < CARS.length) {
        $('best').textContent = CARS[sel].stats;
      } else {
        $('best').textContent = '';
      }
    }
    $('menu').classList.toggle('sub', menuMode !== 'main');
    paintPreview();
    $('pad').textContent = Input.connected() ? 'CONTROLLER CONNECTED' : 'PRESS A BUTTON TO CONNECT A CONTROLLER';
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const inp = Input.poll(dt), q = inp.p;

    if (state === 'menu') {
      const items = getMenuItems();
      if (q.up) { sel = (sel - 1 + items.length) % items.length; }
      if (q.down) { sel = (sel + 1) % items.length; }
      if (q.ok) { items[sel].action(); lastSig = ''; }
      if (q.menu && menuMode !== 'main') { menuMode = 'main'; sel = 0; }
      paint();
    } else if (q.menu) {
      state = 'menu'; menuMode = 'main'; sel = 0; stage.className = 'menu'; lastSig = '';
    } else if (q.reset || (state === 'done' && q.ok)) {
      start(mode);
    }

    if (state !== 'menu') {
      if (state === 'count') {
        count -= dt;
        if (count <= 0) { state = 'play'; t = lapT = 0; say('GO!', .9); } else say(Math.ceil(count), .2);
      }
      acc += dt;
      while (acc >= H) { sim(inp); acc -= H; }

      if (state === 'play' && car.slip > 30 && car.speed > 35)
        Input.rumble(Math.min(.85, car.slip / 140), .28);

      // visual-only bits: steering wheel smoothing, brake lights, camera follow + speed zoom
      const live = state === 'play';
      steerVis += ((live ? inp.steer : 0) - steerVis) * (1 - Math.exp(-dt * 14));
      brakeVis = live && (inp.brake > .1 || !!inp.hand);
      const k = 1 - Math.exp(-dt * 8);
      cam.x += (car.x - cam.x) * k;
      cam.y += (car.y - cam.y) * k;
      zoom += ((1.32 - .22 * Math.min(1, car.speed / 200)) - zoom) * (1 - Math.exp(-dt * 2));
      shake = Math.max(0, shake - dt * 4);

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
        p.l -= dt;
        if (p.l <= 0) parts.splice(i, 1);
      }
      draw(); hud(dt);
    }
    requestAnimationFrame(frame);
  }
  window.focus();
  addEventListener('pointerdown', () => window.focus());
  paint();
  requestAnimationFrame(frame);
})();
