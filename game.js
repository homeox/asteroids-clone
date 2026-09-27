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
  const ROCK_PALETTES = [
    { light: '#8097aa', base: '#40586b', dark: '#1c2b3b', edge: '#b8d0df', dust: '#d4e1e7' },
    { light: '#947d76', base: '#5a4541', dark: '#2d2225', edge: '#d0b2a8', dust: '#e1c4b8' },
    { light: '#78978d', base: '#405e58', dark: '#1b302f', edge: '#aed0c6', dust: '#cbe0d7' },
    { light: '#8c789c', base: '#554368', dark: '#2a2138', edge: '#c6add8', dust: '#dac9e5' },
    { light: '#a09369', base: '#655b39', dark: '#332d1c', edge: '#d8c999', dust: '#eadfb8' },
    { light: '#7693a8', base: '#385a73', dark: '#182d42', edge: '#a8d6eb', dust: '#d0ecf5' }
  ];
  const VOLATILE_PALETTE = { light: '#c86d60', base: '#7c302f', dark: '#35171d', edge: '#ff9b7a', dust: '#ffc18e' };
  const state = {
    width: 0, height: 0, dpr: 1, running: false, paused: false,
    score: 0, high: Number(localStorage.getItem('star-drift-best') || 0),
    lives: 3, wave: 1, lastTime: 0, shake: 0, flash: 0,
    ship: null, rocks: [], bullets: [], enemyBullets: [], debris: [], enemies: [], comets: [], particles: [], stars: [],
    keys: { left: false, right: false, thrust: false, fire: false },
    camera: { vx: 0, vy: 0 }, nextShot: 0, rockTimer: 5, enemyTimer: 12, cometTimer: 14,
    elapsed: 0, enemyAlert: 0, cometAlert: 0, audio: null
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

  function edgePressure(value, size, zone, inset) {
    const ramp = zone - inset;
    if (value < zone) return -clamp((zone - value) / ramp, 0, 1);
    if (value > size - zone) return clamp((value - (size - zone)) / ramp, 0, 1);
    return 0;
  }

  function cameraBounds() {
    return {
      insetX: clamp(state.width * .11, 72, 126),
      insetY: clamp(state.height * .12, 60, 100),
      zoneX: clamp(state.width * .34, 120, 320),
      zoneY: clamp(state.height * .32, 96, 230)
    };
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
    const { insetX, insetY, zoneX, zoneY } = cameraBounds();
    const pressureX = edgePressure(ship.x, state.width, zoneX, insetX);
    const pressureY = edgePressure(ship.y, state.height, zoneY, insetY);
    const followGain = pressure => Math.pow(Math.abs(pressure), 1.25) * 2.6;
    const accelerating = state.keys.thrust;
    const targetX = accelerating && Math.sign(ship.vx) === Math.sign(pressureX) ? ship.vx * followGain(pressureX) : 0;
    const targetY = accelerating && Math.sign(ship.vy) === Math.sign(pressureY) ? ship.vy * followGain(pressureY) : 0;
    const response = 1 - Math.exp(-(accelerating ? 12 : 4.2) * dt);

    state.camera.vx += (targetX - state.camera.vx) * response;
    state.camera.vy += (targetY - state.camera.vy) * response;
    if (!accelerating && Math.abs(state.camera.vx) < .4) state.camera.vx = 0;
    if (!accelerating && Math.abs(state.camera.vy) < .4) state.camera.vy = 0;

    const dx = state.camera.vx * dt;
    const dy = state.camera.vy * dt;
    ship.x -= dx; ship.y -= dy;
    for (const rock of state.rocks) { rock.x -= dx; rock.y -= dy; }
    for (const bullet of state.bullets) { bullet.x -= dx; bullet.y -= dy; }
    for (const bullet of state.enemyBullets) { bullet.x -= dx; bullet.y -= dy; }
    for (const shard of state.debris) { shard.x -= dx; shard.y -= dy; }
    for (const enemy of state.enemies) { enemy.x -= dx; enemy.y -= dy; }
    for (const comet of state.comets) { comet.x -= dx; comet.y -= dy; }
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
    return { x: state.width / 2, y: state.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 18, invulnerable: 2.4, dead: false };
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

  function makeRock(x, y, size = 3, explosiveOverride = null) {
    const pos = x == null ? safeRockPosition() : { x, y };
    const radius = size === 4 ? random(62, 86) : size === 3 ? random(36, 54) : size === 2 ? random(21, 31) : random(10, 17);
    const points = Math.floor(random(size === 4 ? 11 : 8, size === 4 ? 16 : 13));
    const craterCount = Math.floor(random(1, size + 3));
    const explosiveChance = Math.min(.28, .1 + state.wave * .018);
    const explosive = size >= 2 && (explosiveOverride == null ? Math.random() < explosiveChance : explosiveOverride);
    const palette = explosive ? VOLATILE_PALETTE : ROCK_PALETTES[Math.floor(Math.random() * ROCK_PALETTES.length)];
    return {
      ...pos, size, radius, angle: random(0, TAU), spin: random(-.65, .65),
      vx: random(-1, 1) * (48 + state.wave * 3) / Math.sqrt(size),
      vy: random(-1, 1) * (48 + state.wave * 3) / Math.sqrt(size),
      palette, explosive,
      shape: Array.from({ length: points }, (_, i) => clamp(random(.76, 1.16) + (i % 3 === 0 ? random(-.12, .08) : 0), .64, 1.2)),
      craters: Array.from({ length: craterCount }, () => ({
        angle: random(0, TAU), distance: random(.08, .5), radius: random(.09, .2),
        squash: random(.55, .9), rotation: random(0, TAU)
      })),
      ridges: Array.from({ length: Math.floor(random(2, size + 4)) }, () => ({
        angle: random(0, TAU), inner: random(.05, .3), outer: random(.45, .82), bend: random(-.18, .18)
      }))
    };
  }

  function makeEnemy() {
    const pos = safeRockPosition();
    const angle = state.ship ? Math.atan2(state.ship.y - pos.y, state.ship.x - pos.x) : random(0, TAU);
    const health = Math.min(4, 2 + Math.floor(state.wave / 4));
    return {
      ...pos, vx: Math.cos(angle) * 45, vy: Math.sin(angle) * 45, angle,
      radius: 18, health, maxHealth: health, shootTimer: random(.8, 1.8),
      age: 0, phase: random(0, TAU), turnBias: random(-1, 1)
    };
  }

  function makeComet() {
    const horizontal = Math.random() < .58;
    const fromStart = Math.random() < .5;
    const speed = random(520, 690) + Math.min(120, state.wave * 9);
    let x, y, angle;
    if (horizontal) {
      x = fromStart ? -90 : state.width + 90;
      y = random(state.height * .14, state.height * .86);
      angle = (fromStart ? 0 : Math.PI) + random(-.24, .24);
    } else {
      x = random(state.width * .14, state.width * .86);
      y = fromStart ? -90 : state.height + 90;
      angle = (fromStart ? Math.PI / 2 : -Math.PI / 2) + random(-.24, .24);
    }
    return {
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      angle, radius: random(15, 23), age: 0, spin: random(-3.5, 3.5), rotation: random(0, TAU),
      hue: Math.random() < .68 ? 'orange' : 'cyan'
    };
  }

  function beginGame() {
    unlockAudio();
    state.score = 0; state.lives = 3; state.wave = 1; state.running = true; state.paused = false;
    state.camera.vx = 0; state.camera.vy = 0;
    state.elapsed = 0; state.rockTimer = 5; state.enemyTimer = random(5.5, 8); state.cometTimer = random(10, 15);
    state.enemyAlert = 0; state.cometAlert = 0;
    state.bullets = []; state.enemyBullets = []; state.debris = []; state.enemies = []; state.comets = [];
    state.particles = []; state.rocks = []; state.ship = makeShip();
    startPanel.classList.remove('visible'); overPanel.classList.remove('visible'); pauseLabel.classList.remove('visible');
    spawnWave(); updateHud(); state.lastTime = performance.now();
  }

  function spawnWave() {
    state.rocks = [];
    const count = Math.min(4 + Math.floor(state.wave * 1.45), 18);
    for (let i = 0; i < count; i++) {
      const colossalChance = Math.min(.34, .1 + state.wave * .035);
      const size = Math.random() < colossalChance ? 4 : 3;
      state.rocks.push(makeRock(undefined, undefined, size, i === 0 ? true : null));
    }
    state.rockTimer = Math.max(1.25, 5.4 - state.wave * .32) + random(0, 1.4);
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
      x: s.x + Math.cos(s.angle) * 29, y: s.y + Math.sin(s.angle) * 29,
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

  function fireEnemy(enemy) {
    if (!state.ship || state.ship.dead) return;
    const dx = state.ship.x - enemy.x;
    const dy = state.ship.y - enemy.y;
    const distanceToShip = Math.max(1, Math.hypot(dx, dy));
    const bulletSpeed = Math.min(330, 230 + state.wave * 7);
    const travelTime = distanceToShip / bulletSpeed;
    const aimX = state.ship.x + state.ship.vx * travelTime * .32;
    const aimY = state.ship.y + state.ship.vy * travelTime * .32;
    const angle = Math.atan2(aimY - enemy.y, aimX - enemy.x) + random(-.055, .055);
    state.enemyBullets.push({
      x: enemy.x + Math.cos(angle) * 21, y: enemy.y + Math.sin(angle) * 21,
      vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
      angle, life: 4.5, radius: 4
    });
    tone(random(185, 225), .12, 'square', .026, 105);
  }

  function damageEnemy(index, x, y) {
    const enemy = state.enemies[index];
    enemy.health--;
    addParticles(x, y, '#ff9b54', 7, 105);
    state.shake = Math.max(state.shake, 2.5);
    tone(260, .07, 'sawtooth', .028, 130);
    if (enemy.health <= 0) {
      state.score += 300 + state.wave * 25;
      if (state.score > state.high) state.high = state.score;
      addParticles(enemy.x, enemy.y, '#ff4d8d', 24, 230);
      addParticles(enemy.x, enemy.y, '#67e8f9', 12, 160);
      state.shake = Math.max(state.shake, 9);
      tone(105, .38, 'sawtooth', .06, 38);
      state.enemies.splice(index, 1);
      updateHud();
    }
  }

  function detonateRock(rock) {
    const shardCount = 6 + rock.size * 2;
    for (let i = 0; i < shardCount; i++) {
      const angle = i / shardCount * TAU + random(-.16, .16);
      const speed = random(155, 285) + rock.size * 18;
      state.debris.push({
        x: rock.x + Math.cos(angle) * rock.radius * .2,
        y: rock.y + Math.sin(angle) * rock.radius * .2,
        vx: rock.vx * .25 + Math.cos(angle) * speed,
        vy: rock.vy * .25 + Math.sin(angle) * speed,
        angle, spin: random(-8, 8), radius: random(3.5, 6.5), life: random(2.2, 3.6)
      });
    }
    addParticles(rock.x, rock.y, '#ff553d', 34, 290);
    addParticles(rock.x, rock.y, '#ffcf6e', 20, 210);
    state.shake = Math.max(state.shake, 14); state.flash = Math.max(state.flash, .14);
    tone(72, .48, 'sawtooth', .075, 28);
  }

  function splitRock(index, hitX, hitY) {
    const rock = state.rocks[index];
    state.rocks.splice(index, 1);
    const value = rock.size === 4 ? 35 : rock.size === 3 ? 55 : rock.size === 2 ? 90 : 140;
    state.score += value;
    if (state.score > state.high) state.high = state.score;
    addParticles(hitX, hitY, '#67e8f9', 7 + rock.size * 3, 100 + rock.size * 35);
    state.shake = Math.max(state.shake, rock.size * 2.2);
    tone(150 + (3 - rock.size) * 90, .11, 'sawtooth', .035, 70);
    if (rock.explosive) detonateRock(rock);
    if (rock.size > 1) {
      for (let i = 0; i < 2; i++) {
        const child = makeRock(rock.x, rock.y, rock.size - 1, false);
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
    state.elapsed += dt;
    state.enemyAlert = Math.max(0, state.enemyAlert - dt);
    state.cometAlert = Math.max(0, state.cometAlert - dt);
    const ship = state.ship;
    if (ship && !ship.dead) {
      const turn = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
      ship.angle += turn * 4.3 * dt;
      if (state.keys.thrust) {
        ship.vx += Math.cos(ship.angle) * 215 * dt;
        ship.vy += Math.sin(ship.angle) * 215 * dt;
        if (Math.random() < .75) {
          const back = ship.angle + Math.PI + random(-.22, .22);
          state.particles.push({ x: ship.x - Math.cos(ship.angle) * 14, y: ship.y - Math.sin(ship.angle) * 14,
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
      const { insetX, insetY } = cameraBounds();
      if (ship.x < insetX) {
        ship.x = insetX;
        state.camera.vx = Math.min(state.camera.vx, ship.vx * 1.35);
      } else if (ship.x > state.width - insetX) {
        ship.x = state.width - insetX;
        state.camera.vx = Math.max(state.camera.vx, ship.vx * 1.35);
      }
      if (ship.y < insetY) {
        ship.y = insetY;
        state.camera.vy = Math.min(state.camera.vy, ship.vy * 1.35);
      } else if (ship.y > state.height - insetY) {
        ship.y = state.height - insetY;
        state.camera.vy = Math.max(state.camera.vy, ship.vy * 1.35);
      }
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > state.width + 40 || b.y < -40 || b.y > state.height + 40) {
        state.bullets.splice(i, 1); continue;
      }
      let spent = false;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        if (distance(b, state.enemies[j]) < state.enemies[j].radius + b.radius) {
          damageEnemy(j, b.x, b.y); state.bullets.splice(i, 1); spent = true; break;
        }
      }
      if (spent) continue;
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

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      enemy.age += dt; enemy.shootTimer -= dt; enemy.phase += dt * 2.2;
      if (ship && !ship.dead) {
        const dx = ship.x - enemy.x, dy = ship.y - enemy.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const desiredSpeed = Math.min(155, 92 + state.wave * 4);
        const orbit = Math.sin(enemy.phase) * .34 + enemy.turnBias * .12;
        const targetVx = (dx / d * Math.cos(orbit) - dy / d * Math.sin(orbit)) * desiredSpeed;
        const targetVy = (dy / d * Math.cos(orbit) + dx / d * Math.sin(orbit)) * desiredSpeed;
        const steer = 1 - Math.exp(-1.8 * dt);
        enemy.vx += (targetVx - enemy.vx) * steer; enemy.vy += (targetVy - enemy.vy) * steer;
        enemy.angle = Math.atan2(dy, dx);
        if (enemy.shootTimer <= 0 && d < Math.max(720, state.width * .8)) {
          fireEnemy(enemy);
          enemy.shootTimer = Math.max(.72, 1.75 - state.wave * .055) + random(.25, .9);
        }
        if (enemy.age > 1.2 && d < enemy.radius + ship.radius * .75 && ship.invulnerable <= 0) {
          hitShip();
          addParticles(enemy.x, enemy.y, '#ff9b54', 16, 185);
          state.enemies.splice(i, 1); continue;
        }
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      if (enemy.age > 34 || enemy.x < -380 || enemy.x > state.width + 380 || enemy.y < -380 || enemy.y > state.height + 380) {
        state.enemies.splice(i, 1);
      }
    }

    for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -50 || b.x > state.width + 50 || b.y < -50 || b.y > state.height + 50) {
        state.enemyBullets.splice(i, 1); continue;
      }
      if (ship && !ship.dead && ship.invulnerable <= 0 && distance(b, ship) < b.radius + ship.radius * .72) {
        state.enemyBullets.splice(i, 1); hitShip();
      }
    }

    for (let i = state.debris.length - 1; i >= 0; i--) {
      const shard = state.debris[i];
      shard.x += shard.vx * dt; shard.y += shard.vy * dt; shard.angle += shard.spin * dt; shard.life -= dt;
      shard.vx *= Math.pow(.996, dt * 60); shard.vy *= Math.pow(.996, dt * 60);
      if (shard.life <= 0 || shard.x < -100 || shard.x > state.width + 100 || shard.y < -100 || shard.y > state.height + 100) {
        state.debris.splice(i, 1); continue;
      }
      if (ship && !ship.dead && ship.invulnerable <= 0 && distance(shard, ship) < shard.radius + ship.radius * .7) {
        state.debris.splice(i, 1); hitShip();
      }
    }

    for (let i = state.comets.length - 1; i >= 0; i--) {
      const comet = state.comets[i];
      comet.age += dt; comet.rotation += comet.spin * dt;
      comet.x += comet.vx * dt; comet.y += comet.vy * dt;
      const trailAngle = Math.atan2(comet.vy, comet.vx) + Math.PI + random(-.13, .13);
      const trailSpeed = random(65, 170);
      for (let p = 0; p < 2; p++) {
        state.particles.push({
          x: comet.x - Math.cos(comet.angle) * comet.radius, y: comet.y - Math.sin(comet.angle) * comet.radius,
          vx: Math.cos(trailAngle) * trailSpeed, vy: Math.sin(trailAngle) * trailSpeed,
          life: random(.35, .8), maxLife: .8, size: random(2, 5.5),
          color: comet.hue === 'cyan' ? (p ? '#67e8f9' : '#e5fcff') : (p ? '#ff5c3d' : '#ffd36e')
        });
      }
      if (ship && !ship.dead && ship.invulnerable <= 0 && distance(comet, ship) < comet.radius + ship.radius * .72) {
        hitShip(); addParticles(comet.x, comet.y, '#ffb05c', 24, 240); state.comets.splice(i, 1); continue;
      }
      if (comet.age > .7 && (comet.x < -140 || comet.x > state.width + 140 || comet.y < -140 || comet.y > state.height + 140)) {
        state.comets.splice(i, 1);
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 25); state.flash = Math.max(0, state.flash - dt);
    state.rockTimer -= dt;
    const rockCap = Math.min(24, 7 + state.wave * 2);
    if (state.wave > 1 && state.rocks.length > 0 && state.rocks.length < rockCap && state.rockTimer <= 0) {
      const reinforcementSize = state.wave >= 3 && Math.random() < .2 ? 4 : (Math.random() < .72 ? 3 : 2);
      state.rocks.push(makeRock(undefined, undefined, reinforcementSize));
      state.rockTimer = Math.max(1.05, 5.2 - state.wave * .34) + random(0, 1.1);
    }
    state.enemyTimer -= dt;
    const enemyCap = Math.min(3, 1 + Math.floor(state.wave / 5));
    if (state.enemyTimer <= 0 && state.enemies.length < enemyCap) {
      state.enemies.push(makeEnemy()); state.enemyAlert = 2.4;
      state.enemyTimer = Math.max(6.5, 14.5 - state.wave * .6) + random(1.5, 4);
      tone(165, .18, 'square', .035, 105);
      setTimeout(() => tone(125, .22, 'square', .03, 75), 150);
    }
    state.cometTimer -= dt;
    if (state.cometTimer <= 0 && state.comets.length === 0) {
      state.comets.push(makeComet()); state.cometAlert = 2.2;
      state.cometTimer = Math.max(8, 19 - state.wave * .55) + random(3, 8);
      tone(95, .65, 'sawtooth', .045, 42);
      setTimeout(() => tone(58, .75, 'sawtooth', .035, 30), 180);
    }
    if (state.rocks.length === 0 && ship && !ship.dead) { state.wave++; spawnWave(); }
  }

  function drawShip(ship, time) {
    if (!ship || ship.dead || (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 9) % 2)) return;
    const pulse = .78 + Math.sin(time * .012) * .14;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle); ctx.scale(1.18, 1.18);

    ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 18;
    const hull = ctx.createLinearGradient(-14, -12, 20, 10);
    hull.addColorStop(0, '#10283e'); hull.addColorStop(.48, '#28627c'); hull.addColorStop(1, '#0b192d');
    ctx.fillStyle = hull; ctx.strokeStyle = '#d8fbff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(5, -7); ctx.lineTo(-8, -14); ctx.lineTo(-6, -6);
    ctx.lineTo(-14, -3); ctx.lineTo(-11, 0); ctx.lineTo(-14, 3); ctx.lineTo(-6, 6);
    ctx.lineTo(-8, 14); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#234f69'; ctx.strokeStyle = 'rgba(103,232,249,.95)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(1, -5); ctx.lineTo(-5, 0); ctx.lineTo(1, 5); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#3b5872';
    ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(-7, -12); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 7); ctx.lineTo(-7, 12); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,77,141,.75)';
    ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-8, -13); ctx.moveTo(-2, 7); ctx.lineTo(-8, 13); ctx.stroke();

    const canopy = ctx.createRadialGradient(7, -2, 0, 6, 0, 7);
    canopy.addColorStop(0, '#e8fdff'); canopy.addColorStop(.25, '#67e8f9'); canopy.addColorStop(1, '#173e5b');
    ctx.fillStyle = canopy; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.ellipse(7, 0, 6.3, 3.7, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff4d8d';
    ctx.beginPath(); ctx.arc(-10, -3.2, 1.7, 0, TAU); ctx.arc(-10, 3.2, 1.7, 0, TAU); ctx.fill();
    if (state.keys.thrust) {
      const flameLength = random(17, 28);
      ctx.globalAlpha = pulse; ctx.fillStyle = '#ff4d8d'; ctx.shadowColor = '#ff4d8d'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(-11, -4.5); ctx.lineTo(-11 - flameLength, 0); ctx.lineTo(-11, 4.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dffcff'; ctx.shadowColor = '#67e8f9';
      ctx.beginPath(); ctx.moveTo(-10, -2.2); ctx.lineTo(-19 - flameLength * .45, 0); ctx.lineTo(-10, 2.2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = pulse * .7; ctx.fillStyle = '#67e8f9'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(-11, 0, 2.2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function traceRock(rock) {
    ctx.beginPath();
    rock.shape.forEach((scale, i) => {
      const a = i / rock.shape.length * TAU, r = rock.radius * scale;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  function drawEnemy(enemy, time) {
    const pulse = .72 + Math.sin(time * .015 + enemy.phase) * .2;
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(enemy.angle);
    ctx.shadowColor = '#ff4d8d'; ctx.shadowBlur = 15;
    ctx.fillStyle = '#21101e'; ctx.strokeStyle = '#ff7bab'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(21, 0); ctx.lineTo(6, -5); ctx.lineTo(-5, -15); ctx.lineTo(-2, -5);
    ctx.lineTo(-14, -9); ctx.lineTo(-9, 0); ctx.lineTo(-14, 9); ctx.lineTo(-2, 5);
    ctx.lineTo(-5, 15); ctx.lineTo(6, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#4b1733'; ctx.strokeStyle = 'rgba(255,155,84,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(1, -5); ctx.lineTo(-5, 0); ctx.lineTo(1, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffcf6e'; ctx.shadowColor = '#ff4d8d'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(8, 0, 4.8, 3.2, 0, 0, TAU); ctx.fill();

    ctx.globalAlpha = pulse; ctx.fillStyle = '#ff4d8d'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(random(-23, -17), 0); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    if (enemy.health < enemy.maxHealth) {
      const width = 28;
      ctx.fillStyle = 'rgba(2,4,8,.8)'; ctx.fillRect(-width / 2, -22, width, 3);
      ctx.fillStyle = '#ff4d8d'; ctx.fillRect(-width / 2, -22, width * enemy.health / enemy.maxHealth, 3);
    }
    ctx.restore();
  }

  function drawEnemyIndicator(enemy, time) {
    const margin = 42;
    if (enemy.x >= margin && enemy.x <= state.width - margin && enemy.y >= margin && enemy.y <= state.height - margin) return;
    const cx = state.width / 2, cy = state.height / 2;
    const angle = Math.atan2(enemy.y - cy, enemy.x - cx);
    const x = clamp(enemy.x, margin, state.width - margin);
    const y = clamp(enemy.y, margin + 35, state.height - margin);
    const pulse = .55 + Math.sin(time * .014 + enemy.phase) * .35;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff4d8d'; ctx.shadowColor = '#ff4d8d'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-4, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawComet(comet) {
    const hot = comet.hue === 'cyan' ? '#67e8f9' : '#ff6a42';
    const core = comet.hue === 'cyan' ? '#e8fdff' : '#ffe0a3';
    ctx.save(); ctx.translate(comet.x, comet.y); ctx.rotate(comet.angle);
    const tail = ctx.createLinearGradient(-95, 0, 10, 0);
    tail.addColorStop(0, 'rgba(255,77,141,0)'); tail.addColorStop(.55, `${hot}35`); tail.addColorStop(1, hot);
    ctx.fillStyle = tail; ctx.globalAlpha = .72; ctx.shadowColor = hot; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(9, -comet.radius * .55); ctx.lineTo(-random(75, 105), 0); ctx.lineTo(9, comet.radius * .55); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(-4, -5, 1, 0, 0, comet.radius * 1.15);
    glow.addColorStop(0, core); glow.addColorStop(.3, hot); glow.addColorStop(1, '#321c27');
    ctx.fillStyle = glow; ctx.strokeStyle = core; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(comet.radius, 0); ctx.lineTo(comet.radius * .38, -comet.radius * .72);
    ctx.lineTo(-comet.radius * .5, -comet.radius * .58); ctx.lineTo(-comet.radius * .85, .05 * comet.radius);
    ctx.lineTo(-comet.radius * .35, comet.radius * .7); ctx.lineTo(comet.radius * .4, comet.radius * .58); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawDebris(shard) {
    ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(shard.angle);
    ctx.fillStyle = '#ff5b42'; ctx.strokeStyle = '#ffc16e'; ctx.lineWidth = 1;
    ctx.shadowColor = '#ff4d3d'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.moveTo(shard.radius * 1.6, 0); ctx.lineTo(-shard.radius, -shard.radius * .65);
    ctx.lineTo(-shard.radius * .55, shard.radius * .78); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawRock(rock) {
    ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle);
    const palette = rock.palette || ROCK_PALETTES[0];
    const surface = ctx.createRadialGradient(-rock.radius * .34, -rock.radius * .4, rock.radius * .04, 0, 0, rock.radius * 1.18);
    surface.addColorStop(0, palette.light); surface.addColorStop(.45, palette.base); surface.addColorStop(1, palette.dark);
    traceRock(rock); ctx.fillStyle = surface; ctx.shadowColor = 'rgba(103,232,249,.24)'; ctx.shadowBlur = rock.size === 1 ? 5 : 3; ctx.fill();
    ctx.strokeStyle = palette.edge; ctx.lineWidth = rock.size === 1 ? 1.35 : 1.7; ctx.stroke(); ctx.shadowBlur = 0;

    ctx.save(); traceRock(rock); ctx.clip();
    ctx.fillStyle = 'rgba(235,248,250,.075)';
    ctx.beginPath(); ctx.moveTo(-rock.radius * .75, -rock.radius * .25); ctx.lineTo(-rock.radius * .12, -rock.radius * .72);
    ctx.lineTo(rock.radius * .2, -rock.radius * .08); ctx.closePath(); ctx.fill();
    for (const ridge of rock.ridges || []) {
      const x1 = Math.cos(ridge.angle) * rock.radius * ridge.inner;
      const y1 = Math.sin(ridge.angle) * rock.radius * ridge.inner;
      const x2 = Math.cos(ridge.angle + ridge.bend) * rock.radius * ridge.outer;
      const y2 = Math.sin(ridge.angle + ridge.bend) * rock.radius * ridge.outer;
      ctx.strokeStyle = rock.explosive ? 'rgba(255,143,77,.58)' : 'rgba(214,235,241,.11)';
      ctx.shadowColor = rock.explosive ? '#ff4d3d' : 'transparent'; ctx.shadowBlur = rock.explosive ? 6 : 0;
      ctx.lineWidth = Math.max(.6, rock.radius * (rock.explosive ? .026 : .018));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const crater of rock.craters || []) {
      const cx = Math.cos(crater.angle) * rock.radius * crater.distance;
      const cy = Math.sin(crater.angle) * rock.radius * crater.distance;
      const cr = rock.radius * crater.radius;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(crater.rotation);
      ctx.fillStyle = 'rgba(3,7,12,.32)'; ctx.strokeStyle = 'rgba(220,238,242,.18)'; ctx.lineWidth = Math.max(.55, rock.radius * .016);
      ctx.beginPath(); ctx.ellipse(0, 0, cr, cr * crater.squash, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(cr * .1, cr * .08, cr * .66, 0, Math.PI); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.globalAlpha = .28; ctx.fillStyle = palette.dust;
    ctx.beginPath(); ctx.arc(-rock.radius * .26, -rock.radius * .28, Math.max(.8, rock.radius * .035), 0, TAU); ctx.fill();
    if (rock.explosive) {
      ctx.globalAlpha = .85; ctx.fillStyle = '#ffb15c'; ctx.shadowColor = '#ff4d3d'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(rock.radius * .2, rock.radius * .08, Math.max(1.2, rock.radius * .045), 0, TAU); ctx.fill();
    }
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
    for (const comet of state.comets) drawComet(comet);
    for (const rock of state.rocks) drawRock(rock);
    for (const enemy of state.enemies) drawEnemy(enemy, time);
    for (const b of state.bullets) {
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, TAU); ctx.fill();
    }
    for (const b of state.enemyBullets) {
      const speed = Math.max(1, Math.hypot(b.vx, b.vy));
      ctx.strokeStyle = 'rgba(255,77,141,.5)'; ctx.lineWidth = 3; ctx.shadowColor = '#ff4d8d'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx / speed * 13, b.y - b.vy / speed * 13); ctx.stroke();
      ctx.fillStyle = '#ffd09d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, TAU); ctx.fill();
    }
    for (const shard of state.debris) drawDebris(shard);
    ctx.shadowBlur = 0;
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1; drawShip(state.ship, time);
    for (const enemy of state.enemies) drawEnemyIndicator(enemy, time);
    ctx.restore();

    if (state.flash > 0) { ctx.fillStyle = `rgba(255,77,141,${state.flash * 1.5})`; ctx.fillRect(0, 0, state.width, state.height); }
    if (state.enemyAlert > 0) {
      const alpha = Math.min(1, state.enemyAlert * 1.5) * (.74 + Math.sin(time * .02) * .26);
      ctx.globalAlpha = alpha; ctx.fillStyle = '#ff4d8d'; ctx.textAlign = 'center';
      ctx.font = '700 11px "Space Mono", monospace'; ctx.fillText('⚠  HOSTILE SIGNAL  ⚠', state.width / 2, 74);
      ctx.globalAlpha = 1; ctx.textAlign = 'start';
    }
    if (state.cometAlert > 0) {
      const alpha = Math.min(1, state.cometAlert * 1.5) * (.72 + Math.sin(time * .026) * .28);
      ctx.globalAlpha = alpha; ctx.fillStyle = '#ffb05c'; ctx.textAlign = 'center';
      ctx.font = '700 11px "Space Mono", monospace'; ctx.fillText('☄  COMET INBOUND  ☄', state.width / 2, state.enemyAlert > 0 ? 92 : 74);
      ctx.globalAlpha = 1; ctx.textAlign = 'start';
    }
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
