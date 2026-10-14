/* SONARA · Week 4 — one fixed song, one action at a time.
   Sequence prototype: Play → Add beat → Add bass → Add percussion → Add strings → Add voice,
   then a full-track ending with an end card. Taken from the shared study UI; additions are
   marked "Sequence:".
   Each layer has its own colour and its own shapes, and each reads its own audio.
   window.SONARA_CONFIG = { label, pre: [layers that come in with Play], actions: [layers the user adds], cooldown } */
(function () {
  const { Song, BEAT, DURATION, NAMES } = window.SonaraSong;
  const CFG = Object.assign({ label: '', actions: NAMES.slice(1), cooldown: 2.5 }, window.SONARA_CONFIG || {});
  const COL = { keys: [222, 228, 255], beat: [110, 215, 235], bass: [178, 152, 255], perc: [255, 128, 110], strings: [130, 235, 170], voice: [245, 200, 105] };
  const LABEL = { keys: 'Keys', beat: 'Beat', bass: 'Bass', perc: 'Percussion', strings: 'Strings', voice: 'Voice' };
  const SHORT = { keys: 'Keys', beat: 'Beat', bass: 'Bass', perc: 'Perc', strings: 'Strings', voice: 'Voice' };
  const QUEUED = { beat: 'Beat drops…', bass: 'Dropping…', perc: 'Drums incoming…', strings: 'Strings rising…', voice: 'Here it comes…' };
  const $ = (id) => document.getElementById(id);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const mixC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startLayers = ['keys']; // Play only ever starts the soft keys intro; every other layer is added by hand

  // build chips and progress lanes
  $('chips').innerHTML = NAMES.map((n) => `<span class="chip" id="chip-${n}" style="--c:${COL[n].join(',')}">${SHORT[n]}</span>`).join('');
  $('lanes').innerHTML = NAMES.map((n) => `<div class="lane" id="lane-${n}" style="--c:${COL[n].join(',')}"><span class="fill"></span><span class="mark" data-l="${SHORT[n]} ready" hidden></span></div>`).join('') + '<span id="head"></span>';

  let song, step, unlockAt;

  /* ======================= the record ======================= */
  const cv = $('stage'), g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, Rp = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
    const dock = $('dock').getBoundingClientRect().height || 200, top = 64;
    cx = W / 2; cy = top + (H - dock - top) / 2;
    Rp = Math.max(30, Math.min(W * 0.14, (H - dock - top) / 2 / 3.35, (W / 2 - 8) / 3.35));
  }
  window.addEventListener('resize', resize);

  const fbuf = new Uint8Array(256), tbuf = new Uint8Array(512);
  const lv = {}, show = {}; NAMES.forEach((n) => { lv[n] = 0; show[n] = 0; });
  const spec = new Float32Array(72), cells = new Float32Array(16), notes = [];
  let spin = 0, angle = 0, orbit = 0, sq = 0, rib = 0, last = performance.now() / 1000, evAbs = 0;
  let glowCol = [150, 140, 220], squarePunch = 0, stringSwell = 0, flash = 0;
  const ripples = [], parts = [], boxes = [];
  const stars = Array.from({ length: 180 }, () => ({ a: Math.random() * 6.283, r: 0.15 + Math.random() * 1.25, s: 0.2 + Math.random(), p: Math.random() * 6 }));

  function level(name) {
    if (!song || !song.ctx || song.paused) return 0;
    song.an[name].getByteFrequencyData(fbuf);
    let s = 0; const n = name === 'bass' ? 24 : 120;
    for (let i = 1; i < n; i++) s += fbuf[i];
    return Math.min(1, (s / (n - 1) / 255) * (name === 'bass' ? 1.5 : 2.6));
  }
  function rect(x, y, w, h, rot) { g.save(); g.translate(x, y); g.rotate(rot); g.strokeRect(-w / 2, -h / 2, w, h); g.restore(); }
  function poly(x, y, r, sides, rot) {
    g.beginPath();
    for (let v = 0; v <= sides; v++) { const th = rot + (v / sides) * Math.PI * 2; const X = x + Math.cos(th) * r, Y = y + Math.sin(th) * r; v ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.stroke();
  }
  function burst(x, y, c, n, spd) {
    for (let j = 0; j < (reduced ? Math.ceil(n / 4) : n) && parts.length < 700; j++) {
      const a = Math.random() * 6.283, sp = Rp * (0.3 + Math.random() * 1.1) * spd;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.9 + Math.random() * 1.3, c });
    }
  }

  function frame() {
    const tnow = performance.now() / 1000, dt = Math.min(0.05, tnow - last); last = tnow;
    const running = !!(song && song.started && !song.paused && !song.finished);
    const now = song ? song.now() : 0;
    NAMES.forEach((n) => {
      lv[n] = lv[n] * 0.5 + level(n) * 0.5;
      const on = song && song.layer(n).state === 'on' && !song.finished;
      show[n] += ((on ? 1 : 0) - show[n]) * Math.min(1, dt * (on ? 2.2 : 1.2));
    });
    // score events → visual hits, exactly in time with the sound
    if (song) {
      const ev = song.events; let i = Math.max(0, evAbs - song.evShift);
      while (i < ev.length && ev[i].t <= now) {
        const e = ev[i++];
        if (now - e.t > 0.25) continue;
        if (e.k === 'kick') ripples.push({ r0: 1.03, r1: 1.75, w: 2.4 * e.v, born: tnow, life: 0.7, a: 0.6 * e.v, c: COL.beat });
        if (e.k === 'keys') notes.push({ born: tnow, a: ((e.m % 12) / 12) * 6.283 - Math.PI / 2, life: 1.4 });
        if (e.k === 'bass') { squarePunch = 1; ripples.push({ r0: 1.8, r1: 2.6, w: 6, born: tnow, life: 1, a: 0.3, c: COL.bass }); }
        if (e.k === 'perc') {
          const cell = Math.floor((((now - song.t0) / (BEAT / 4)) % 16 + 16) % 16); cells[cell] = 1;
          if (e.s === 'tom') boxes.push({ born: tnow, rot: Math.random() * 6.283, life: 1.1 });
        }
        if (e.k === 'strings') stringSwell = Math.min(1, stringSwell + (e.big ? 0.8 : e.pz ? 0.15 : 0.4));
        if (e.k === 'enter') { flash = 1; ripples.push({ r0: 1, r1: 4.2, w: 14, born: tnow, life: 1.5, a: 0.9, c: COL[e.name] }); burst(cx, cy, COL[e.name], 70, 1.7); }
        if (e.k === 'voice') {
          const k = Math.floor(Math.random() * 6), ang = -orbit + (k / 6) * Math.PI * 2;
          burst(cx + Math.cos(ang) * Rp * 2.95, cy + Math.sin(ang) * Rp * 2.95, COL.voice, 14, 1);
        }
        // Sequence: the song wrapped to bar 1 because layers are still missing
        if (e.k === 'loop') ripples.push({ r0: 1, r1: 3, w: 6, born: tnow, life: 1.4, a: 0.45, c: glowCol });
        if (e.k === 'end') { flash = 1; ripples.push({ r0: 1, r1: 4.6, w: 16, born: tnow, life: 2.4, a: 0.8, c: [235, 235, 245] }); }
      }
      evAbs = i + song.evShift;
    }
    squarePunch *= Math.pow(0.02, dt); flash *= Math.pow(0.08, dt); stringSwell *= Math.pow(0.35, dt);
    for (let c = 0; c < 16; c++) cells[c] *= Math.pow(0.05, dt);
    let total = 0; NAMES.forEach((n) => { total += lv[n] * show[n]; }); total = Math.min(1, total * 0.55);
    spin += ((running ? 1 : 0) - spin) * Math.min(1, dt * 1.6);
    const k = reduced ? 0.3 : 1;
    angle += spin * dt * 3.49 * k;
    orbit += spin * dt * (0.14 + 0.3 * lv.voice) * k;
    sq += spin * dt * (0.25 + 0.4 * lv.bass) * k;
    rib += spin * dt * (0.2 + 0.3 * lv.strings) * k;
    // the room colour follows whatever is playing
    let target = [72, 66, 114], wsum = 0.6;
    NAMES.forEach((n) => { const w = show[n] * (0.5 + lv[n]); target = target.map((v, i) => v + COL[n][i] * w); wsum += w; });
    target = target.map((v) => v / wsum);
    glowCol = mixC(glowCol, target, Math.min(1, dt * 2));

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#100f17'; g.fillRect(0, 0, W, H);
    const halo = g.createRadialGradient(cx, cy, Rp * 0.3, cx, cy, Math.max(W, H) * 0.7);
    halo.addColorStop(0, rgba(glowCol, 0.16 + total * 0.16 + flash * 0.22));
    halo.addColorStop(0.5, rgba(mixC(glowCol, [30, 26, 50], 0.6), 0.1));
    halo.addColorStop(1, 'rgba(16,15,23,0)');
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    for (const s of stars) {
      const a = s.a + angle * 0.01 * s.s, r = s.r * Math.max(W, H) * 0.6;
      g.fillStyle = `rgba(215,215,235,${0.1 + 0.14 * Math.abs(Math.sin(tnow * s.s + s.p)) + total * 0.25})`;
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3, 1.3);
    }
    for (let b = 0; b < 8; b++) {
      const r = Rp * (3.4 + b * 0.42) * (1 + (b % 2 ? 1 : -1) * lv.bass * 0.02 * show.bass);
      g.lineWidth = Rp * (0.09 - b * 0.006); g.strokeStyle = `rgba(140,150,190,${0.07 + total * 0.05})`;
      g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
    }
    for (let b = 0; b < 5; b++) { g.strokeStyle = 'rgba(200,200,230,0.045)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, Rp * (1.3 + b * 0.45), 0, 6.283); g.stroke(); }

    g.globalCompositeOperation = 'lighter';
    // 1 · KEYS — each arpeggio note lights a point on a ring, placed by its pitch
    if (show.keys > 0.01) {
      g.strokeStyle = rgba(COL.keys, 0.12 + lv.keys * 0.3 * show.keys); g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, Rp * 1.22, 0, 6.283); g.stroke();
      for (let q = notes.length - 1; q >= 0; q--) {
        const n = notes[q], f = (tnow - n.born) / n.life;
        if (f >= 1) { notes.splice(q, 1); continue; }
        const a = n.a + angle * 0.02, r = Rp * (1.22 + f * 0.35);
        g.fillStyle = rgba(COL.keys, (1 - f) * 0.9 * show.keys);
        g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5 + (1 - f) * 3, 0, 6.283); g.fill();
        g.strokeStyle = rgba(COL.keys, (1 - f) * 0.4 * show.keys); g.lineWidth = 1.2;
        g.beginPath(); g.arc(cx, cy, Rp * 1.22, a - 0.25 * (1 - f), a + 0.25 * (1 - f)); g.stroke();
      }
    }
    // 2 · BEAT — cyan spectrum around the record, kick pulses
    if (show.beat > 0.01 && running) {
      song.an.beat.getByteFrequencyData(fbuf);
      for (let i = 0; i < 72; i++) spec[i] = spec[i] * 0.5 + (fbuf[Math.floor(Math.pow(i / 72, 1.6) * 150) + 2] / 255) * 0.5;
    }
    if (show.beat > 0.01) {
      g.lineCap = 'round';
      for (let q = 0; q < 144; q++) {
        const i = q < 72 ? q : 143 - q, a = (q / 144) * 6.283 - Math.PI / 2 + angle * 0.05, len = (3 + spec[i] * Rp * 0.38) * show.beat;
        g.strokeStyle = rgba(COL.beat, (0.25 + spec[i] * 0.75) * show.beat); g.lineWidth = 1.7;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * Rp * 1.06, cy + Math.sin(a) * Rp * 1.06); g.lineTo(cx + Math.cos(a) * (Rp * 1.06 + len), cy + Math.sin(a) * (Rp * 1.06 + len)); g.stroke();
      }
    }
    // 3 · PERCUSSION — a 16-step ring of blocks that light on each hit; toms throw out spinning squares
    if (show.perc > 0.01) {
      for (let c = 0; c < 16; c++) {
        const a = (c / 16) * 6.283 - Math.PI / 2, r = Rp * 1.58, on = cells[c];
        const w = Rp * (0.16 + on * 0.1), h = Rp * (0.08 + on * 0.14);
        g.lineWidth = 1.6; g.strokeStyle = rgba(COL.perc, (0.4 + on * 0.6) * show.perc);
        rect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w, h, a + Math.PI / 2);
        if (on > 0.3) { g.fillStyle = rgba(COL.perc, on * 0.35 * show.perc); g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillRect(-w / 2, -h / 2, w, h); g.restore(); }
      }
      for (let q = boxes.length - 1; q >= 0; q--) {
        const bx = boxes[q], f = (tnow - bx.born) / bx.life;
        if (f >= 1) { boxes.splice(q, 1); continue; }
        const s = Rp * (1.4 + f * 2.2);
        for (let e = 0; e < 3; e++) { g.lineWidth = 2 * (1 - f); g.strokeStyle = rgba(COL.perc, (0.55 - e * 0.15) * (1 - f) * show.perc); rect(cx, cy, s * (1 - e * 0.05), s * (1 - e * 0.05), bx.rot + f * 1.2 + e * 0.06); }
      }
    }
    // 2 · BASS — lavender waveform rings and orbiting squares / rectangles that punch on every bass note
    if (show.bass > 0.01) {
      if (running) song.an.bass.getByteTimeDomainData(tbuf); else tbuf.fill(128);
      for (let j = 0; j < 3; j++) {
        const base = Rp * (1.85 + j * 0.13);
        g.beginPath();
        for (let p = 0; p <= 200; p++) {
          const th = (p / 200) * 6.283 + j * 0.7 - angle * 0.1 * (j % 2 ? -1 : 1);
          const v = (tbuf[(p * 2 + j * 37) % 512] - 128) / 128;
          const r = base + v * Rp * (0.2 + j * 0.05) * show.bass;
          p ? g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r) : g.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
        }
        g.lineWidth = (1.2 + lv.bass * 3.2 - j * 0.3) * show.bass + 0.3;
        g.strokeStyle = rgba(COL.bass, (0.3 + lv.bass * 0.6) * show.bass); g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const ang = sq + (i / 4) * Math.PI * 2 + Math.PI / 4, rr = Rp * 2.25;
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        const s = Rp * (0.26 + squarePunch * 0.18 + lv.bass * 0.06) * show.bass, ratio = i % 2 ? 1.7 : 1;
        for (let e = 0; e < (reduced ? 2 : 8); e++) {
          g.lineWidth = 1.5; g.strokeStyle = rgba(COL.bass, (0.75 - e * 0.085) * show.bass * (0.55 + lv.bass));
          rect(px, py, s * ratio * (1 + e * 0.08), s * (1 + e * 0.08), -sq * 1.6 + e * (0.07 + squarePunch * 0.1) + i);
        }
      }
    }
    // 4 · STRINGS — mint ribbons that swell with each bow stroke
    if (show.strings > 0.01) {
      for (let j = 0; j < 4; j++) {
        const base = Rp * (2.55 + j * 0.07), lobes = 5 + j * 2;
        g.beginPath();
        for (let p = 0; p <= 260; p++) {
          const th = (p / 260) * 6.283;
          const r = base + Rp * (0.05 + lv.strings * 0.16 + stringSwell * 0.1) * show.strings * Math.sin(lobes * th + rib * (j % 2 ? -2 : 2) + j);
          p ? g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r) : g.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
        }
        g.closePath(); g.lineWidth = 1 + lv.strings * 1.5;
        g.strokeStyle = rgba(COL.strings, (0.2 + lv.strings * 0.5 + stringSwell * 0.2) * show.strings); g.stroke();
      }
    }
    // 5 · VOICE — gold polygons and rectangles with echo trails, a web between them, sparks on each sung note
    if (show.voice > 0.01) {
      const centers = [];
      for (let i = 0; i < 6; i++) {
        const ang = -orbit + (i / 6) * Math.PI * 2, rr = Rp * (2.95 + 0.08 * Math.sin(tnow * 0.8 + i));
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr; centers.push([px, py]);
        const size = Rp * (0.15 + lv.voice * 0.28) * show.voice;
        for (let e = 0; e < (reduced ? 2 : 8); e++) {
          g.lineWidth = 1.2; g.strokeStyle = rgba(COL.voice, (0.6 - e * 0.065) * show.voice * (0.45 + lv.voice));
          const rot = orbit * (1.4 + i * 0.2) + e * (0.09 + lv.voice * 0.12);
          if (i % 3 === 2) rect(px, py, size * 1.7 * (1 + e * 0.06), size * 1.1 * (1 + e * 0.06), rot);
          else poly(px, py, size * (1 + e * 0.07), i % 3 === 0 ? 3 : 5, rot);
        }
      }
      g.lineWidth = 0.9; g.strokeStyle = rgba(COL.voice, show.voice * (0.08 + lv.voice * 0.35));
      g.beginPath(); centers.forEach(([x1, y1], i) => { const [x2, y2] = centers[(i + 2) % 6]; g.moveTo(x1, y1); g.lineTo(x2, y2); }); g.stroke();
    }
    for (let q = parts.length - 1; q >= 0; q--) {
      const p = parts[q]; p.age += dt;
      if (p.age > p.life) { parts.splice(q, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98;
      g.fillStyle = rgba(p.c, (1 - p.age / p.life) * 0.9); g.fillRect(p.x - 1.1, p.y - 1.1, 2.2, 2.2);
    }
    for (let q = ripples.length - 1; q >= 0; q--) {
      const r = ripples[q], f = (tnow - r.born) / r.life;
      if (f >= 1) { ripples.splice(q, 1); continue; }
      const e = 1 - Math.pow(1 - f, 3);
      g.strokeStyle = rgba(r.c, r.a * (1 - f)); g.lineWidth = r.w * (1 - f) + 0.5;
      g.beginPath(); g.arc(cx, cy, Rp * (r.r0 + (r.r1 - r.r0) * e), 0, 6.283); g.stroke();
    }

    // the platter
    g.globalCompositeOperation = 'source-over';
    const R = Rp * (1 + lv.bass * 0.035 * show.bass);
    g.fillStyle = '#16151e'; g.beginPath(); g.arc(cx, cy, R, 0, 6.283); g.fill();
    for (let r = R * 0.48; r < R * 0.97; r += 2.6) { g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke(); }
    g.save(); g.translate(cx, cy); g.rotate(angle);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = R * 0.5;
    g.beginPath(); g.arc(0, 0, R * 0.72, -0.35, 0.35); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.72, Math.PI - 0.35, Math.PI + 0.35); g.stroke();
    const lab = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    lab.addColorStop(0, rgba(mixC(glowCol, [255, 255, 255], 0.35), 1)); lab.addColorStop(1, rgba(mixC(glowCol, [40, 34, 60], 0.45), 1));
    g.fillStyle = lab; g.beginPath(); g.arc(0, 0, R * 0.42, 0, 6.283); g.fill();
    g.fillStyle = '#100f17'; g.beginPath(); g.arc(R * 0.28, 0, R * 0.035, 0, 6.283); g.fill();
    g.restore();
    g.fillStyle = '#100f17'; g.beginPath(); g.arc(cx, cy, R * 0.045, 0, 6.283); g.fill();
    g.strokeStyle = `rgba(240,240,250,${0.55 + lv.beat * 0.45})`; g.lineWidth = 2.5 + lv.beat * 2;
    g.shadowColor = rgba(glowCol, 0.9); g.shadowBlur = 10 + total * 26;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.283); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#f4f4f8'; g.beginPath(); g.arc(cx + Math.cos(angle) * R * 0.82, cy + Math.sin(angle) * R * 0.82, 3, 0, 6.283); g.fill();

    ui();
    requestAnimationFrame(frame);
  }

  /* ======================= one thing at a time ======================= */
  const current = () => CFG.actions[step];
  const allOn = () => song && NAMES.every((n) => song.layer(n).state === 'on');
  function ui() {
    const started = !!(song && song.started), name = current();
    const pb = $('play');
    pb.dataset.state = !started ? 'idle' : song.finished ? 'done' : song.paused ? 'paused' : 'playing';
    pb.setAttribute('aria-label', !started || song.paused ? 'Play' : song.finished ? 'Play again' : 'Pause');
    NAMES.forEach((n) => { $('chip-' + n).dataset.state = song && !song.finished ? song.layer(n).state : 'off'; });
    const p = started ? song.progress() : 0;
    $('t-now').textContent = fmt(started ? song.elapsed() : 0);
    $('head').style.left = p * 100 + '%';
    NAMES.forEach((n) => {
      const L = song && song.layer(n), lane = $('lane-' + n);
      const from = L && L.state !== 'off' && started ? Math.max(0, (L.enterTime - song.t0) / DURATION) : null;
      const fill = lane.querySelector('.fill');
      if (from != null && p > from) { fill.style.left = from * 100 + '%'; fill.style.width = (p - from) * 100 + '%'; } else fill.style.width = '0';
      const mk = lane.querySelector('.mark');
      const showMark = started && name === n && L.state === 'off' && isFinite(unlockAt) && !song.finished;
      mk.hidden = !showMark;
      if (showMark) mk.style.left = Math.min(1, (unlockAt - song.t0) / DURATION) * 100 + '%';
    });
    $('step-n').textContent = started ? `Step ${Math.min(step + 2, CFG.actions.length + 1)} of ${CFG.actions.length + 1}` : `Step 1 of ${CFG.actions.length + 1}`;
    // Sequence: the header label follows the current action, in the studies' label format
    const total = CFG.actions.length + 1, k = started ? Math.min(step + 2, total) : 1;
    $('study').textContent = `Step ${k} / ${total} · ${!started ? 'Play' : name ? 'Add ' + LABEL[name].toLowerCase() : 'Full track'}`;
    $('end').hidden = !(started && song.finished);
    const wrap = $('actwrap'), btn = $('act'), hint = $('hint');
    if (!started) { wrap.dataset.show = 'false'; hint.textContent = 'Press play'; return; }
    if (song.finished) { wrap.dataset.show = 'false'; hint.textContent = 'That’s the track · play again'; return; }
    if (!name) { wrap.dataset.show = 'false'; hint.textContent = song.paused ? 'Paused' : allOn() ? 'Full track · enjoy' : 'Playing'; return; }
    const L = song.layer(name), now = song.now();
    wrap.dataset.show = 'true';
    btn.style.setProperty('--c', COL[name].join(','));
    if (L.state === 'off') {
      const ready = now >= unlockAt, left = Math.max(0, unlockAt - now);
      btn.disabled = !ready || song.paused; btn.dataset.state = ready ? 'ready' : 'waiting';
      btn.style.setProperty('--fill', ready ? '1' : String(Math.min(1, 1 - left / CFG.cooldown)));
      btn.style.setProperty('--pulse', ready ? String(1 - song.beatPhase()) : '0');
      $('act-label').textContent = ready ? `Add ${LABEL[name].toLowerCase()}` : `${LABEL[name]} in ${Math.ceil(left)}`;
      hint.textContent = song.paused ? 'Paused' : '';
    } else if (L.state === 'queued') {
      btn.disabled = true; btn.dataset.state = 'queued';
      $('act-label').textContent = QUEUED[name];
      hint.textContent = '';
    }
  }
  function advance() { step++; unlockAt = song.now() + CFG.cooldown; }

  async function onPlay() {
    if (!song.started) { await song.start(startLayers, { wake: true }); unlockAt = song.now() + CFG.cooldown; return; }
    if (song.finished) { await reset(); onPlay(); return; }
    if (song.paused) { await song.resume(); unlockAt = Math.max(unlockAt, song.now() + 0.5); } else song.pause();
  }
  function onAct() {
    const name = current();
    if (!name || song.now() < unlockAt) return;
    if (song.queue(name)) {
      const off = song.on(() => { if (song.layer(name).state === 'on') { off(); advance(); } });
    }
  }
  async function reset() { const old = song; song = null; if (old) await old.dispose(); boot(); }
  function boot() { song = new Song(); step = 0; unlockAt = Infinity; evAbs = 0; ripples.length = 0; parts.length = 0; boxes.length = 0; notes.length = 0; }

  $('play').addEventListener('click', onPlay);
  $('act').addEventListener('click', onAct);
  $('reset').addEventListener('click', reset);
  $('again').addEventListener('click', reset);
  $('t-end').textContent = fmt(DURATION);
  boot(); resize(); requestAnimationFrame(frame);
  window.__sonara = () => song;
})();
