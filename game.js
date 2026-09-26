(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.querySelector('#score');
  const highScoreEl = document.querySelector('#high-score');
  const livesEl = document.querySelector('#lives');
  const waveEl = document.querySelector('#wave');
  const startPanel = document.querySelector('#start-panel');
  const overPanel = document.querySelector('#game-over-panel');
  const finalScoreEl = document.querySelector('#final-score');
  const newBestEl = document.querySelector('#new-best');
  const pauseButton = document.querySelector('#pause-button');
  const pauseLabel = document.querySelector('#pause-label');

  const TAU = Math.PI * 2;
  const state = {
    width: 0, height: 0, dpr: 1, running: false, paused: false,
    score: 0, high: Number(localStorage.getItem('star-drift-best') || 0),
    lives: 3, wave: 1, lastTime: 0, shake: 0, flash: 0,
    ship: null, rocks: [], bullets: [], particles: [], stars: [],
    keys: { left: false, right: false, thrust: false, fire: false },
    camera: { vx: 0, vy: 0 }, nextShot: 0, audio: null
  };

  const random = (min, max) => min + Math.random() * (max - min);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function wrapStar(star) {
    if (star.x < 0) star.x += state.width;
    if (star.x >= state.width) star.x -= state.width;
    if (star.y < 0) star.y += state.height;
    if (star.y >= state.height) star.y -= state.height;
  }

  function edgePressure(value, size, zone) {
    if (value < zone) return -clamp((zone - value) / zone, 0, 1);
    if (value > size - zone) return clamp((value - (size - zone)) / zone, 0, 1);
    return 0;
  }

  function recycleRock(rock) {
    const margin = rock.radius + 110;
    if (rock.x >= -margin && rock.x <= state.width + margin && rock.y >= -margin && rock.y <= state.height + margin) return;

    if (Math.abs(rock.x - state.width / 2) / state.width > Math.abs(rock.y - state.height / 2) / state.height) {
      rock.x = rock.x < 0 ? state.width + margin : -margin;
      rock.y = random(-40, state.height + 40);
    } else {
      rock.y = rock.y < 0 ? state.height + margin : -margin;
      rock.x = random(-40, state.width + 40);
    }
  }

  function scrollScene(dt, ship) {
    const zoneX = clamp(state.width * .22, 92, 230);
    const zoneY = clamp(state.height * .22, 78, 170);
    const pressureX = edgePressure(ship.x, state.width, zoneX);
    const pressureY = edgePressure(ship.y, state.height, zoneY);
    const ease = pressure => Math.sign(pressure) * Math.pow(Math.abs(pressure), 1.7);
    const accelerating = state.keys.thrust;
    const targetX = accelerating && Math.sign(ship.vx) === Math.sign(pressureX) ? ship.vx * Math.abs(ease(pressureX)) : 0;
    const targetY = accelerating && Math.sign(ship.vy) === Math.sign(pressureY) ? ship.vy * Math.abs(ease(pressureY)) : 0;
    const response = 1 - Math.exp(-(accelerating ? 8 : 4.2) * dt);

    state.camera.vx += (targetX - state.camera.vx) * response;
    state.camera.vy += (targetY - state.camera.vy) * response;
    if (!accelerating && Math.abs(state.camera.vx) < .4) state.camera.vx = 0;
    if (!accelerating && Math.abs(state.camera.vy) < .4) state.camera.vy = 0;

    const dx = state.camera.vx * dt;
    const dy = state.camera.vy * dt;
    ship.x -= dx; ship.y -= dy;
    for (const rock of state.rocks) { rock.x -= dx; rock.y -= dy; }
    for (const bullet of state.bullets) { bullet.x -= dx; bullet.y -= dy; }
    for (const particle of state.particles) { particle.x -= dx; particle.y -= dy; }
    for (const star of state.stars) {
      star.x -= dx * (.16 + star.depth * .34);
      star.y -= dy * (.16 + star.depth * .34);
      wrapStar(star);
    }
  }

  function resize() {
    const oldW = state.width || innerWidth;
    const oldH = state.height || innerHeight;
    state.width = innerWidth;
    state.height = innerHeight;
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.ship) {
      state.ship.x = state.ship.x / oldW * state.width;
      state.ship.y = state.ship.y / oldH * state.height;
    }
    makeStars();
  }

  function makeStars() {
    const count = Math.max(70, Math.floor(state.width * state.height / 9000));
    state.stars = Array.from({ length: count }, () => ({
      x: Math.random() * state.width, y: Math.random() * state.height,
      size: random(.4, 1.7), alpha: random(.18, .82), pulse: random(0, TAU), depth: random(.3, 1)
    }));
  }

  function makeShip() {
    return { x: state.width / 2, y: state.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 13, invulnerable: 2.4, dead: false };
  }

  function safeRockPosition() {
    let x, y, attempts = 0;
    do {
      const side = Math.floor(Math.random() * 4);
      x = side < 2 ? random(0, state.width) : (side === 2 ? -40 : state.width + 40);
      y = side >= 2 ? random(0, state.height) : (side === 0 ? -40 : state.height + 40);
      attempts++;
    } while (state.ship && distance({ x, y }, state.ship) < 200 && attempts < 20);
    return { x, y };
  }

  function makeRock(x, y, size = 3) {
    const pos = x == null ? safeRockPosition() : { x, y };
    const radius = size === 3 ? random(35, 52) : size === 2 ? random(21, 29) : random(10, 16);
    const points = Math.floor(random(8, 13));
    return {
      ...pos, size, radius, angle: random(0, TAU), spin: random(-.65, .65),
      vx: random(-1, 1) * (48 + state.wave * 3) / Math.sqrt(size),
      vy: random(-1, 1) * (48 + state.wave * 3) / Math.sqrt(size),
      shape: Array.from({ length: points }, () => random(.72, 1.18))
    };
  }

  function beginGame() {
    unlockAudio();
    state.score = 0; state.lives = 3; state.wave = 1; state.running = true; state.paused = false;
    state.camera.vx = 0; state.camera.vy = 0;
    state.bullets = []; state.particles = []; state.rocks = []; state.ship = makeShip();
    startPanel.classList.remove('visible'); overPanel.classList.remove('visible'); pauseLabel.classList.remove('visible');
    spawnWave(); updateHud(); state.lastTime = performance.now();
  }

  function spawnWave() {
    state.rocks = [];
    const count = Math.min(3 + state.wave, 10);
    for (let i = 0; i < count; i++) state.rocks.push(makeRock());
    state.ship.invulnerable = Math.max(state.ship.invulnerable, 1.8);
    waveEl.textContent = `SECTOR ${String(state.wave).padStart(2, '0')}`;
    tone(280, .12, 'sine', .04);
    setTimeout(() => tone(420, .16, 'sine', .035), 110);
  }

  function shoot(now) {
    if (!state.ship || state.ship.dead || now < state.nextShot) return;
    const s = state.ship;
    const speed = 570;
    state.bullets.push({
      x: s.x + Math.cos(s.angle) * 18, y: s.y + Math.sin(s.angle) * 18,
      vx: s.vx + Math.cos(s.angle) * speed, vy: s.vy + Math.sin(s.angle) * speed,
      life: .82, radius: 2.2
    });
    state.nextShot = now + 145;
    s.vx -= Math.cos(s.angle) * 3; s.vy -= Math.sin(s.angle) * 3;
    tone(random(620, 760), .055, 'square', .022, 220);
  }

  function addParticles(x, y, color, amount, speed = 120) {
    for (let i = 0; i < amount; i++) {
      const angle = random(0, TAU), velocity = random(speed * .25, speed);
      state.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        life: random(.25, .85), maxLife: .85, size: random(1, 3.5), color });
    }
  }

  function splitRock(index, hitX, hitY) {
    const rock = state.rocks[index];
    state.rocks.splice(index, 1);
    const value = rock.size === 3 ? 20 : rock.size === 2 ? 50 : 100;
    state.score += value;
    if (state.score > state.high) state.high = state.score;
    addParticles(hitX, hitY, '#67e8f9', 7 + rock.size * 3, 100 + rock.size * 35);
    state.shake = Math.max(state.shake, rock.size * 2.2);
    tone(150 + (3 - rock.size) * 90, .11, 'sawtooth', .035, 70);
    if (rock.size > 1) {
      for (let i = 0; i < 2; i++) {
        const child = makeRock(rock.x, rock.y, rock.size - 1);
        child.vx += rock.vx * .35; child.vy += rock.vy * .35;
        state.rocks.push(child);
      }
    }
    updateHud();
  }

  function hitShip() {
    const ship = state.ship;
    if (!ship || ship.invulnerable > 0 || ship.dead) return;
    ship.dead = true;
    state.camera.vx = 0; state.camera.vy = 0;
    state.lives--;
    addParticles(ship.x, ship.y, '#ff4d8d', 28, 240);
    addParticles(ship.x, ship.y, '#edf7ff', 12, 150);
    state.shake = 13; state.flash = .18;
    tone(90, .5, 'sawtooth', .07, 30);
    updateHud();
    setTimeout(() => {
      if (!state.running) return;
      if (state.lives <= 0) endGame();
      else state.ship = makeShip();
    }, 1200);
  }

  function endGame() {
    state.running = false;
    const oldBest = Number(localStorage.getItem('star-drift-best') || 0);
    if (state.high > oldBest) localStorage.setItem('star-drift-best', String(state.high));
    finalScoreEl.textContent = state.score.toLocaleString();
    newBestEl.classList.toggle('visible', state.score > oldBest && state.score > 0);
    overPanel.classList.add('visible'); updateHud();
  }

  function update(dt, now) {
    for (const star of state.stars) star.pulse += dt * (.5 + star.depth);
    if (!state.running || state.paused) return;
    const ship = state.ship;
    if (ship && !ship.dead) {
      const turn = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
      ship.angle += turn * 4.3 * dt;
      if (state.keys.thrust) {
        ship.vx += Math.cos(ship.angle) * 215 * dt;
        ship.vy += Math.sin(ship.angle) * 215 * dt;
        if (Math.random() < .75) {
          const back = ship.angle + Math.PI + random(-.22, .22);
          state.particles.push({ x: ship.x - Math.cos(ship.angle) * 11, y: ship.y - Math.sin(ship.angle) * 11,
            vx: ship.vx * .15 + Math.cos(back) * random(60, 145), vy: ship.vy * .15 + Math.sin(back) * random(60, 145),
            life: random(.15, .35), maxLife: .35, size: random(1, 2.8), color: Math.random() < .5 ? '#67e8f9' : '#ff4d8d' });
        }
      }
      if (state.keys.fire) shoot(now);
      const drag = Math.pow(state.keys.thrust ? .988 : .94, dt * 60);
      ship.vx *= drag; ship.vy *= drag;
      const maxSpeed = 400, speed = Math.hypot(ship.vx, ship.vy);
      if (speed > maxSpeed) { ship.vx *= maxSpeed / speed; ship.vy *= maxSpeed / speed; }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      scrollScene(dt, ship);
      const padding = 24;
      if (ship.x < padding || ship.x > state.width - padding) {
        ship.x = clamp(ship.x, padding, state.width - padding);
      }
      if (ship.y < padding || ship.y > state.height - padding) {
        ship.y = clamp(ship.y, padding, state.height - padding);
      }
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > state.width + 40 || b.y < -40 || b.y > state.height + 40) {
        state.bullets.splice(i, 1); continue;
      }
      for (let j = state.rocks.length - 1; j >= 0; j--) {
        if (distance(b, state.rocks[j]) < state.rocks[j].radius + b.radius) {
          splitRock(j, b.x, b.y); state.bullets.splice(i, 1); break;
        }
      }
    }

    for (const rock of state.rocks) {
      rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.angle += rock.spin * dt; recycleRock(rock);
      if (ship && !ship.dead && ship.invulnerable <= 0 && distance(ship, rock) < rock.radius + ship.radius * .7) hitShip();
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 25); state.flash = Math.max(0, state.flash - dt);
    if (state.rocks.length === 0 && ship && !ship.dead) { state.wave++; spawnWave(); }
  }

  function drawShip(ship) {
    if (!ship || ship.dead || (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 9) % 2)) return;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
    ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 1.6; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, -10); ctx.lineTo(-7, 0); ctx.lineTo(-12, 10); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(103,232,249,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
    if (state.keys.thrust) {
      ctx.strokeStyle = Math.random() < .5 ? '#67e8f9' : '#ff4d8d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(random(-22, -14), 0); ctx.lineTo(-9, 5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRock(rock) {
    ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle);
    ctx.strokeStyle = rock.size === 1 ? 'rgba(237,247,255,.75)' : 'rgba(126,184,211,.7)';
    ctx.lineWidth = rock.size === 1 ? 1.4 : 1.2; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = rock.size === 1 ? 3 : 1;
    ctx.beginPath();
    rock.shape.forEach((scale, i) => {
      const a = i / rock.shape.length * TAU, r = rock.radius * scale;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(103,232,249,.13)'; ctx.beginPath();
    ctx.moveTo(-rock.radius * .35, -rock.radius * .25); ctx.lineTo(rock.radius * .15, -rock.radius * .45); ctx.lineTo(rock.radius * .4, -.05 * rock.radius); ctx.stroke();
    ctx.restore();
  }

  function render(time) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    const grd = ctx.createRadialGradient(state.width * .5, state.height * .48, 10, state.width * .5, state.height * .48, Math.max(state.width, state.height) * .75);
    grd.addColorStop(0, '#0a1730'); grd.addColorStop(.48, '#050814'); grd.addColorStop(1, '#020309');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, state.width, state.height);

    for (const s of state.stars) {
      const a = s.alpha * (.72 + Math.sin(s.pulse) * .28);
      ctx.fillStyle = `rgba(190,229,255,${a})`; ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    ctx.save();
    if (state.shake) ctx.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
    for (const rock of state.rocks) drawRock(rock);
    for (const b of state.bullets) {
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1; drawShip(state.ship); ctx.restore();

    if (state.flash > 0) { ctx.fillStyle = `rgba(255,77,141,${state.flash * 1.5})`; ctx.fillRect(0, 0, state.width, state.height); }
    ctx.fillStyle = 'rgba(103,232,249,.045)'; ctx.fillRect(0, 0, state.width, 1); ctx.fillRect(0, state.height - 1, state.width, 1);
  }

  function frame(now) {
    const dt = Math.min((now - state.lastTime) / 1000 || 0, .035); state.lastTime = now;
    update(dt, now); render(now); requestAnimationFrame(frame);
  }

  function updateHud() {
    scoreEl.textContent = String(state.score).padStart(6, '0');
    highScoreEl.textContent = String(Math.max(state.high, state.score)).padStart(6, '0');
    livesEl.innerHTML = Array.from({ length: Math.max(0, state.lives) }, () =>
      '<svg class="life-icon" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1 14 18 8 14 2 18Z" fill="none" stroke="#67e8f9" stroke-width="1.4"/></svg>'
    ).join('');
    livesEl.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'}`);
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused; pauseLabel.classList.toggle('visible', state.paused);
    pauseButton.textContent = state.paused ? '▶' : 'Ⅱ';
    if (!state.paused) state.lastTime = performance.now();
  }

  function unlockAudio() {
    if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
    if (state.audio.state === 'suspended') state.audio.resume();
  }

  function tone(frequency, duration, type = 'sine', volume = .03, endFrequency = frequency) {
    if (!state.audio) return;
    const t = state.audio.currentTime, osc = state.audio.createOscillator(), gain = state.audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain).connect(state.audio.destination); osc.start(t); osc.stop(t + duration);
  }

  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'thrust', KeyW: 'thrust', Space: 'fire' };
  addEventListener('keydown', e => {
    if (keyMap[e.code]) { state.keys[keyMap[e.code]] = true; e.preventDefault(); unlockAudio(); }
    if ((e.code === 'Enter' || e.code === 'Space') && !state.running) beginGame();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  });
  addEventListener('keyup', e => { if (keyMap[e.code]) { state.keys[keyMap[e.code]] = false; e.preventDefault(); } });
  addEventListener('blur', () => { if (state.running && !state.paused) togglePause(); });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.running && !state.paused) togglePause(); });

  document.querySelector('#start-button').addEventListener('click', beginGame);
  document.querySelector('#restart-button').addEventListener('click', beginGame);
  pauseButton.addEventListener('click', togglePause);
  document.querySelectorAll('[data-control]').forEach(button => {
    const control = button.dataset.control;
    const press = e => { e.preventDefault(); unlockAudio(); state.keys[control] = true; button.classList.add('active'); button.setPointerCapture?.(e.pointerId); };
    const release = e => { e.preventDefault(); state.keys[control] = false; button.classList.remove('active'); };
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
  resize(); updateHud(); requestAnimationFrame(frame);
})();
