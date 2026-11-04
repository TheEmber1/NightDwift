(() => {
  const $ = id => document.getElementById(id);
  const cvEl = $('c'), ctx = cvEl.getContext('2d'), stage = $('stage');
  const H = 1 / 120, ZERO = { steer: 0, throttle: 0, brake: 0, hand: 0 };
  const FREE_GROUND = '#171a15';
  const PIXEL_SCALE = 0.62;

  // canvas always fills the window; the world is scaled so at least 320x180 units are visible
  let dpr = 1;
  const fit = () => {
    dpr = Math.min(1, window.devicePixelRatio || 1) * PIXEL_SCALE;
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

  const GARAGE_OPTIONS = {
    color: [
      { id: 'factory', name: 'FACTORY', color: null },
      { id: 'blue', name: 'MIDNIGHT BLUE', color: '#315b98' },
      { id: 'red', name: 'CHERRY RED', color: '#b74438' },
      { id: 'ivory', name: 'OLD IVORY', color: '#e5dcc3' },
      { id: 'yellow', name: 'SIGNAL YELLOW', color: '#e2bd43' },
      { id: 'jade', name: 'JADE GREEN', color: '#508575' },
      { id: 'purple', name: 'PLUM PURPLE', color: '#815c85' }
    ],
    paint: [
      { id: 'factory', name: 'FACTORY SOLID' },
      { id: 'stripes', name: 'TWIN STRIPES' },
      { id: 'two-tone', name: 'TWO-TONE' },
      { id: 'panda', name: 'PANDA' }
    ],
    wing: [
      { id: 'stock', name: 'STOCK' },
      { id: 'gt', name: 'GT WING' },
      { id: 'ducktail', name: 'DUCKTAIL' },
      { id: 'none', name: 'NO WING' }
    ],
    wheels: [
      { id: 'steel', name: 'STEELIES', grip: 1, feel: 'BALANCED' },
      { id: 'bronze', name: 'BRONZE', grip: 0.9, feel: 'LOOSE' },
      { id: 'white', name: 'WHITE', grip: 1.16, feel: 'STICKY' },
      { id: 'gunmetal', name: 'GUNMETAL', grip: 0.82, feel: 'SLIPPERY' },
      { id: 'gold', name: 'GOLD', grip: 1.08, feel: 'GRIPPY' }
    ]
  };
  let savedGarage = {};
  try {
    const stored = JSON.parse(localStorage.getItem('drift.garage'));
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) savedGarage = stored;
  } catch (e) {}

  let carIdx = 0;
  try {
    const savedCar = CARS.findIndex(car => car.id === localStorage.getItem('drift.selectedCar'));
    if (savedCar >= 0) carIdx = savedCar;
  } catch (e) {}
  let carMenuReturn = 'main', garageCategory = 'color';
  const car = new Car();
  car.setCfg(CARS[carIdx].cfg);
  let SPEC = CARS[carIdx].spec;

  let trackId = TRACKS[0].id;
  try {
    const savedTrack = localStorage.getItem('drift.selectedTrack');
    if (TRACKS.some(track => track.id === savedTrack)) trackId = savedTrack;
  } catch (e) {}
  let TR = TRACK_MAP[trackId];
  let LAPS = TRACK_MAP[trackId].meta.laps;

  let best = {};
  try {
    best = JSON.parse(localStorage.getItem('drift.best')) || {};
    if (localStorage.getItem('drift.timeAttackFormat') !== 'one-lap-v1') {
      for (const track of TRACKS) {
        const record = best[track.id];
        if (!record) continue;
        if (Number.isFinite(record.lap) && record.lap > 0) record.total = record.lap;
        else delete record.total;
      }
      localStorage.setItem('drift.best', JSON.stringify(best));
      localStorage.setItem('drift.timeAttackFormat', 'one-lap-v1');
    }
  } catch (e) {}
  if (best.total && !best.circuit) {
    best.circuit = { total: best.total, lap: best.lap };
    delete best.total; delete best.lap;
  }
  const save = () => {
    try { localStorage.setItem('drift.best', JSON.stringify(best)); } catch (e) {}
    markGameSaveChanged();
  };
  const recordProfileRun = (score, completed) => {
    if (runRecorded || !runId || t < 1) return;
    runRecorded = true;
    Profile.recordRun(mode, score, t, completed, runId);
  };
  const fmt = s => { const m = s / 60 | 0; return m + ':' + (s - m * 60).toFixed(3).padStart(6, '0'); };
  const getBest = id => best[id] || {};
  const recentTimesKey = id => `drift.times.${id}`;
  const getRecentTimes = id => {
    try {
      const times = JSON.parse(localStorage.getItem(recentTimesKey(id)));
      return Array.isArray(times) ? times.filter(time => Number.isFinite(time) && time > 0).slice(0, 5) : [];
    } catch (e) {
      return [];
    }
  };
  const saveRecentTime = (id, time) => {
    const times = [time, ...getRecentTimes(id)].slice(0, 5);
    try { localStorage.setItem(recentTimesKey(id), JSON.stringify(times)); } catch (e) {}
    markGameSaveChanged();
    return times;
  };
  const gameSaveTimestampKey = 'drift.gameSaveUpdatedAt';
  let gameSaveUpdatedAt = 0;
  try { gameSaveUpdatedAt = Number(localStorage.getItem(gameSaveTimestampKey)) || 0; } catch (e) {}
  let gameSaveTimer = 0, gameSaveRevision = 0;
  const getGameSaveData = () => {
    const recentTimes = {};
    for (const track of TRACKS) recentTimes[track.id] = getRecentTimes(track.id);
    return {
      version: 1,
      selectedCar: CARS[carIdx].id,
      selectedTrack: trackId,
      garage: savedGarage,
      best,
      recentTimes,
      soundEnabled: SFX.enabled
    };
  };
  const setGameSaveTimestamp = (timestamp, userId, data) => {
    gameSaveUpdatedAt = Date.parse(timestamp) || Number(timestamp) || Date.now();
    try {
      localStorage.setItem(gameSaveTimestampKey, String(gameSaveUpdatedAt));
      if (userId && data)
        localStorage.setItem(`drift.profileSave.${userId}`, JSON.stringify({ data, updatedAt: gameSaveUpdatedAt }));
    } catch (e) {}
  };
  try {
    const soundEnabled = localStorage.getItem('drift.soundEnabled');
    if (soundEnabled !== null) SFX.setEnabled(soundEnabled === 'true');
  } catch (e) {}
  const markGameSaveChanged = () => {
    const saveOwner = Profile.getUserId();
    gameSaveUpdatedAt = Date.now();
    try {
      localStorage.setItem('drift.selectedCar', CARS[carIdx].id);
      localStorage.setItem('drift.selectedTrack', trackId);
      localStorage.setItem(gameSaveTimestampKey, String(gameSaveUpdatedAt));
    } catch (e) {}
    gameSaveRevision++;
    Profile.cacheGameSave(getGameSaveData());
    window.clearTimeout(gameSaveTimer);
    gameSaveTimer = window.setTimeout(async () => {
      const revision = gameSaveRevision;
      try {
        const savedAt = await Profile.saveGameData(getGameSaveData(), saveOwner);
        if (savedAt && revision === gameSaveRevision) setGameSaveTimestamp(savedAt);
      } catch (error) {
        console.error('Unable to sync player save:', error);
      }
    }, 750);
  };
  const garageChoices = id => {
    const saved = savedGarage[id] && typeof savedGarage[id] === 'object' ? savedGarage[id] : {};
    const setup = {};
    for (const [category, options] of Object.entries(GARAGE_OPTIONS)) {
      setup[category] = options.some(option => option.id === saved[category]) ? saved[category] : options[0].id;
    }
    return setup;
  };
  const garageSetup = id => {
    const choices = garageChoices(id), paint = GARAGE_OPTIONS.color.find(option => option.id === choices.color);
    const wheel = GARAGE_OPTIONS.wheels.find(option => option.id === choices.wheels);
    const gripChange = Math.round((wheel.grip - 1) * 100);
    return {
      ...choices,
      colorId: choices.color,
      color: paint.color || CAR_SPECS[id].color,
      wheelGrip: wheel.grip,
      wheelFeel: wheel.feel,
      gripChange,
      wheelStats: `GRIP ${gripChange > 0 ? '+' : ''}${gripChange}% · ${wheel.feel}`
    };
  };
  const saveGarage = () => {
    try { localStorage.setItem('drift.garage', JSON.stringify(savedGarage)); } catch (e) {}
    markGameSaveChanged();
  };
  const applyRemoteGameSave = (data, updatedAt, userId) => {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('The saved game data is invalid.');
    const car = CARS.findIndex(item => item.id === data.selectedCar);
    if (car >= 0) carIdx = car;
    if (TRACKS.some(track => track.id === data.selectedTrack)) trackId = data.selectedTrack;
    savedGarage = data.garage && typeof data.garage === 'object' && !Array.isArray(data.garage)
      ? data.garage : {};
    for (const item of CARS) savedGarage[item.id] = garageChoices(item.id);

    best = {};
    if (data.best && typeof data.best === 'object' && !Array.isArray(data.best)) {
      for (const track of TRACKS) {
        const record = data.best[track.id];
        if (!record || typeof record !== 'object') continue;
        const total = Number(record.total), lap = Number(record.lap);
        const clean = {};
        if (Number.isFinite(total) && total > 0) clean.total = total;
        if (Number.isFinite(lap) && lap > 0) clean.lap = lap;
        if (Object.keys(clean).length) best[track.id] = clean;
      }
    }
    try { localStorage.setItem('drift.best', JSON.stringify(best)); } catch (e) {}

    for (const track of TRACKS) {
      const recent = data.recentTimes?.[track.id];
      const times = Array.isArray(recent)
        ? recent.map(Number).filter(time => Number.isFinite(time) && time > 0).slice(0, 5)
        : [];
      try { localStorage.setItem(recentTimesKey(track.id), JSON.stringify(times)); } catch (e) {}
    }
    if (typeof data.soundEnabled === 'boolean') {
      SFX.setEnabled(data.soundEnabled);
      try { localStorage.setItem('drift.soundEnabled', String(data.soundEnabled)); } catch (e) {}
    }
    try {
      localStorage.setItem('drift.garage', JSON.stringify(savedGarage));
      localStorage.setItem('drift.selectedCar', CARS[carIdx].id);
      localStorage.setItem('drift.selectedTrack', trackId);
    } catch (e) {}
    setGameSaveTimestamp(updatedAt, userId, data);
    TR = TRACK_MAP[trackId];
    LAPS = TR.meta.laps;
    selectCar(carIdx);
    lastSig = '';
    paint();
  };

  let menuMode = 'main';
  let mode = 'race', state = 'menu', sel = 0, t = 0, lapT = 0, lap = 1, cp = 1, count = 0, drift = 0, msgT = 0, acc = 0;
  let runId = null, runRecorded = false, raceChallenge = false, friendTimesRequest = 0, profileSyncElapsed = 0;
  let shake = 0, mult = 1, zoom = 1.3, steerVis = 0, brakeVis = false;
  const cam = { x: 0, y: 0 };

  // tyre marks are stored as line segments (x0,y0,x1,y1) in a ring buffer
  const SK = 9000, sk = new Float32Array(SK * 5);
  let skn = 0, skc = 0;
  const pv = [{ ok: false, x: 0, y: 0 }, { ok: false, x: 0, y: 0 }];
  const parts = [];
  let wasHandbrake = false, lastCountdown = 0;
  const el = { tl: $('tl'), tr: $('tr'), bl: $('bl'), br: $('br'), msg: $('msg') };
  const minimap = $('minimap'), mapCtx = minimap.getContext('2d');
  const menuItemsEl = $('menu-items');
  const preview = $('car-preview'), pctx = preview.getContext('2d');
  const raceResult = $('race-result');
  const leaderboardView = $('leaderboard-view');
  const leaderboardTabs = $('leaderboard-tabs');
  const leaderboardRows = $('leaderboard-rows');
  let leaderboardTrack = trackId, leaderboardRequest = 0;

  const say = (h, s) => { el.msg.innerHTML = h; msgT = s; };
  const hideRaceResult = () => {
    raceResult.hidden = true;
    raceResult.setAttribute('aria-hidden', 'true');
  };
  const showRaceResult = (time, previousBest, currentBest, isNewBest) => {
    $('race-result-track').textContent = TR.meta.name;
    $('race-result-time').textContent = fmt(time);
    $('race-result-previous').textContent = previousBest ? fmt(previousBest) : '--';
    $('race-result-best').textContent = fmt(currentBest);
    $('race-result-note').textContent = !previousBest
      ? 'FIRST TIME ON THIS TRACK'
      : isNewBest
        ? `NEW BEST · ${fmt(previousBest - time)} FASTER`
        : time === previousBest
          ? 'MATCHED YOUR BEST'
          : `${fmt(time - previousBest)} OFF YOUR BEST`;
    const recent = saveRecentTime(trackId, time);
    const list = $('race-result-recent');
    list.replaceChildren();
    recent.forEach((recentTime, index) => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = index === 0 ? 'LATEST' : `RUN ${index + 1}`;
      const result = document.createElement('strong');
      result.textContent = fmt(recentTime);
      row.append(label, result);
      list.append(row);
    });
    raceResult.hidden = false;
    raceResult.setAttribute('aria-hidden', 'false');
    $('race-result-retry').focus();
  };

  function selectCar(i) {
    carIdx = i;
    SPEC = CARS[i].spec;
    car.setCfg({ ...CARS[i].cfg, GRIP: CARS[i].cfg.GRIP * garageSetup(CARS[i].id).wheelGrip });
  }
  selectCar(carIdx);

  function getMenuItems() {
    if (menuMode === 'main') return [
      { label: 'TIME ATTACK', action: () => { menuMode = 'tracks'; sel = 0; } },
      { label: 'FRIEND TIME ATTACK', action: () => {
        if (!Profile.isSignedIn()) { Profile.open(); return; }
        menuMode = 'friend-tracks'; sel = 0;
      } },
      { label: 'LEADERBOARDS', action: () => { menuMode = 'leaderboard'; leaderboardTrack = trackId; sel = 0; } },
      { label: 'FREEPLAY', action: () => start('free') },
      { label: 'GARAGE', action: () => { menuMode = 'garage'; sel = 0; } },
      { label: 'SETTINGS', action: () => { menuMode = 'settings'; sel = 0; } }
    ];
    if (menuMode === 'tracks') return TRACKS.map(tr => ({
      label: tr.name,
      action: () => { trackId = tr.id; TR = TRACK_MAP[tr.id]; LAPS = tr.laps; markGameSaveChanged(); start('race', false); }
    })).concat([{ label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }]);
    if (menuMode === 'friend-tracks') return TRACKS.map(tr => ({
      label: tr.name,
      action: () => { trackId = tr.id; TR = TRACK_MAP[tr.id]; LAPS = tr.laps; markGameSaveChanged(); start('race', true); }
    })).concat([{ label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }]);
    if (menuMode === 'cars') return CARS.map((c, i) => ({
      label: `<i class="dot" style="background:${c.spec.color}"></i>${c.name}${i === carIdx ? ' ✓' : ''}`,
      action: () => { selectCar(i); markGameSaveChanged(); menuMode = carMenuReturn; sel = 0; }
    })).concat([{ label: '‹ BACK', action: () => { menuMode = carMenuReturn; sel = 0; } }]);
    if (menuMode === 'garage') {
      const setup = garageSetup(CARS[carIdx].id);
      const colorName = GARAGE_OPTIONS.color.find(option => option.id === setup.colorId)?.name || GARAGE_OPTIONS.color[0].name;
      return [
        { label: `CAR: ${CARS[carIdx].name}`, action: () => { carMenuReturn = 'garage'; menuMode = 'cars'; sel = carIdx; } },
        { label: `BODY COLOR: ${colorName}`, action: () => openGarageCategory('color') },
        { label: `PAINT STYLE: ${GARAGE_OPTIONS.paint.find(option => option.id === setup.paint)?.name}`, action: () => openGarageCategory('paint') },
        { label: `WING: ${GARAGE_OPTIONS.wing.find(option => option.id === setup.wing)?.name}`, action: () => openGarageCategory('wing') },
        { label: `DRIFT WHEELS: ${GARAGE_OPTIONS.wheels.find(option => option.id === setup.wheels)?.name} · ${setup.wheelStats}`, action: () => openGarageCategory('wheels') },
        { label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }
      ];
    }
    if (menuMode === 'garage-option') {
      const options = GARAGE_OPTIONS[garageCategory];
      const current = garageChoices(CARS[carIdx].id)[garageCategory];
      return options.map(option => ({
        label: `${garageCategory === 'color' ? `<i class="dot" style="background:${option.color || CARS[carIdx].spec.color}"></i>` : ''}<span class="option-name">${option.name}${option.id === current ? ' ✓' : ''}</span>${garageCategory === 'wheels' ? `<small class="option-stat">GRIP ${Math.round((option.grip - 1) * 100) > 0 ? '+' : ''}${Math.round((option.grip - 1) * 100)}% · ${option.feel}</small>` : ''}`,
        action: () => {
          const id = CARS[carIdx].id;
          savedGarage[id] = { ...garageChoices(id), [garageCategory]: option.id };
          saveGarage();
          selectCar(carIdx);
          menuMode = 'garage';
          sel = ['color', 'paint', 'wing', 'wheels'].indexOf(garageCategory) + 1;
        }
      })).concat([{ label: '‹ BACK', action: () => { menuMode = 'garage'; sel = ['color', 'paint', 'wing', 'wheels'].indexOf(garageCategory) + 1; } }]);
    }
    if (menuMode === 'settings') return [
      { label: `SOUND: ${SFX.enabled ? 'ON' : 'OFF'}`, action: () => { SFX.setEnabled(!SFX.enabled); try { localStorage.setItem('drift.soundEnabled', String(SFX.enabled)); } catch (e) {} markGameSaveChanged(); } },
      { label: '‹ BACK', action: () => { menuMode = 'main'; sel = 0; } }
    ];
    if (menuMode === 'leaderboard') return [
      { label: '‹ BACK TO MENU', action: () => { menuMode = 'main'; sel = 0; } }
    ];
    return [];
  }

  function openGarageCategory(category) {
    garageCategory = category;
    menuMode = 'garage-option';
    sel = GARAGE_OPTIONS[category].findIndex(option => option.id === garageSetup(CARS[carIdx].id)[category]);
  }

  function backToParentMenu() {
    if (menuMode === 'garage-option') {
      menuMode = 'garage';
      sel = ['color', 'paint', 'wing', 'wheels'].indexOf(garageCategory) + 1;
    } else if (menuMode === 'cars') {
      menuMode = carMenuReturn;
      sel = 0;
    } else if (menuMode === 'leaderboard') {
      menuMode = 'main';
      sel = 0;
    } else {
      menuMode = 'main';
      sel = 0;
    }
  }

  function start(m, challenge = raceChallenge) {
    mode = m; skn = skc = 0; pv[0].ok = pv[1].ok = false; parts.length = 0; drift = 0; msgT = 0; acc = 0;
    hideRaceResult();
    raceChallenge = m === 'race' && challenge;
    runId = crypto.randomUUID(); runRecorded = false; profileSyncElapsed = 0;
    wasHandbrake = false; lastCountdown = 0;
    shake = 0; mult = 1; steerVis = 0; brakeVis = false;
    if (m === 'race') {
      const s = TR.start;
      car.reset(s.x, s.y, s.a);
      state = 'count'; count = 3.99; t = lapT = 0; lap = 1; cp = 1;
    } else {
      car.reset(0, 0, -Math.PI / 2);
      state = 'play'; t = lapT = 0;
    }
    cam.x = car.x; cam.y = car.y;
    stage.className = m === 'race' ? 'race' : '';
  }

  function lapDone() {
    SFX.lap();
    const lt = lapT; lapT = 0;
    const b = getBest(trackId);
    const previousBest = b.total || 0;
    let rec = '';
    if (!b.lap || lt < b.lap) { b.lap = lt; rec = 'NEW FASTEST LAP'; }
    best[trackId] = b;
    if (lap >= LAPS) {
      state = 'done';
      msgT = 0;
      el.msg.style.display = 'none';
      recordProfileRun(Math.floor(drift), true);
      const isNewBest = !previousBest || t < previousBest;
      if (isNewBest) b.total = t;
      best[trackId] = b;
      save();
      Profile.recordTimeAttack(trackId, t * 1000, CARS[carIdx].id, garageChoices(CARS[carIdx].id));
      showRaceResult(t, previousBest, b.total, isNewBest);
    } else {
      save(); lap++;
      say(`${fmt(lt)}<small>${rec || 'LAP ' + (lap - 1) + ' DONE'}</small>`, 1.8);
    }
  }

  function addSmoke(x, y, vx, vy, life, kind) {
    if (parts.length > 200) return;
    parts.push({ x, y, vx, vy, l: life, l0: life, kind: kind || 0 });
  }

  function sim(inp) {
    const i = state === 'play' ? inp : ZERO;
    const wasOn = car.on;
    car.step(i, H, mode === 'race' ? TR.on(car.x, car.y) : true);
    const sp = car.speed, c = Math.cos(car.a), s = Math.sin(car.a);

    if (state === 'play') {
      t += H; lapT += H;
      if (car.on && car.slip > 28 && sp > 30) {
        const add = (car.slip - 18) * sp / 18 * H * mult;
        drift += add;
        if (car.slip > 40) mult = Math.min(4, mult + H * 0.7);
      } else {
        mult = Math.max(1, mult - H * 1.8);
      }

      if (mode === 'race') {
        const g = TR.cps[cp % TR.cps.length];
        if (Math.hypot(car.x - g[0], car.y - g[1]) < 52) {
          if (cp === TR.cps.length) { cp = 1; lapDone(); } else cp++;
        }
      }
    }

    const skidding = state !== 'count' && sp > 18 && car.on && (car.slip > 24 || (i.hand && sp > 28));
    if (skidding) {
      const rx = SPEC.rx, off = SPEC.hw - 0.5;
      [-off, off].forEach((ly, w) => {
        const nx = car.x + c * rx - s * ly, ny = car.y + s * rx + c * ly, p = pv[w];
        if (p.ok) {
          const o = skc * 5;
          sk[o] = p.x; sk[o + 1] = p.y; sk[o + 2] = nx; sk[o + 3] = ny; sk[o + 4] = i.hand ? 1 : 0;
          skc = (skc + 1) % SK; skn = Math.min(SK, skn + 1);
        }
        p.x = nx; p.y = ny; p.ok = true;
      });
      const bx = car.x + c * rx, by = car.y + s * rx;
      if (Math.random() < (i.hand ? 0.78 : 0.45))
        addSmoke(bx + (Math.random() - .5) * 4, by + (Math.random() - .5) * 4,
                 car.vx * .15 + (Math.random() - .5) * 18, car.vy * .15 + (Math.random() - .5) * 18,
                 0.5 + Math.random() * 0.5, 0);
      if (car.slip > 45 && Math.random() < 0.35)
        addSmoke(bx - c * 1.5, by - s * 1.5, (Math.random() - .5) * 12, (Math.random() - .5) * 12, 0.7, 0);
      if (i.hand && sp > 70 && Math.random() < 0.42)
        addSmoke(bx + c * 2, by + s * 2, (Math.random() - .5) * 24, (Math.random() - .5) * 24, 0.22, 2);
      if (i.hand && sp > 55) shake = Math.max(shake, 0.07);
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
          ctx.strokeStyle = 'rgba(239,179,92,.5)'; ctx.lineWidth = .7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(X - 3, Y); ctx.lineTo(X + 3, Y); ctx.moveTo(X, Y - 3); ctx.lineTo(X, Y + 3); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(172,157,120,.2)'; ctx.beginPath(); ctx.arc(X, Y, .8, 0, 7); ctx.fill();
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
      mapCtx.fillStyle = '#111411';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.save();
      mapCtx.setTransform(scale, 0, 0, scale, ox, oy);
      mapCtx.lineJoin = 'round';
      mapCtx.lineCap = 'round';
      mapCtx.beginPath();
      TR.cps.forEach((point, index) => index ? mapCtx.lineTo(point[0], point[1]) : mapCtx.moveTo(point[0], point[1]));
      mapCtx.closePath();
      mapCtx.strokeStyle = '#625a49';
      mapCtx.lineWidth = TR.meta.opts.HW * 2 + 14;
      mapCtx.stroke();
      mapCtx.strokeStyle = '#292a25';
      mapCtx.lineWidth = TR.meta.opts.HW * 2;
      mapCtx.stroke();
      mapCtx.setLineDash([5, 8]);
      mapCtx.strokeStyle = 'rgba(207,187,142,.65)';
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke();
      mapCtx.setLineDash([]);

      const target = TR.cps[cp % TR.cps.length];
      mapCtx.fillStyle = '#d86a58';
      mapCtx.beginPath(); mapCtx.arc(target[0], target[1], 9, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#efb35c';
      mapCtx.beginPath(); mapCtx.arc(car.x, car.y, 8, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.strokeStyle = '#e6d9b5';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(car.x, car.y, 12, 0, Math.PI * 2); mapCtx.stroke();
      mapCtx.restore();
      return;
    }
    mapCtx.clearRect(0, 0, minimap.width, minimap.height);
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
    else drawFreeGround(v);

    // tyre marks (one stroke, so overlaps never get darker)
    if (skn) {
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.05; ctx.strokeStyle = 'rgba(6,8,12,.36)';
      ctx.beginPath();
      const handMarks = [];
      for (let i = 0; i < skn; i++) {
        const o = i * 5, x0 = sk[o], y0 = sk[o + 1];
        if (x0 < v.x0 - 4 || x0 > v.x1 + 4 || y0 < v.y0 - 4 || y0 > v.y1 + 4) continue;
        if (sk[o + 4]) handMarks.push(o);
        else { ctx.moveTo(x0, y0); ctx.lineTo(sk[o + 2], sk[o + 3]); }
      }
      ctx.stroke();
      if (handMarks.length) {
        ctx.beginPath();
        for (const o of handMarks) { ctx.moveTo(sk[o], sk[o + 1]); ctx.lineTo(sk[o + 2], sk[o + 3]); }
        ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(142,72,48,.42)'; ctx.stroke();
      }
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

    const sp = car.speed;
    const steerRad = Math.max(-.6, Math.min(.6, steerVis * .68 / (1 + sp / 55) * 1.5));
    drawCar(ctx, SPEC, car.x, car.y, car.a, {
      steer: steerRad, brake: brakeVis, lights: true, custom: garageSetup(CARS[carIdx].id)
    });

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
      el.tl.innerHTML = `<span class="lbl">${raceChallenge ? 'FRIEND TIME ATTACK · ' : ''}${TR.meta.name} · LAP ${lap}/${LAPS}</span><span class="val big">${fmt(t)}</span>`;
      el.tr.innerHTML = `<span class="lbl">BEST</span><span class="val">${b.total ? fmt(b.total) : '--'}</span><span class="lbl">FASTEST LAP</span><span class="val">${b.lap ? fmt(b.lap) : '--'}</span>`;
    } else {
      el.tl.innerHTML = `<span class="lbl">FREEPLAY</span><span class="val big">${CARS[carIdx].name}</span>`;
      el.tr.innerHTML = '<span class="lbl">R / TRIANGLE RESET</span>';
    }
    el.bl.innerHTML = `<span class="val big">${Math.round(car.speed * 1.4)}<span class="unit">KM/H</span></span>`;
    el.br.innerHTML = `<span class="lbl">DRIFT</span><span class="val big hl">${Math.floor(drift)}${mult > 1.15 ? `<span class="mult">×${mult.toFixed(1)}</span>` : ''}</span>`;

    msgT -= dt;
    el.msg.style.display = msgT > 0 ? 'block' : 'none';
  }

  let lastSig = '';
  function paintPreview() {
    const previewIdx = menuMode === 'cars' ? Math.min(sel, CARS.length - 1) : carIdx;
    const previewCar = CARS[previewIdx];
    const setup = garageSetup(previewCar.id);
    preview.style.display = 'block';
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, preview.width, preview.height);
    const a = performance.now() / 3400;
    pctx.setTransform(23, 0, 0, 23, preview.width / 2, preview.height / 2);
    drawCar(pctx, previewCar.spec, 0, 0, a, { steer: 0, shadow: true, lights: true, custom: setup });
    $('garage-car').textContent = previewCar.name;
    $('garage-stats').textContent = menuMode === 'garage' || menuMode === 'garage-option'
      ? `${GARAGE_OPTIONS.color.find(option => option.id === setup.colorId).name} · ${GARAGE_OPTIONS.paint.find(option => option.id === setup.paint).name} · ${GARAGE_OPTIONS.wing.find(option => option.id === setup.wing).name} · ${GARAGE_OPTIONS.wheels.find(option => option.id === setup.wheels).name} (${setup.wheelStats})`
      : previewCar.stats;
    $('garage-section-title').textContent = menuMode === 'garage' || menuMode === 'garage-option' || (menuMode === 'cars' && carMenuReturn === 'garage')
      ? 'GARAGE BAY' : "TONIGHT'S MACHINE";
  }

  function paint() {
    const items = getMenuItems();
    const sig = menuMode + '|' + sel + '|' + carIdx + '|' + trackId + '|' + leaderboardTrack;
    if (sig !== lastSig) {
      lastSig = sig;
      const showingLeaderboard = menuMode === 'leaderboard';
      menuItemsEl.hidden = showingLeaderboard;
      leaderboardView.hidden = !showingLeaderboard;
      if (showingLeaderboard) {
        menuItemsEl.replaceChildren();
        const request = ++leaderboardRequest;
        leaderboardTabs.replaceChildren();
        for (const track of TRACKS) {
          const tab = document.createElement('button');
          tab.type = 'button';
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', String(track.id === leaderboardTrack));
          tab.tabIndex = track.id === leaderboardTrack ? 0 : -1;
          tab.className = `leaderboard-tab${track.id === leaderboardTrack ? ' selected' : ''}`;
          tab.textContent = track.name;
          tab.addEventListener('click', () => {
            SFX.unlock(); SFX.select();
            leaderboardTrack = track.id;
            lastSig = '';
            paint();
          });
          tab.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const current = TRACKS.findIndex(item => item.id === leaderboardTrack);
            leaderboardTrack = TRACKS[(current + direction + TRACKS.length) % TRACKS.length].id;
            lastSig = '';
            paint();
            leaderboardTabs.querySelector('[aria-selected="true"]')?.focus();
          });
          leaderboardTabs.append(tab);
        }
        leaderboardRows.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'leaderboard-message';
        loading.textContent = 'LOADING GLOBAL TIMES…';
        leaderboardRows.append(loading);
        Profile.getLeaderboard(leaderboardTrack).then(entries => {
          if (request !== leaderboardRequest || menuMode !== 'leaderboard') return;
          leaderboardRows.replaceChildren();
          if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'leaderboard-message';
            empty.textContent = 'NO TIMES POSTED YET. SIGN IN AND SET THE FIRST RECORD!';
            leaderboardRows.append(empty);
            return;
          }
          const carNames = Object.fromEntries(CARS.map(car => [car.id, car.name]));
          const avatarNames = { skyline: 'R34', supra: 'A80', porsche: '911', rx7: 'FD', silvia: 'S15', ae86: '86' };
          for (const [index, entry] of entries.entries()) {
            const row = document.createElement('article');
            row.className = 'leaderboard-row';
            const rank = document.createElement('span');
            rank.className = 'leaderboard-rank';
            rank.textContent = String(index + 1).padStart(2, '0');
            const avatar = document.createElement('span');
            avatar.className = 'profile-avatar leaderboard-avatar';
            avatar.textContent = avatarNames[entry.avatar] || 'ND';
            const identity = document.createElement('span');
            identity.className = 'leaderboard-identity';
            const name = document.createElement('strong');
            name.textContent = entry.display_name;
            identity.append(name);
            const vehicle = document.createElement('span');
            vehicle.className = 'leaderboard-vehicle';
            const vehicleName = carNames[entry.car_id] || 'CAR NOT RECORDED';
            const setup = entry.car_setup;
            const build = setup
              ? `${setup.color} · ${setup.paint} · ${setup.wing} · ${setup.wheels} WHEELS`
              : 'BUILD NOT RECORDED';
            vehicle.textContent = `${vehicleName} · ${build}`;
            const time = document.createElement('strong');
            time.className = 'leaderboard-time';
            time.textContent = fmt(entry.time_ms / 1000);
            row.append(rank, avatar, identity, vehicle, time);
            leaderboardRows.append(row);
          }
        }).catch(error => {
          if (request !== leaderboardRequest || menuMode !== 'leaderboard') return;
          const failed = document.createElement('p');
          failed.className = 'leaderboard-message error';
          failed.textContent = `LEADERBOARD UNAVAILABLE: ${error.message}`;
          leaderboardRows.replaceChildren(failed);
        });
      } else {
        leaderboardRequest++;
        menuItemsEl.innerHTML = items.map((it, i) => `<div class="item${i === sel ? ' sel' : ''}">${it.label}</div>`).join('');
        menuItemsEl.querySelectorAll('.item').forEach((e, i) => {
          e.onclick = () => { SFX.unlock(); SFX.select(); items[i].action(); lastSig = ''; };
          e.onmouseenter = () => { if (sel !== i) { SFX.move(); sel = i; } };
        });
      }

      const b = getBest(trackId);
      if (showingLeaderboard) {
        $('best').textContent = '';
        $('friend-times').replaceChildren();
      } else if (menuMode === 'main') {
        const raceRecord = b.total ? 'BEST ' + TRACKS.find(t => t.id === trackId).name + ' ' + fmt(b.total) : '';
        $('best').textContent = raceRecord;
      } else if (menuMode === 'tracks' || menuMode === 'friend-tracks') {
        const tr = TRACKS[Math.min(sel, TRACKS.length - 1)];
        const bb = tr ? getBest(tr.id) : {};
        $('best').textContent = menuMode === 'friend-tracks'
          ? 'FRIEND TIME ATTACK · BEST TIMES'
          : bb.total ? 'RECORD ' + fmt(bb.total) : (tr ? 'NO RECORD YET' : '');
        const request = ++friendTimesRequest;
        const timesElement = $('friend-times');
        timesElement.replaceChildren();
        if (menuMode === 'friend-tracks' && tr) {
          const loading = document.createElement('p');
          loading.className = 'friend-empty'; loading.textContent = 'LOADING FRIEND TIMES…';
          timesElement.append(loading);
          Profile.getFriendTimes(tr.id).then(times => {
            if (request !== friendTimesRequest || menuMode !== 'friend-tracks') return;
            timesElement.replaceChildren();
            if (!times?.length) {
              const empty = document.createElement('p');
              empty.className = 'friend-empty'; empty.textContent = 'NO TIMES POSTED YET. SET THE FIRST RECORD!';
              timesElement.append(empty);
              return;
            }
            for (const [index, time] of times.entries()) {
              const row = document.createElement('div');
              row.className = 'friend-time-row';
              const name = document.createElement('span');
              name.textContent = `${index + 1}. ${time.is_self ? 'YOU' : time.display_name}`;
              const result = document.createElement('strong');
              result.textContent = fmt(time.time_ms / 1000);
              row.append(name, result);
              timesElement.append(row);
            }
          }).catch(error => {
            if (request !== friendTimesRequest || menuMode !== 'friend-tracks') return;
            const failed = document.createElement('p');
            failed.className = 'friend-empty'; failed.textContent = `FRIEND TIMES UNAVAILABLE: ${error.message}`;
            timesElement.replaceChildren(failed);
          });
        }
      } else if (menuMode === 'cars' && sel < CARS.length) {
        $('best').textContent = CARS[sel].stats;
      } else if (menuMode === 'garage') {
        $('best').textContent = 'SETUP SAVES PER CAR';
      } else {
        $('best').textContent = '';
        $('friend-times').replaceChildren();
      }
      if (menuMode !== 'friend-tracks' && menuMode !== 'tracks') {
        friendTimesRequest++;
        $('friend-times').replaceChildren();
      }
    }
    $('menu-section-title').textContent =
      menuMode === 'settings' ? 'SETTINGS'
        : menuMode === 'garage' ? 'CUSTOMIZE YOUR CAR'
          : menuMode === 'friend-tracks' ? 'FRIEND TIME ATTACK'
            : menuMode === 'leaderboard' ? 'GLOBAL LEADERBOARD'
            : menuMode === 'garage-option' ? `CHOOSE ${garageCategory === 'color' ? 'BODY COLOR' : garageCategory === 'paint' ? 'PAINT STYLE' : garageCategory.toUpperCase()}`
            : menuMode === 'cars' ? 'SELECT YOUR CAR' : 'SELECT YOUR RUN';
    $('menu').classList.toggle('sub', menuMode !== 'main');
    $('menu').classList.toggle('cars', menuMode === 'cars');
    $('menu').classList.toggle('settings', menuMode === 'settings');
    $('menu').classList.toggle('garage', menuMode === 'garage' || menuMode === 'garage-option' || (menuMode === 'cars' && carMenuReturn === 'garage'));
    $('menu').classList.toggle('garage-option', menuMode === 'garage-option');
    $('menu').classList.toggle('leaderboard', menuMode === 'leaderboard');
    paintPreview();
    $('pad').textContent = Input.connected() ? 'CONTROLLER CONNECTED' : 'PRESS A BUTTON TO CONNECT A CONTROLLER';
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const inp = Input.poll(dt), q = inp.p;

    if (state === 'menu') {
      const items = getMenuItems();
      if (!Profile.dialogOpen()) {
        if (q.up) { SFX.move(); sel = (sel - 1 + items.length) % items.length; }
        if (q.down) { SFX.move(); sel = (sel + 1) % items.length; }
        if (q.ok) { SFX.unlock(); SFX.select(); items[sel].action(); lastSig = ''; }
        if (q.menu && menuMode !== 'main') { SFX.move(); backToParentMenu(); lastSig = ''; }
      }
      paint();
    } else if (q.menu) {
      recordProfileRun(Math.floor(drift), mode === 'free');
      hideRaceResult();
      state = 'menu'; menuMode = 'main'; sel = 0; stage.className = 'menu'; lastSig = '';
    } else if (q.reset || (state === 'done' && q.ok)) {
      recordProfileRun(Math.floor(drift), mode === 'free');
      start(mode);
    }

    if (state !== 'menu') {
      if (state === 'count') {
        count -= dt;
        const tick = Math.ceil(count);
        if (tick > 0 && tick !== lastCountdown) { SFX.tick(); lastCountdown = tick; }
        if (count <= 0) { state = 'play'; t = lapT = 0; say('GO!', .9); SFX.go(); } else say(tick, .2);
      }
      acc += dt;
      while (acc >= H) { sim(inp); acc -= H; }
      if (state === 'play' && !runRecorded) {
        profileSyncElapsed += dt;
        if (profileSyncElapsed >= 15) {
          profileSyncElapsed %= 15;
          Profile.recordRun(mode, Math.floor(drift), t, false, runId);
        }
      }

      if (inp.hand && !wasHandbrake) SFX.handbrake();
      wasHandbrake = !!inp.hand;
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
    SFX.update({
      speed: car.speed,
      throttle: state === 'play' ? inp.throttle : 0,
      slip: car.slip,
      hand: state === 'play' ? inp.hand : 0,
      active: state === 'play'
    });
    requestAnimationFrame(frame);
  }
  window.focus();
  $('race-result-retry').addEventListener('click', () => {
    SFX.select();
    start('race', raceChallenge);
  });
  $('race-result-menu').addEventListener('click', () => {
    SFX.select();
    hideRaceResult();
    state = 'menu'; menuMode = 'main'; sel = 0; stage.className = 'menu'; lastSig = '';
  });
  $('leaderboard-back').addEventListener('click', () => {
    SFX.select();
    menuMode = 'main'; sel = 0; lastSig = '';
    paint();
  });
  Profile.setGameSaveHandler({
    getLocalSave: (userId, hasRemote, accountSave) => accountSave || ({
      data: getGameSaveData(),
      updatedAt: hasRemote ? 0 : gameSaveUpdatedAt
    }),
    applyRemoteSave: applyRemoteGameSave,
    setSaveTimestamp: setGameSaveTimestamp
  });
  addEventListener('pointerdown', () => { window.focus(); SFX.unlock(); });
  addEventListener('keydown', () => SFX.unlock(), { once: true });
  paint();
  requestAnimationFrame(frame);
})();
