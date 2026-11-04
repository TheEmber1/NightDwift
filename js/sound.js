const SFX = (() => {
  let audio, master, engine, engineGain, squeal, squealGain, squealFilter;
  let enabled = true, lastImpact = 0;

  function unlock() {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio = new Audio();
      master = audio.createGain();
      master.gain.value = enabled ? 0.32 : 0;
      master.connect(audio.destination);

      engine = audio.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 48;
      engineGain = audio.createGain();
      engineGain.gain.value = 0;
      engine.connect(engineGain).connect(master);
      engine.start();

      const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      squeal = audio.createBufferSource();
      squeal.buffer = buffer;
      squeal.loop = true;
      squealFilter = audio.createBiquadFilter();
      squealFilter.type = 'bandpass';
      squealFilter.frequency.value = 1100;
      squealFilter.Q.value = 1.2;
      squealGain = audio.createGain();
      squealGain.gain.value = 0;
      squeal.connect(squealFilter).connect(squealGain).connect(master);
      squeal.start();
    }
    return audio.state === 'suspended' ? audio.resume().catch(error => {
      console.error('Could not resume game audio:', error);
    }) : Promise.resolve();
  }

  function tone(from, to, duration, type = 'square', volume = 0.12) {
    if (!enabled) return;
    const ready = unlock();
    if (!audio) return;
    if (audio.state !== 'running') {
      ready.then(() => { if (audio.state === 'running' && enabled) tone(from, to, duration, type, volume); });
      return;
    }
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  function update({ speed, throttle, slip, hand, active }) {
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    engine.frequency.setTargetAtTime(48 + Math.min(300, speed * 1.45) + throttle * 38, now, 0.06);
    engineGain.gain.setTargetAtTime(active ? 0.045 + throttle * 0.025 : 0, now, 0.08);
    squealFilter.frequency.setTargetAtTime(650 + Math.min(2400, slip * 24), now, 0.05);
    const intensity = active && speed > 30 && slip > 22 ? Math.min(0.13, (slip - 22) * 0.0014) : 0;
    squealGain.gain.setTargetAtTime(hand ? intensity * 1.35 : intensity, now, 0.07);
  }

  return {
    unlock,
    update,
    setEnabled(value) {
      enabled = value;
      if (master && audio) master.gain.setTargetAtTime(enabled ? 0.32 : 0, audio.currentTime, 0.02);
      return enabled;
    },
    get enabled() { return enabled; },
    move() { tone(420, 300, 0.055, 'square', 0.045); },
    select() { tone(560, 840, 0.09, 'square', 0.075); },
    handbrake() { tone(190, 65, 0.13, 'sawtooth', 0.08); },
    tick() { tone(520, 390, 0.1, 'square', 0.09); },
    go() { tone(360, 920, 0.22, 'square', 0.11); },
    lap() { tone(620, 1040, 0.25, 'triangle', 0.09); },
    impact() {
      const now = performance.now();
      if (now - lastImpact < 180) return;
      lastImpact = now;
      tone(110, 38, 0.16, 'sawtooth', 0.13);
    },
    bust() { tone(260, 55, 0.55, 'sawtooth', 0.12); }
  };
})();
