// 2D gate-raid scene drawn on a canvas: the hunter, their shadow army, monsters, and hit effects.
// API: PL_Battle.create(canvas, opts) → scene with promise-returning actions.
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const easeIn = (p) => p * p;
  const lerp = (a, b, p) => a + (b - a) * p;
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const WHITE = { body: "#ffffff", dark: "#ffffff", accent: "#ffffff", eye: "#ffffff", rim: "#ffffff" };

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const accent = opts.color || "#4db4ff";
    let W = 0, H = 0, dpr = 1, raf = 0, alive = true;
    let last = performance.now();
    const anims = [];
    const particles = [];
    const texts = [];
    const motes = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, r: 0.6 + Math.random() * 1.6 }));

    const hero = { off: 0, dodge: 0, hurt: 0, fall: 0, alpha: 1, bob: 0 };
    const mon = { data: null, off: 0, alpha: 0, flash: 0, scale: 1 };
    let shake = 0, redFlash = 0, goldFlash = 0;
    let shadows = Math.min(3, opts.shadows || 0);

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    resize();
    const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    function tween(dur, fn) {
      if (reduceMotion()) dur = Math.min(dur, 60);
      return new Promise((resolve) => anims.push({ t: 0, dur, fn, resolve }));
    }
    const wait = (ms) => tween(ms, () => {});

    function floatText(text, x, y, color, size = 22) {
      texts.push({ text, x, y, color, size, t: 0, dur: 900 });
    }

    function burst(x, y, color, n = 36, speed = 160) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 0.6 + Math.random() * 0.6, r: 1.5 + Math.random() * 2.5, color });
      }
    }

    // ---------- Geometry ----------
    const scale = () => Math.max(0.7, Math.min(1.25, H / 190));
    const groundY = () => H * 0.8;
    const heroX = () => W * 0.24;
    const monX = () => W * 0.72;

    // ---------- Drawing ----------
    function drawBackground(t) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#050811");
      g.addColorStop(1, "#0b1530");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // gate aura behind the monster
      const aura = ctx.createRadialGradient(monX(), groundY() - 50, 10, monX(), groundY() - 50, W * 0.45);
      aura.addColorStop(0, hexA(accent, 0.28));
      aura.addColorStop(1, hexA(accent, 0));
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, W, H);
      // floor with perspective lines
      const gy = groundY();
      ctx.fillStyle = "#070c1c";
      ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = hexA("#4db4ff", 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      ctx.strokeStyle = hexA("#4db4ff", 0.08);
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(W / 2 + i * 18, gy); ctx.lineTo(W / 2 + i * 90, H); ctx.stroke();
      }
      for (let j = 1; j < 4; j++) {
        const y = gy + (H - gy) * (j / 4) ** 1.6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // mana motes
      for (const m of motes) {
        m.y -= m.v * 0.016;
        if (m.y < -0.02) { m.y = 1; m.x = Math.random(); }
        ctx.fillStyle = hexA("#8fd3ff", 0.25 + 0.35 * Math.sin(t / 700 + m.x * 20) ** 2);
        ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.r, 0, TAU); ctx.fill();
      }
    }

    function drawHunter(x, gy, k, pal, eyeColor, t, alpha = 1) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(x, gy);
      ctx.scale(k, k);
      const bob = Math.sin(t / 380) * 1.5;
      // ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 5, 0, 0, TAU); ctx.fill();
      ctx.translate(0, bob);
      // legs
      ctx.fillStyle = pal.dark;
      ctx.fillRect(-9, -20, 7, 20); ctx.fillRect(3, -20, 7, 20);
      // coat
      ctx.fillStyle = pal.body;
      ctx.beginPath();
      ctx.moveTo(-11, -60); ctx.lineTo(11, -60); ctx.lineTo(16, -16); ctx.lineTo(4, -22); ctx.lineTo(-4, -16); ctx.lineTo(-17, -18);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.9; ctx.stroke(); ctx.globalAlpha /= 0.9;
      // hood
      ctx.fillStyle = pal.body;
      ctx.beginPath(); ctx.arc(1, -70, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = pal.rim; ctx.stroke();
      ctx.fillStyle = "#02040a";
      ctx.beginPath(); ctx.ellipse(5, -69, 6, 7, 0, 0, TAU); ctx.fill();
      // eyes
      ctx.shadowColor = eyeColor; ctx.shadowBlur = 10;
      ctx.fillStyle = eyeColor;
      ctx.fillRect(4, -71, 6, 2);
      ctx.shadowBlur = 0;
      // arm + dagger
      ctx.strokeStyle = pal.body; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(8, -54); ctx.lineTo(22, -40); ctx.stroke();
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 12;
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, -40); ctx.lineTo(44, -50); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    function drawMonster(m, x, gy, k, pal, t) {
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(k, k);
      const bob = Math.sin(t / 420 + 1) * 2;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 6, 0, 0, TAU); ctx.fill();
      ctx.translate(0, bob);
      ctx.lineJoin = "round";
      const eyes = (pts, r = 2.4) => {
        ctx.shadowColor = pal.eye; ctx.shadowBlur = 10; ctx.fillStyle = pal.eye;
        for (const [ex, ey] of pts) { ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill(); }
        ctx.shadowBlur = 0;
      };
      const rim = () => { ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.4; ctx.stroke(); };
      switch (m.kind) {
        case "slime": {
          ctx.fillStyle = pal.body;
          ctx.beginPath();
          ctx.moveTo(-28, 0);
          ctx.bezierCurveTo(-32, -30, -8, -46, 4, -44);
          ctx.bezierCurveTo(20, -42, 32, -24, 28, 0);
          ctx.closePath(); ctx.fill(); rim();
          ctx.fillStyle = hexA("#ffffff", 0.15);
          ctx.beginPath(); ctx.ellipse(-8, -30, 7, 4, -0.5, 0, TAU); ctx.fill();
          eyes([[-10, -20], [2, -21]], 3);
          break;
        }
        case "wolf": {
          ctx.fillStyle = pal.body;
          ctx.beginPath();
          ctx.moveTo(34, -30); ctx.lineTo(-6, -38); ctx.lineTo(-24, -44); ctx.lineTo(-40, -36); ctx.lineTo(-30, -30); ctx.lineTo(-10, -22); ctx.lineTo(30, -18);
          ctx.closePath(); ctx.fill(); rim();
          ctx.beginPath(); ctx.moveTo(-22, -44); ctx.lineTo(-18, -56); ctx.lineTo(-12, -42); ctx.closePath(); ctx.fill(); rim();
          ctx.strokeStyle = pal.body; ctx.lineWidth = 5;
          for (const lx of [-14, -4, 18, 26]) { ctx.beginPath(); ctx.moveTo(lx, -22); ctx.lineTo(lx - 2, 0); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(32, -28); ctx.quadraticCurveTo(46, -40, 44, -50); ctx.stroke();
          eyes([[-30, -38]], 2.2);
          break;
        }
        case "goblin": {
          ctx.fillStyle = pal.body;
          ctx.fillRect(-12, -40, 24, 26); rimRect(-12, -40, 24, 26);
          ctx.fillStyle = pal.dark; ctx.fillRect(-11, -14, 8, 14); ctx.fillRect(3, -14, 8, 14);
          ctx.fillStyle = pal.body;
          ctx.beginPath(); ctx.arc(0, -50, 12, 0, TAU); ctx.fill(); rim();
          ctx.beginPath(); ctx.moveTo(-10, -54); ctx.lineTo(-26, -62); ctx.lineTo(-10, -46); ctx.closePath(); ctx.fill(); rim();
          ctx.beginPath(); ctx.moveTo(10, -54); ctx.lineTo(24, -62); ctx.lineTo(10, -46); ctx.closePath(); ctx.fill(); rim();
          ctx.strokeStyle = pal.accent; ctx.lineWidth = 5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-12, -34); ctx.lineTo(-30, -52); ctx.stroke();
          eyes([[-5, -52], [4, -52]], 2);
          break;
        }
        case "golem": {
          ctx.fillStyle = pal.body;
          ctx.fillRect(-26, -62, 52, 44); rimRect(-26, -62, 52, 44);
          ctx.fillRect(-14, -80, 28, 18); rimRect(-14, -80, 28, 18);
          ctx.fillRect(-36, -58, 12, 38); rimRect(-36, -58, 12, 38);
          ctx.fillRect(24, -58, 12, 38); rimRect(24, -58, 12, 38);
          ctx.fillStyle = pal.dark; ctx.fillRect(-20, -18, 14, 18); ctx.fillRect(6, -18, 14, 18);
          ctx.shadowColor = pal.accent; ctx.shadowBlur = 16; ctx.fillStyle = pal.accent;
          ctx.beginPath(); ctx.arc(0, -42, 6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          eyes([[-6, -72], [6, -72]], 2);
          break;
        }
        case "knight": {
          ctx.fillStyle = pal.dark;
          ctx.beginPath(); ctx.moveTo(-14, -66); ctx.lineTo(24, -60); ctx.lineTo(30, -4); ctx.lineTo(-20, -8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = pal.body;
          ctx.beginPath(); ctx.moveTo(-18, -68); ctx.lineTo(18, -68); ctx.lineTo(14, -26); ctx.lineTo(-14, -26); ctx.closePath(); ctx.fill(); rim();
          ctx.fillRect(-13, -26, 10, 26); ctx.fillRect(3, -26, 10, 26);
          ctx.beginPath(); ctx.moveTo(-12, -94); ctx.lineTo(12, -94); ctx.lineTo(14, -70); ctx.lineTo(-14, -70); ctx.closePath(); ctx.fill(); rim();
          ctx.shadowColor = pal.eye; ctx.shadowBlur = 12; ctx.fillStyle = pal.eye; ctx.fillRect(-10, -84, 14, 3); ctx.shadowBlur = 0;
          ctx.strokeStyle = pal.accent; ctx.lineWidth = 4;
          ctx.shadowColor = pal.accent; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(-16, -40); ctx.lineTo(-44, -96); ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        default: { // demon
          ctx.fillStyle = pal.dark;
          ctx.beginPath(); ctx.moveTo(-6, -70); ctx.lineTo(-54, -104); ctx.lineTo(-40, -60); ctx.lineTo(-58, -52); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(6, -70); ctx.lineTo(54, -104); ctx.lineTo(40, -60); ctx.lineTo(58, -52); ctx.closePath(); ctx.fill();
          ctx.fillStyle = pal.body;
          ctx.beginPath(); ctx.moveTo(-20, -74); ctx.lineTo(20, -74); ctx.lineTo(16, -24); ctx.lineTo(-16, -24); ctx.closePath(); ctx.fill(); rim();
          ctx.fillRect(-15, -24, 11, 24); ctx.fillRect(4, -24, 11, 24);
          ctx.beginPath(); ctx.arc(0, -86, 14, 0, TAU); ctx.fill(); rim();
          ctx.fillStyle = pal.accent;
          ctx.beginPath(); ctx.moveTo(-10, -96); ctx.lineTo(-22, -118); ctx.lineTo(-4, -99); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(10, -96); ctx.lineTo(22, -118); ctx.lineTo(4, -99); ctx.closePath(); ctx.fill();
          eyes([[-6, -88], [6, -88]], 2.6);
        }
      }
      ctx.restore();

      function rimRect(x, y, w, h) { ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.4; ctx.strokeRect(x, y, w, h); }
    }

    function monsterPalette(m) {
      return { body: "#161c33", dark: "#0c1022", accent: m.color, eye: m.boss ? "#ff4058" : m.color, rim: hexA(m.color, 0.7) };
    }

    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      drawBackground(t);
      const gy = groundY(), k = scale();

      // shadow army behind the hunter
      for (let i = 0; i < shadows; i++) {
        const sx = heroX() - (28 + i * 22) * k, sy = gy - 4 - i * 3;
        drawHunter(sx, sy, k * (0.78 - i * 0.05), { body: "#120b26", dark: "#0a0618", accent: "#8a6bff", rim: hexA("#8a6bff", 0.55) }, "#b89cff", t + i * 300, 0.75 * hero.alpha);
      }

      // hunter
      ctx.save();
      const hx = heroX() + hero.off - hero.dodge * 26 * k;
      if (hero.fall > 0) { ctx.translate(hx, gy); ctx.rotate(-hero.fall * Math.PI / 2); ctx.translate(-hx, -gy); }
      drawHunter(hx, gy, k, { body: "#0d1430", dark: "#080c1c", accent: "#6cc7ff", rim: hexA("#4db4ff", 0.8) }, "#8fe3ff", t, hero.alpha);
      if (hero.hurt > 0) { ctx.globalAlpha = hero.hurt; drawHunter(hx, gy, k, WHITE, "#fff", t); }
      ctx.restore();

      // monster
      if (mon.data && mon.alpha > 0) {
        const mk = k * (mon.data.boss ? 1.35 : 1) * mon.scale;
        const mx = monX() + mon.off;
        ctx.save();
        ctx.globalAlpha = mon.alpha;
        drawMonster(mon.data, mx, gy, mk, monsterPalette(mon.data), t);
        if (mon.flash > 0) { ctx.globalAlpha = mon.flash * mon.alpha; drawMonster(mon.data, mx, gy, mk, WHITE, t); }
        ctx.restore();
      }

      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // overlays: slashes are particles; flashes are full-screen tints
      for (const s of slashes) drawSlash(s);
      if (redFlash > 0) { ctx.fillStyle = hexA("#ff2040", redFlash * 0.35); ctx.fillRect(0, 0, W, H); }
      if (goldFlash > 0) { ctx.fillStyle = hexA("#ffc54a", goldFlash * 0.25); ctx.fillRect(0, 0, W, H); }

      // floating text
      ctx.textAlign = "center";
      for (const f of texts) {
        const p = f.t / f.dur;
        ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        ctx.font = `700 ${f.size}px "Chakra Petch", "Arial Narrow", sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = "rgba(2,4,10,0.85)";
        const y = f.y - ease(p) * 34;
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    const slashes = [];
    function drawSlash(s) {
      const p = s.t / s.dur;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.shadowColor = s.color; ctx.shadowBlur = 18;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = s.width * (1 - p * 0.6);
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, s.r, -0.9 + p * 0.6, 0.9 + p * 0.6); ctx.stroke();
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width * 0.45;
      ctx.beginPath(); ctx.arc(-4, 0, s.r * 0.9, -0.8 + p * 0.6, 0.8 + p * 0.6); ctx.stroke();
      ctx.restore();
    }

    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dt * 1000;
        const p = Math.min(1, a.t / a.dur);
        a.fn(p);
        if (p >= 1) { anims.splice(i, 1); a.resolve(); }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.vx *= 0.98;
        if (p.life > p.max) particles.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt * 1000; if (texts[i].t > texts[i].dur) texts.splice(i, 1); }
      for (let i = slashes.length - 1; i >= 0; i--) { slashes[i].t += dt * 1000; if (slashes[i].t > slashes[i].dur) slashes.splice(i, 1); }
      shake = Math.max(0, shake - dt * 40);
      redFlash = Math.max(0, redFlash - dt * 2.2);
      goldFlash = Math.max(0, goldFlash - dt * 1.2);
      mon.flash = Math.max(0, mon.flash - dt * 5);
      hero.hurt = Math.max(0, hero.hurt - dt * 4);
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ---------- Actions ----------
    const scene = {
      setShadows(n) { shadows = Math.min(3, n); },

      async spawn(m) {
        mon.data = m; mon.alpha = 0; mon.off = W * 0.35; mon.scale = 1;
        if (m.boss) { shake = 6; }
        await tween(m.boss ? 650 : 420, (p) => { mon.off = lerp(W * 0.35, 0, ease(p)); mon.alpha = p; });
      },

      async attack({ damage, crit }) {
        const reach = Math.max(0, monX() - heroX() - 70 * scale());
        await tween(170, (p) => { hero.off = reach * ease(p); });
        slashes.push({ x: monX() - 6, y: groundY() - 44 * scale() * (mon.data?.boss ? 1.3 : 1), r: (crit ? 46 : 34) * scale(), rot: crit ? -0.5 : -0.2, width: crit ? 7 : 5, color: crit ? "#ffc54a" : "#6cc7ff", t: 0, dur: 280 });
        if (crit) slashes.push({ x: monX(), y: groundY() - 40 * scale(), r: 40 * scale(), rot: 2.4, width: 6, color: "#ffc54a", t: 0, dur: 320 });
        mon.flash = 1; shake = crit ? 10 : 5;
        burst(monX(), groundY() - 40 * scale(), crit ? "#ffc54a" : "#8fd3ff", crit ? 22 : 12, 140);
        floatText(crit ? `${damage}!` : `${damage}`, monX(), groundY() - 96 * scale(), crit ? "#ffc54a" : "#e8f4ff", crit ? 28 : 22);
        if (crit) floatText("CRITICAL", monX(), groundY() - 124 * scale(), "#ffc54a", 14);
        tween(160, (p) => { mon.off = 16 * Math.sin(p * Math.PI); });
        await tween(230, (p) => { hero.off = reach * (1 - ease(p)); });
      },

      async hurt({ damage, dodged }) {
        const reach = Math.max(0, monX() - heroX() - 70 * scale());
        await tween(190, (p) => { mon.off = -reach * easeIn(p); });
        if (dodged) {
          tween(260, (p) => { hero.dodge = Math.sin(p * Math.PI); });
          floatText("DODGE", heroX(), groundY() - 96 * scale(), "#8fe3ff", 20);
        } else {
          hero.hurt = 1; redFlash = 1; shake = 12;
          slashes.push({ x: heroX() + 8, y: groundY() - 44 * scale(), r: 30 * scale(), rot: Math.PI - 0.3, width: 5, color: "#ff4058", t: 0, dur: 260 });
          burst(heroX(), groundY() - 44 * scale(), "#ff4d67", 14, 120);
          floatText(`-${damage}`, heroX(), groundY() - 96 * scale(), "#ff4d67", 24);
        }
        await tween(260, (p) => { mon.off = -reach * (1 - ease(p)); });
      },

      async kill() {
        if (!mon.data) return;
        const color = mon.data.color;
        burst(monX(), groundY() - 40 * scale(), color, mon.data.boss ? 70 : 40, mon.data.boss ? 220 : 170);
        burst(monX(), groundY() - 40 * scale(), "#e8f4ff", 12, 120);
        if (mon.data.boss) { goldFlash = 1; shake = 14; }
        await tween(mon.data.boss ? 700 : 420, (p) => { mon.alpha = 1 - p; mon.scale = 1 - p * 0.25; });
        mon.data = null;
      },

      async extract() {
        // shadow rising where the boss fell
        burst(monX(), groundY() - 10, "#8a6bff", 60, 200);
        floatText("ARISE", monX(), groundY() - 110 * scale(), "#cfc2ff", 30);
        await wait(700);
        shadows = Math.min(3, shadows + 1);
      },

      async heal(amount) {
        burst(heroX(), groundY() - 40 * scale(), "#3ee6a0", 18, 90);
        floatText(`+${amount}`, heroX(), groundY() - 96 * scale(), "#3ee6a0", 22);
        await wait(300);
      },

      async detect() {
        floatText("DETECT", heroX(), groundY() - 110 * scale(), "#8fd3ff", 16);
        burst(heroX(), groundY() - 70 * scale(), "#8fd3ff", 10, 70);
        await wait(250);
      },

      async die() {
        redFlash = 1; shake = 16;
        await tween(700, (p) => { hero.fall = ease(p); hero.alpha = 1 - p * 0.6; });
      },

      async victory() {
        goldFlash = 1;
        for (let i = 0; i < 3; i++) burst(W * (0.3 + i * 0.2), H * 0.4, "#ffc54a", 24, 160);
        await wait(600);
      },

      destroy() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); },
    };
    return scene;
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  window.PL_Battle = { create };
})();
