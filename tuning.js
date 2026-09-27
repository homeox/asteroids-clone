(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const unlocked = params.get('dev') === 'driftlab';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const flag = (name, fallback) => {
    if (!unlocked || !params.has(name)) return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(params.get(name)).toLowerCase());
  };
  const number = (name, fallback, min, max) => {
    if (!unlocked || !params.has(name)) return fallback;
    const parsed = Number(params.get(name));
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  };

  const preset = unlocked ? params.get('preset') : null;
  const presetFlags = {
    calm: { hostiles: false, hugeAsteroids: false, volatileAsteroids: false, comets: false, enemyBases: false },
    classic: { hostiles: false, hugeAsteroids: false, volatileAsteroids: false, comets: false, enemyBases: false },
    combat: { hostiles: true, hugeAsteroids: true, volatileAsteroids: true, comets: false, enemyBases: true },
    chaos: { hostiles: true, hugeAsteroids: true, volatileAsteroids: true, comets: true, enemyBases: true }
  }[preset] || {};
  const enabled = (queryName, presetName = queryName, fallback = true) => flag(queryName, presetFlags[presetName] ?? fallback);

  window.STAR_DRIFT_TUNING = {
    dev: {
      unlocked,
      code: 'driftlab',
      startWave: number('level', 1, 1, 30),
      preset: preset || 'standard'
    },
    features: {
      hostiles: enabled('hostiles'),
      hugeAsteroids: enabled('huge', 'hugeAsteroids'),
      volatileAsteroids: enabled('volatile', 'volatileAsteroids'),
      comets: enabled('comets'),
      enemyBases: enabled('bases', 'enemyBases')
    },
    balance: {
      enemyStartWave: number('enemyWave', 1, 1, 30),
      baseStartWave: number('baseWave', 3, 1, 30),
      cometStartWave: number('cometWave', 1, 1, 30),
      asteroidDensity: number('roids', 1, .25, 3),
      enemyFrequency: number('enemyRate', 1, .25, 3),
      cometFrequency: number('cometRate', 1, .25, 3),
      baseFrequency: number('baseRate', 1, .25, 3),
      playerDamage: flag('invincible', false) ? 0 : 1
    }
  };
})();
