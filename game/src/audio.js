// Neon Tides — all sound is synthesised with WebAudio: no audio files,
// no network. Engine hum, two-tone siren, gunshot noise, pickup blip and
// a slow chord loop. engineGain / sirenGain are public so the game can
// silence them the moment it pauses (fix #14), and the engine pitch glides
// with setTargetAtTime instead of jumping (fix #23).

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineGain = null;
    this.sirenGain = null;
    this._engineOsc = null;
    this._sirenOsc = null;
    this._sirenT = 0;
    this._musicT = 0;
    this._chord = 0;
    this._started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine: low sawtooth through a quiet gain.
      this._engineOsc = this.ctx.createOscillator();
      this._engineOsc.type = 'sawtooth';
      this._engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      this._engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this._engineOsc.start();
      // Siren: sine that alternates two tones.
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenOsc.type = 'sine';
      this._sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this._sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this._sirenOsc.start();
      this._started = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain.value = m ? 0 : 1;
  }

  _blip(freq, dur, type = 'sine', vol = 0.16) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    } catch (e) {}
  }

  pickup() {
    this._blip(880, 0.12, 'sine', 0.2);
    setTimeout(() => this._blip(1318, 0.14, 'sine', 0.18), 90);
  }

  crash(heavy) {
    this._blip(heavy ? 70 : 110, 0.25, 'square', 0.22);
  }

  // Called every frame while playing: engine pitch follows speed, siren
  // wails while wanted, chords drift underneath.
  update(dt, speed, wanted) {
    if (!this.ctx || !this._started || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) {
      const target = speed > 5 ? 0.028 + Math.min(0.07, speed * 0.00016) : 0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.1);
      // Fix #23: glide the pitch instead of snapping it each frame.
      this._engineOsc.frequency.setTargetAtTime(52 + speed * 0.22, t, 0.08);
    }
    if (this.sirenGain) {
      const target = wanted > 0 ? 0.045 : 0;
      this.sirenGain.gain.setTargetAtTime(target, t, 0.15);
      if (wanted > 0) {
        this._sirenT += dt;
        const tone = Math.floor(this._sirenT / 0.42) % 2 === 0 ? 720 : 960;
        this._sirenOsc.frequency.setTargetAtTime(tone, t, 0.05);
      }
    }
    // Slow chord loop: one soft chord every ~2.4s.
    this._musicT += dt;
    if (this._musicT > 2.4) {
      this._musicT = 0;
      const roots = [220, 174.6, 196, 146.8];
      const root = roots[this._chord % roots.length];
      this._chord++;
      for (const mult of [1, 1.25, 1.5]) this._blip(root * mult, 1.8, 'triangle', 0.045);
    }
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.02);
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, t, 0.02);
  }
}
