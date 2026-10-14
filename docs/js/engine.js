/* SONARA · Week 4 — one fixed, original song ("Midnight Bloom") built from five stems:
   beat, bass, percussion, strings, voice. Everything is synthesized live with the Web Audio API.
   A new stem always enters on the next beat.
   Sequence prototype: taken from the shared study engine; the only change is that the song
   wraps back to bar 1 until every layer is in (see tick() and queue()). */
(function () {
  const BPM = 116, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;
  const SONG_BARS = 40, END_STEP = SONG_BARS * 16, DURATION = SONG_BARS * BAR;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NAMES = ['keys', 'beat', 'bass', 'perc', 'strings', 'voice'];

  // Two 8-bar sections in D minor. Form: A A B A B, then a final chord.
  const SEC = {
    A: {
      ch: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67], [62, 65, 69], [58, 62, 65], [58, 62, 67], [61, 64, 69]],
      root: [38, 34, 41, 36, 38, 34, 31, 33],
      mel: [
        [[0, 69, 6], [6, 72, 2], [8, 69, 4], [12, 67, 4]], [[0, 65, 8], [10, 62, 2], [12, 65, 4]],
        [[0, 69, 6], [6, 72, 2], [8, 74, 4], [12, 72, 4]], [[0, 67, 12], [12, 64, 4]],
        [[0, 69, 6], [6, 72, 2], [8, 69, 4], [12, 67, 4]], [[0, 65, 6], [6, 67, 2], [8, 69, 8]],
        [[0, 70, 6], [6, 69, 2], [8, 67, 4], [12, 65, 4]], [[0, 64, 8], [8, 61, 4], [12, 64, 4]],
      ],
    },
    B: {
      ch: [[58, 62, 65], [60, 64, 67], [60, 64, 69], [62, 65, 69], [58, 62, 67], [60, 64, 67], [60, 65, 69], [61, 64, 69]],
      root: [34, 36, 33, 38, 31, 36, 41, 33],
      mel: [
        [[0, 70, 4], [4, 69, 4], [8, 65, 8]], [[0, 67, 6], [6, 69, 2], [8, 72, 8]],
        [[0, 72, 6], [6, 69, 2], [8, 64, 8]], [[0, 65, 4], [4, 69, 4], [8, 74, 8]],
        [[0, 74, 6], [6, 72, 2], [8, 70, 4], [12, 69, 4]], [[0, 67, 8], [8, 72, 8]],
        [[0, 69, 4], [4, 72, 4], [8, 77, 8]], [[0, 76, 8], [8, 73, 4], [12, 76, 4]],
      ],
    },
  };
  const FORM = ['A', 'A', 'B', 'A', 'B'];
  const VOWELS = { ah: [800, 1150, 2900], oh: [450, 800, 2830], oo: [350, 700, 2500], eh: [480, 1700, 2600] };
  const LYRIC = ['ah', 'oh', 'ah', 'oo', 'ah', 'eh', 'oh', 'ah'];

  class Song {
    constructor() {
      this.ctx = null; this.t0 = null; this.next = 0; this.timer = null;
      this.layers = NAMES.map((name) => ({ name, state: 'off', enterStep: Infinity, enterTime: Infinity }));
      this.events = []; this.evShift = 0; this.listeners = new Set(); this.prevLead = null; this.paused = false; this.finished = false;
    }
    on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
    emit() { this.listeners.forEach((f) => f()); }
    layer(n) { return this.layers[NAMES.indexOf(n)]; }
    get started() { return this.t0 != null; }
    now() { return this.ctx ? this.ctx.currentTime : 0; }
    beatPhase() { return this.started ? ((((this.now() - this.t0) / BEAT) % 1) + 1) % 1 : 0; }
    section() { if (!this.started) return 'A'; const bar = Math.floor((this.now() - this.t0) / BAR); return bar >= SONG_BARS ? 'End' : FORM[Math.floor(Math.max(0, bar) / 8)]; }

    init() {
      if (this.ctx) return;
      const c = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noise = nb;
      this.mix = c.createGain();
      this.wake = c.createBiquadFilter(); this.wake.type = 'lowpass'; this.wake.frequency.value = 20000; this.wake.Q.value = 0.7;
      this.glue = c.createDynamicsCompressor(); this.glue.threshold.value = -18; this.glue.ratio.value = 3; this.glue.attack.value = 0.01; this.glue.release.value = 0.15;
      this.master = c.createGain(); this.master.gain.value = 0.75;
      this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -6; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15;
      this.out = c.createAnalyser(); this.out.fftSize = 512;
      this.mix.connect(this.wake); this.wake.connect(this.glue); this.glue.connect(this.master);
      this.master.connect(this.limiter); this.limiter.connect(this.out); this.out.connect(c.destination);
      const ir = c.createBuffer(2, c.sampleRate * 2.8, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
      this.rev = c.createConvolver(); this.rev.buffer = ir;
      const revOut = c.createGain(); revOut.gain.value = 0.5; this.rev.connect(revOut); revOut.connect(this.mix);
      this.del = c.createDelay(2); this.del.delayTime.value = STEP * 3;
      const fb = c.createGain(); fb.gain.value = 0.36; const dlp = c.createBiquadFilter(); dlp.frequency.value = 3000;
      this.del.connect(dlp); dlp.connect(fb); fb.connect(this.del);
      const delOut = c.createGain(); delOut.gain.value = 0.45; dlp.connect(delOut); delOut.connect(this.mix); delOut.connect(this.rev);
      this.bus = {}; this.an = {};
      const trim = { keys: 2.2, beat: 0.75, bass: 0.4, perc: 0.9, strings: 1.3, voice: 1.4 };
      NAMES.forEach((n) => {
        const g = c.createGain(); g.gain.value = trim[n];
        const a = c.createAnalyser(); a.fftSize = 512; a.smoothingTimeConstant = 0.7;
        const p = c.createStereoPanner(); p.pan.value = 0;
        g.connect(p); p.connect(this.mix); g.connect(a);
        this.bus[n] = g; this.an[n] = a;
      });
      const bank = (vowel, gains) => {
        const input = c.createGain(), fs = [];
        VOWELS[vowel].forEach((f, k) => {
          const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = [5, 7, 9][k];
          const g = c.createGain(); g.gain.value = gains[k];
          input.connect(bp); bp.connect(g); g.connect(this.bus.voice);
          fs.push(bp);
        });
        return { input, fs };
      };
      this.choir = bank('ah', [2.2, 1.3, 0.6]);
      this.lead = bank('ah', [3.0, 1.9, 0.9]);
      const send = (node, rev, del) => {
        if (rev) { const g = c.createGain(); g.gain.value = rev; node.connect(g); g.connect(this.rev); }
        if (del) { const g = c.createGain(); g.gain.value = del; node.connect(g); g.connect(this.del); }
      };
      send(this.choir.input, 0.12, 0); send(this.lead.input, 0.1, 0.06);
      // strings section: one shared warm low-pass, a little room
      this.strIn = c.createGain();
      const sl = c.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 2400; sl.Q.value = 0.5;
      this.strIn.connect(sl); sl.connect(this.bus.strings); send(sl, 0.35, 0);
      this.vib = c.createOscillator(); this.vib.frequency.value = 5.4; this.vib.start();
    }

    /* ---------- instruments ---------- */
    env(g, t, vol, a, d, hold = 0) {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
      if (hold) { g.gain.setValueAtTime(vol, t + a + hold); g.gain.linearRampToValueAtTime(0.0001, t + a + hold + d); }
      else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    osc(type, f, t, end, dest, detune = 0) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
      o.connect(dest); o.start(t); o.stop(end); return o;
    }
    noiseHit(t, dest, { type = 'highpass', f = 8000, q = 0.8, vol = 0.1, d = 0.05 }) {
      const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + d + 0.03);
    }
    drum(t, f0, f1, d, vol, dest) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.05);
    }
    kick(t, vol) { this.drum(t, 155, 48, 0.42, vol, this.bus.beat); this.events.push({ k: 'kick', t, v: vol }); }
    snare(t) {
      const c = this.ctx, g = c.createGain();
      this.noiseHit(t, this.bus.beat, { type: 'bandpass', f: 1700, q: 0.9, vol: 0.22, d: 0.18 });
      this.osc('triangle', 190, t, t + 0.12, g); this.env(g, t, 0.16, 0.002, 0.1); g.connect(this.bus.beat);
      const s = c.createGain(); s.gain.value = 0.12; g.connect(s); s.connect(this.rev);
    }
    pluck(t, m, vol) {
      const c = this.ctx, g = c.createGain();
      this.osc('triangle', mtof(m), t, t + 0.6, g); this.osc('sine', mtof(m + 12), t, t + 0.6, g);
      this.env(g, t, vol, 0.003, 0.45); g.connect(this.bus.keys);
      const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.del);
      this.events.push({ k: 'keys', t, m });
    }
    keyPad(t, notes, len) { // soft electric-piano chord under the arpeggio
      const c = this.ctx;
      notes.forEach((m) => { const g = c.createGain(); this.osc('sine', mtof(m), t, t + len + 0.8, g); this.osc('triangle', mtof(m), t, t + len + 0.8, g, 5); this.env(g, t, 0.022, 0.25, 0.6, Math.max(0.05, len - 0.25)); g.connect(this.bus.keys); });
    }
    bassNote(t, m, len) {
      const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(), sub = c.createGain();
      f.type = 'lowpass'; f.Q.value = 7; f.frequency.setValueAtTime(1900, t); f.frequency.exponentialRampToValueAtTime(240, t + 0.18);
      const end = t + len + 0.1;
      this.osc('sawtooth', mtof(m), t, end, f); this.osc('sawtooth', mtof(m), t, end, f, 9);
      f.connect(g); this.env(g, t, 0.16, 0.004, 0.08, Math.max(0.02, len - 0.05));
      this.osc('sine', mtof(m), t, end, sub); this.env(sub, t, 0.42, 0.006, 0.08, Math.max(0.02, len - 0.05));
      g.connect(this.bus.bass); sub.connect(this.bus.bass);
      this.events.push({ k: 'bass', t, m, len });
    }
    // percussion: hand drums, low toms, shaker and a wood click
    conga(t, high, vol) { this.drum(t, high ? 340 : 230, high ? 300 : 190, 0.22, vol, this.bus.perc); this.noiseHit(t, this.bus.perc, { type: 'bandpass', f: high ? 3200 : 2200, q: 2, vol: vol * 0.25, d: 0.02 }); this.events.push({ k: 'perc', t, s: 'conga', high }); }
    tom(t, f, vol) { this.drum(t, f, f * 0.62, 0.55, vol, this.bus.perc); const s = this.ctx.createGain(); s.gain.value = 0.2; this.bus.perc.connect(s); this.events.push({ k: 'perc', t, s: 'tom' }); }
    // strings: a legato section, a high descant and pizzicato
    section(t, notes, len) {
      const c = this.ctx;
      notes.forEach((m, i) => [-8, 8].forEach((dt) => {
        const g = c.createGain(), vg = c.createGain();
        const o = this.osc('sawtooth', mtof(m), t, t + len + 1, g, dt);
        vg.gain.value = 9; this.vib.connect(vg); vg.connect(o.detune);
        this.env(g, t, i === 0 ? 0.05 : 0.042, 0.35, 0.7, Math.max(0.05, len - 0.35));
        g.connect(this.strIn);
      }));
      this.events.push({ k: 'strings', t, big: true });
    }
    violin(t, m, len) {
      const c = this.ctx, g = c.createGain(), vg = c.createGain();
      const o = this.osc('sawtooth', mtof(m), t, t + len + 0.6, g);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(14, t + 0.3); this.vib.connect(vg); vg.connect(o.detune);
      this.env(g, t, 0.035, 0.12, 0.4, Math.max(0.05, len - 0.12));
      g.connect(this.strIn);
      this.events.push({ k: 'strings', t, m });
    }
    pizz(t, m) {
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      this.osc('triangle', mtof(m), t, t + 0.4, f); this.osc('sawtooth', mtof(m), t, t + 0.4, f, 4);
      f.connect(g); this.env(g, t, 0.06, 0.002, 0.28); g.connect(this.bus.strings);
      this.events.push({ k: 'strings', t, pz: true });
    }
    choirChord(t, notes, len, vowel) {
      const c = this.ctx;
      VOWELS[vowel].forEach((fq, k) => this.choir.fs[k].frequency.setTargetAtTime(fq, t, 0.2));
      notes.forEach((m) => [-11, 11].forEach((dt) => {
        const g = c.createGain();
        this.osc('sawtooth', mtof(m), t, t + len + 0.8, g, dt);
        this.env(g, t, 0.05, 0.45, 0.6, Math.max(0.05, len - 0.45));
        g.connect(this.choir.input);
      }));
    }
    leadNote(t, m, len, vowel) {
      const c = this.ctx, g = c.createGain(), vg = c.createGain();
      VOWELS[vowel].forEach((fq, k) => this.lead.fs[k].frequency.setTargetAtTime(fq, t, 0.04));
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(22, t + Math.min(0.4, len));
      this.vib.connect(vg);
      const from = this.prevLead && t - this.prevLead.end < 0.15 ? this.prevLead.m : m;
      [0, 7].forEach((dt) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = dt;
        o.frequency.setValueAtTime(mtof(from), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.07);
        vg.connect(o.detune); o.connect(g); o.start(t); o.stop(t + len + 0.4);
      });
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085, t + 0.05);
      g.gain.setValueAtTime(0.085, t + len * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.25);
      g.connect(this.lead.input);
      this.prevLead = { m, end: t + len };
      this.events.push({ k: 'voice', t, m, len });
    }

    /* ---------- the score, one 16th step at a time ---------- */
    playStep(n, t) {
      if (n > END_STEP) return;
      const live = (name) => { const L = this.layer(name); return L.state !== 'off' && n >= L.enterStep; };
      const enters = (name) => this.layer(name).enterStep === n;
      if (n === END_STEP) { // final downbeat: one last hit and a ringing Dm chord
        if (live('keys')) { this.pluck(t, 74, 0.08); this.keyPad(t, [62, 65, 69], 2.2); }
        if (live('beat')) { this.kick(t, 1); this.noiseHit(t, this.rev, { f: 5000, vol: 0.12, d: 2.2 }); }
        if (live('bass')) this.bassNote(t, 38, 1.6);
        if (live('perc')) { this.tom(t, 110, 0.5); this.tom(t + 0.02, 75, 0.5); }
        if (live('strings')) { this.section(t, [50, 62, 65, 69], 2.4); this.violin(t, 81, 2.2); }
        if (live('voice')) { this.choirChord(t, [62, 65, 69], 2.2, 'ah'); this.leadNote(t, 74, 1.6, 'ah'); }
        this.events.push({ k: 'end', t });
        return;
      }
      const bar = n >> 4, i = n & 15, secName = FORM[bar >> 3], S = SEC[secName], b = bar % 8;
      const ch = S.ch[b], r = S.root[b], isB = secName === 'B';
      if (live('keys')) {
        const arp = [[0, 0], [3, 1], [6, 2], [8, 1], [11, 2], [14, 0]].find(([st]) => st === i);
        if (arp) this.pluck(t, ch[arp[1]] + 12, i === 0 ? 0.085 : 0.06);
        if (i === 0 || enters('keys')) this.keyPad(t, ch, (16 - i) * STEP);
      }
      if (live('beat')) {
        if (i % 4 === 0) this.kick(t, i === 0 || i === 8 ? 0.95 : 0.6);
        if (i === 4 || i === 12) this.snare(t);
        this.noiseHit(t, this.bus.beat, { f: 9000, vol: [0.05, 0.016, 0.03, 0.016][i % 4], d: 0.03 });
        if (i % 4 === 2) this.noiseHit(t, this.bus.beat, { f: 7000, vol: isB ? 0.055 : 0.04, d: 0.16 });
        if (b === 7 && i >= 12) this.noiseHit(t, this.bus.beat, { type: 'bandpass', f: 2400 + (i - 12) * 600, q: 2, vol: 0.06, d: 0.07 });
      }
      if (live('bass')) {
        const pat = isB ? [[0, 0, 2], [2, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 2], [10, 7, 1], [12, 12, 1], [14, 10, 2]]
          : [[0, 0, 3], [3, 0, 1], [6, 12, 1], [8, 0, 2], [11, 7, 1], [14, 12, 2]];
        const hit = pat.find(([st]) => st === i);
        if (hit) this.bassNote(t, r + hit[1], hit[2] * STEP * 0.95);
      }
      if (live('perc')) {
        if (i === 0 || i === 11) this.tom(t, i === 0 ? 92 : 120, 0.55);
        if ([3, 6, 10, 13, 14].includes(i)) this.conga(t, i === 6 || i === 14, i === 6 ? 0.32 : 0.24);
        if (i === 3 || i === 10) this.noiseHit(t, this.bus.perc, { type: 'bandpass', f: 2600, q: 6, vol: 0.12, d: 0.03 });
        this.noiseHit(t, this.bus.perc, { f: 6000, vol: i % 2 ? 0.03 : 0.018, d: 0.05 });
        if (b === 7 && i >= 8 && i % 2 === 0) this.tom(t, 210 - (i - 8) * 18, 0.5);
      }
      if (live('strings')) {
        if (i === 0 || enters('strings')) this.section(t, [ch[0] - 12, ...ch], (16 - i) * STEP);
        if (i === 0 || i === 8) this.violin(t, ch[i === 0 ? 2 : 1] + 12, BEAT * 1.9);
        if ([2, 6, 10, 14].includes(i)) this.pizz(t, ch[(i >> 2) % 3]);
      }
      if (live('voice')) {
        if (i === 0 || enters('voice')) this.choirChord(t, ch, (16 - i) * STEP, b % 2 ? 'oh' : 'ah');
        S.mel[b].forEach(([st, m, len]) => { if (st === i) this.leadNote(t, m, len * STEP, LYRIC[(b + st) % 8]); });
      }
    }
    tick() {
      const now = this.ctx.currentTime;
      while (this.t0 + this.next * STEP < now + 0.12) {
        // Sequence: while any layer is still missing at the final downbeat, wrap to bar 1
        // instead of ending, keeping every layer that is already in.
        if (this.next === END_STEP && this.layers.some((L) => L.enterStep >= END_STEP)) {
          this.t0 += DURATION; this.next = 0;
          this.layers.forEach((L) => { if (isFinite(L.enterStep)) L.enterStep = Math.max(0, L.enterStep - END_STEP); });
          this.events.push({ k: 'loop', t: this.t0 });
        }
        const t = this.t0 + this.next * STEP;
        if (t >= now - 0.03) this.playStep(this.next, t);
        this.next++;
      }
      let changed = false;
      this.layers.forEach((L) => { if (L.state === 'queued' && now >= L.enterTime) { L.state = 'on'; changed = true; this.events.push({ k: 'enter', t: L.enterTime, name: L.name }); } });
      if (this.events.length > 500) { const cut = this.events.findIndex((e) => e.t > now - 3); if (cut > 0) { this.events.splice(0, cut); this.evShift += cut; } }
      if (!this.finished && now > this.t0 + DURATION + 2.6) { this.finished = true; clearInterval(this.timer); changed = true; }
      if (changed) this.emit();
    }

    /* ---------- public actions ---------- */
    async start(preLayers = ['keys'], { wake = true } = {}) {
      this.init();
      if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* ignore */ } }
      if (this.started) return;
      const now = this.ctx.currentTime;
      this.t0 = now + 0.08; this.next = 0;
      preLayers.forEach((n) => Object.assign(this.layer(n), { state: 'on', enterStep: 0, enterTime: this.t0 }));
      if (wake) {
        this.wake.frequency.setValueAtTime(280, this.t0);
        this.wake.frequency.exponentialRampToValueAtTime(20000, this.t0 + BEAT * 3);
      }
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      this.emit();
    }
    queue(name) {
      const L = this.layer(name);
      if (!this.started || L.state !== 'off' || this.paused || this.finished) return null;
      const now = this.ctx.currentTime;
      const step = Math.ceil((now + 0.28 - this.t0) / BEAT) * 4;
      // A layer queued past the final downbeat enters on the next pass (the song wraps for it).
      L.enterStep = step; L.enterTime = this.t0 + step * STEP; L.state = 'queued';
      this.riser(now + 0.02, L.enterTime, name);
      this.emit();
      return L.enterTime;
    }
    riser(t, end, name) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      const lo = { beat: 400, bass: 300, perc: 600, strings: 500, voice: 900 }[name] || 600;
      s.buffer = this.noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 2.5;
      f.frequency.setValueAtTime(lo, t); f.frequency.exponentialRampToValueAtTime(lo * 9, end);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, end - 0.02); g.gain.linearRampToValueAtTime(0.0001, end + 0.01);
      s.connect(f); f.connect(g); g.connect(this.mix); s.start(t); s.stop(end + 0.05);
      if (name === 'beat') this.noiseHit(end, this.rev, { f: 4000, vol: 0.12, d: 1.4 });
      if (name === 'bass') this.drum(end, 90, 36, 0.8, 0.5, this.bus.bass);
      if (name === 'perc') { this.drum(end, 140, 70, 0.6, 0.5, this.bus.perc); this.noiseHit(end, this.rev, { f: 3000, vol: 0.1, d: 1.2 }); }
      if (name === 'strings') this.noiseHit(end, this.rev, { type: 'bandpass', f: 1200, q: 0.6, vol: 0.06, d: 1.4 });
      if (name === 'voice') this.noiseHit(end, this.rev, { f: 5000, vol: 0.06, d: 1.6 });
    }
    progress() { return this.started ? Math.max(0, Math.min(1, (this.now() - this.t0) / DURATION)) : 0; }
    elapsed() { return this.started ? Math.max(0, Math.min(DURATION, this.now() - this.t0)) : 0; }
    async pause() { if (!this.ctx || this.paused || this.finished) return; this.paused = true; this.emit(); try { await this.ctx.suspend(); } catch (e) { /* ignore */ } }
    async resume() { if (!this.ctx || !this.paused) return; try { await this.ctx.resume(); } catch (e) { /* ignore */ } this.paused = false; this.emit(); }
    async dispose() {
      clearInterval(this.timer);
      if (this.ctx) { try { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); await new Promise((r) => setTimeout(r, 200)); await this.ctx.close(); } catch (e) { /* ignore */ } }
      this.listeners.clear();
    }
  }
  window.SonaraSong = { Song, BPM, BEAT, BAR, STEP, NAMES, DURATION, SONG_BARS };
})();
