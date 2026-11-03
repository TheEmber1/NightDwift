// Keyboard + gamepad (PS4 / standard mapping) input
const Input = (() => {
  const K = {}, L = {};
  let kb = 0, gp = null, rt = 0;
  // some embedded previews leave e.code empty, so fall back to e.key
  const code = e => e.code || (e.key === ' ' ? 'Space' : e.key && e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key);
  addEventListener('keydown', e => { const c = code(e); K[c] = 1; if (c === 'Space' || (c && c.startsWith('Arrow'))) e.preventDefault(); });
  addEventListener('keyup', e => { K[code(e)] = 0; });
  addEventListener('blur', () => { for (const k in K) K[k] = 0; });
  const dz = v => Math.abs(v) < .14 ? 0 : Math.sign(v) * (Math.abs(v) - .14) / .86;
  const any = (...c) => c.some(k => K[k]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function poll(dt) {
    gp = null;
    for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) if (g && g.connected) { gp = g; break; }
    const b = i => gp && gp.buttons[i] ? gp.buttons[i].value : 0;

    // keyboard steering ramps so taps feel gentle and holds feel full (snappier for precision)
    const tgt = (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0);
    kb += (tgt - kb) * Math.min(1, dt * (tgt ? 11 : 16));
    let steer = kb;
    if (gp) { const a = clamp(dz(gp.axes[0]) + b(15) - b(14), -1, 1); if (a) steer = a; }

    const ly = gp ? gp.axes[1] : 0;
    const raw = {
      up: any('ArrowUp', 'KeyW') || b(12) > .5 || ly < -.6,
      down: any('ArrowDown', 'KeyS') || b(13) > .5 || ly > .6,
      ok: any('Enter', 'NumpadEnter', 'Space') || b(0) > .5,
      reset: !!K.KeyR || b(3) > .5,
      menu: any('Escape', 'KeyP') || b(9) > .5
    };
    const p = {};
    for (const k in raw) { p[k] = !!raw[k] && !L[k]; L[k] = !!raw[k]; }

    return {
      steer,
      throttle: Math.max(any('KeyW', 'ArrowUp') ? 1 : 0, b(7)),   // R2
      brake: Math.max(any('KeyS', 'ArrowDown') ? 1 : 0, b(6)),    // L2
      hand: (K.Space || b(2) > .5 || b(5) > .5) ? 1 : 0,          // Square / R1
      p
    };
  }

  function rumble(strong, weak) {
    if (!gp || !gp.vibrationActuator) return;
    const t = performance.now();
    if (t - rt < 90) return;
    rt = t;
    try { gp.vibrationActuator.playEffect('dual-rumble', { duration: 100, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
  }

  return { poll, rumble, connected: () => !!gp };
})();
