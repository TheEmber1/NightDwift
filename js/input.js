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

    const lx = gp ? gp.axes[0] : 0;
    const ly = gp ? gp.axes[1] : 0;
    const raw = {
      up: any('ArrowUp', 'KeyW') || b(12) > .5 || ly < -.6,
      down: any('ArrowDown', 'KeyS') || b(13) > .5 || ly > .6,
      left: any('ArrowLeft') || b(14) > .5 || lx < -.6,
      right: any('ArrowRight') || b(15) > .5 || lx > .6,
      ok: any('Enter', 'NumpadEnter', 'Space') || b(0) > .5,
      reset: !!K.KeyR || b(3) > .5,
      menu: any('Escape', 'KeyP') || b(9) > .5 || b(1) > .5
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

  function navigate(root, pressed) {
    const controls = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
      .filter(element => element.getClientRects().length && !element.closest('[hidden]'));
    if (!controls.length) return;

    const current = controls.indexOf(document.activeElement);
    if (pressed.ok) {
      const target = controls[current >= 0 ? current : 0];
      target.focus();
      if (target instanceof HTMLButtonElement) target.click();
      return;
    }

    const direction = pressed.up ? 'up' : pressed.down ? 'down'
      : pressed.left ? 'left' : pressed.right ? 'right' : null;
    if (!direction) return;
    if (current < 0) {
      controls[0].focus();
      return;
    }

    const origin = controls[current].getBoundingClientRect();
    const ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2;
    const candidates = controls.map((element, index) => {
      if (index === current) return null;
      const rect = element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - ox;
      const dy = rect.top + rect.height / 2 - oy;
      const primary = direction === 'up' ? -dy : direction === 'down' ? dy
        : direction === 'left' ? -dx : dx;
      if (primary <= 0) return null;
      const secondary = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
      return { element, index, primary, secondary, score: primary + secondary * 2.5 };
    }).filter(Boolean);

    if (candidates.length) {
      candidates.sort((a, b) => a.score - b.score);
      const target = candidates[0].element;
      target.focus();
      if (target.getAttribute('role') === 'tab') target.click();
      return;
    }

    const wrap = controls.map(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const primary = direction === 'up' ? y : direction === 'down' ? -y
        : direction === 'left' ? x : -x;
      const secondary = direction === 'up' || direction === 'down' ? Math.abs(x - ox) : Math.abs(y - oy);
      return { element, score: primary + secondary * 2.5 };
    }).sort((a, b) => a.score - b.score)[0].element;
    wrap.focus();
    if (wrap.getAttribute('role') === 'tab') wrap.click();
  }

  function rumble(strong, weak) {
    if (!gp || !gp.vibrationActuator) return;
    const t = performance.now();
    if (t - rt < 90) return;
    rt = t;
    try { gp.vibrationActuator.playEffect('dual-rumble', { duration: 100, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
  }

  return { poll, rumble, navigate, connected: () => !!gp };
})();
