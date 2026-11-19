// All sound is synthesized with WebAudio — no audio files anywhere.
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.master = null; this.musicTimer = 0; this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; this.sirenGain = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    // Engine hum: a sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master); this.engineOsc.start();
    // Siren voice, silent until police are near.
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
  }
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, vol = 0.25, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  gunshot() { this.noise(0.12, 0.5, 2600); this.tone(150, 0.1, 'square', 0.3, -90); }
  punch() { this.noise(0.06, 0.3, 700); }
  crash(big = false) { this.noise(big ? 0.35 : 0.18, big ? 0.55 : 0.35, 900); this.tone(70, 0.2, 'sine', 0.4, -30); }
  skid() { this.noise(0.09, 0.10, 3200); }
  pickup() { this.tone(880, 0.09, 'sine', 0.25); setTimeout(() => this.tone(1320, 0.12, 'sine', 0.25), 70); }
  jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.3), i * 110)); }
  fail() { this.tone(220, 0.3, 'sawtooth', 0.25, -120); }
  update(dt, speedNorm, inCar, sirenNear) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 55 + speedNorm * 160;
      this.engineGain.gain.value = this.muted ? 0 : (inCar ? 0.05 + speedNorm * 0.06 : 0);
    }
    if (this.sirenOsc) {
      // Two-tone siren.
      this.sirenOsc.frequency.value = (Math.floor(t * 1.6) % 2 === 0) ? 720 : 960;
      this.sirenGain.gain.value = this.muted ? 0 : (sirenNear ? 0.045 : 0);
    }
    // Soft synthwave pad loop: slow chord swells.
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && !this.muted) {
      this.musicTimer = 4;
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
      const chord = chords[Math.floor(Math.random() * chords.length)];
      for (const f of chord) this.tone(f, 3.6, 'sine', 0.05);
    }
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
}
