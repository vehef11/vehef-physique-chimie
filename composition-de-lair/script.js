const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const containerEl = document.getElementById('container');

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const BREAK_THRESHOLD = 85;
const MAX_MARGIN_FRACTION = 0.4;

// --- Définition des trois atmosphères ---
const planets = {
  earth: {
    key: 'earth',
    tabLabel: 'Terre',
    title: "La composition de l'air (Terre)",
    subtitle: "",
    bg: '#eaf4ff',
    border: '#1b3a5c',
    gases: [
      { key: 'N2', label: 'Diazote N\u2082', color: '#3b82f6', prop: 0.78, r: 6, atoms: 2 },
      { key: 'O2', label: 'Dioxygène O\u2082', color: '#ef4444', prop: 0.21, r: 6.5, atoms: 2 },
      { key: 'other', label: 'Autres gaz : CO\u2082, Ar...', short: 'Autres gaz', color: '#22c55e', prop: 0.01, r: 5, atoms: 1 }
    ]
  },
  mars: {
    key: 'mars',
    tabLabel: 'Mars',
    title: "L'atmosphère de Mars",
    subtitle: "",
    bg: '#f0a868',
    border: '#8a3d1a',
    gases: [
      { key: 'CO2', label: 'Dioxyde de carbone CO\u2082', short: 'Dioxyde de carbone', color: '#a855f7', prop: 0.95, r: 7, atoms: 3 },
      { key: 'N2', label: 'Diazote N\u2082', color: '#3b82f6', prop: 0.03, r: 6, atoms: 2 },
      { key: 'other', label: 'Autres gaz : Ar...', short: 'Autres gaz', color: '#22c55e', prop: 0.02, r: 5, atoms: 1 }
    ]
  },
  mystery: {
    key: 'mystery',
    tabLabel: 'Mystère',
    title: "",
    subtitle: "",
    bg: '#ede9fe',
    border: '#5b21b6',
    gases: [
      { key: 'N2', label: 'Diazote N\u2082', color: '#3b82f6', prop: 0.70, r: 6, atoms: 2 },
      { key: 'O2', label: 'Dioxygène O\u2082', color: '#ef4444', prop: 0.14, r: 6.5, atoms: 2 },
      { key: 'CO2', label: 'Dioxyde de carbone CO\u2082', short: 'Dioxyde de carbone', color: '#a855f7', prop: 0.10, r: 7, atoms: 3 },
      { key: 'other', label: 'Autres gaz : Ar, CH\u2084...', short: 'Autres gaz', color: '#22c55e', prop: 0.06, r: 5, atoms: 1 }
    ]
  }
};

// --- Onglet "Vie" : un rat, du dioxygène, puis plus de dioxygène ---
const vieConfig = {
  title: "La vie a besoin de dioxygène",
  subtitle: "",
  bg: '#eaf7ea',
  border: '#166534'
};

const GAS_O2 = { key: 'O2', label: 'Dioxygène O\u2082', color: '#ef4444', r: 6.5, atoms: 2 };
const GAS_CO2 = { key: 'CO2', label: 'Dioxyde de carbone CO\u2082', short: 'Dioxyde de carbone', color: '#a855f7', r: 7, atoms: 3 };
const GAS_N2 = { key: 'N2', label: 'Diazote N\u2082', color: '#3b82f6', r: 6, atoms: 2 };

// Vitesses de course du rat, en pixels par milliseconde.
const VIE_SPEED_FAST = 0.11;   // O2 > 20 %
const VIE_SPEED_SLOW = 0.04;   // 15 % <= O2 <= 20 %
const VIE_O2_SLOW_THRESHOLD = 20;
const VIE_O2_DEATH_THRESHOLD = 15;
const VIE_PAUSE_DURATION = 1300;   // arrêt au milieu, coeurs affichés pendant ce temps
const VIE_DEATH_DURATION = 900;    // durée de l'animation « il meurt »
const VIE_MARGIN = 40;             // distance aux bords où le rat fait demi-tour

let vieState = {
  totalParticles: 50,
  particles: [],
  detailedModel: true,
  o2Percent: 100,
  alive: true,
  lastFrameTime: null,
  lastEffectSpawn: 0,
  effects: [],
  rat: { x: VIE_MARGIN, dir: 1, bounce: 0, lie: 0, opacity: 1, paused: false, pauseElapsed: 0, deathElapsed: 0 },
  initialized: false
};

function addVieMolecule(gas) {
  vieState.particles.push({
    gas: gas,
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    r: gas.r,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.06,
    collides: Math.random() < 0.5
  });
}

// Répartition des molécules "autres" quand O2 diminue : le manque à gagner
// est réparti entre CO2 (70%) et N2 (30%), comme pour les autres onglets.
function computeVieMixCounts(o2Percent) {
  const total = vieState.totalParticles;
  const o2Count = Math.round(total * o2Percent / 100);
  const rest = total - o2Count;
  const co2Count = Math.round(rest * 0.7);
  const n2Count = rest - co2Count;
  return { O2: o2Count, CO2: co2Count, N2: n2Count };
}

// Transforme les molécules existantes en place (change juste leur type et leur
// rayon) plutôt que de tout recréer : les molécules d'O2 "se transforment" en
// d'autres molécules sous les yeux de l'élève, sans que l'animation ne saute.
function applyVieO2Mix(o2Percent) {
  const target = computeVieMixCounts(o2Percent);
  const byKey = { O2: [], CO2: [], N2: [] };
  vieState.particles.forEach(p => byKey[p.gas.key].push(p));

  function convert(fromKey, toGas, count) {
    const pool = byKey[fromKey];
    for (let i = 0; i < count && pool.length; i++) {
      const p = pool.pop();
      p.gas = toGas;
      p.r = toGas.r;
      byKey[toGas.key].push(p);
    }
  }

  const diffO2 = target.O2 - byKey.O2.length;
  if (diffO2 > 0) {
    let needed = diffO2;
    const fromCO2 = Math.min(needed, byKey.CO2.length);
    convert('CO2', GAS_O2, fromCO2);
    needed -= fromCO2;
    if (needed > 0) convert('N2', GAS_O2, needed);
  } else if (diffO2 < 0) {
    const toConvert = -diffO2;
    const toCO2 = Math.round(toConvert * 0.7);
    const toN2 = toConvert - toCO2;
    convert('O2', GAS_CO2, toCO2);
    convert('O2', GAS_N2, toN2);
  }

  vieState.o2Percent = o2Percent;
}

function setVieO2Percent(o2Percent) {
  applyVieO2Mix(o2Percent);
  const wasAlive = vieState.alive;
  vieState.alive = o2Percent >= VIE_O2_DEATH_THRESHOLD;
  if (wasAlive && !vieState.alive) {
    vieState.rat.deathElapsed = 0;
    vieState.effects.push({
      type: 'skull',
      x: vieState.rat.x,
      y: (canvas.height - 50) - 60,
      spawnTime: performance.now(),
      life: 1500
    });
  }
  updateVieCounter();
}

function initVie() {
  vieState.initialized = true;
  vieState.totalParticles = 50;
  vieState.o2Percent = 100;
  vieState.alive = true;
  vieState.lastFrameTime = null;
  vieState.lastEffectSpawn = 0;
  vieState.effects = [];
  vieState.rat = { x: VIE_MARGIN, dir: 1, bounce: 0, lie: 0, opacity: 1, paused: false, pauseElapsed: 0, deathElapsed: 0 };
  vieState.particles = [];
  for (let i = 0; i < vieState.totalParticles; i++) addVieMolecule(GAS_O2);

  const killEl = document.getElementById('vieKillRange');
  const labelEl = document.getElementById('vieO2Label');
  if (killEl) killEl.value = 0;
  if (labelEl) labelEl.textContent = '100% O₂';
}

function updateVieRat(dt, now) {
  const rat = vieState.rat;

  if (!vieState.alive) {
    rat.deathElapsed += dt;
    rat.lie = Math.min(1, rat.deathElapsed / VIE_DEATH_DURATION);
    rat.bounce = 0;
    return;
  }

  if (rat.lie > 0) {
    rat.lie = Math.max(0, rat.lie - dt / 400);
  }

  const centerX = canvas.width / 2;

  if (rat.paused) {
    rat.pauseElapsed += dt;
    rat.bounce = Math.abs(Math.sin(now / 200)) * 2;
    if (rat.pauseElapsed >= VIE_PAUSE_DURATION) {
      rat.paused = false;
    }
    return;
  }

  const speedPxMs = vieState.o2Percent > VIE_O2_SLOW_THRESHOLD ? VIE_SPEED_FAST : VIE_SPEED_SLOW;
  const prevX = rat.x;
  let newX = rat.x + rat.dir * speedPxMs * dt;

  if (newX >= canvas.width - VIE_MARGIN) { newX = canvas.width - VIE_MARGIN; rat.dir = -1; }
  if (newX <= VIE_MARGIN) { newX = VIE_MARGIN; rat.dir = 1; }

  const crossedCenter = (prevX - centerX) * (newX - centerX) < 0;
  rat.x = newX;
  rat.bounce = Math.abs(Math.sin(now / (vieState.o2Percent > VIE_O2_SLOW_THRESHOLD ? 110 : 230))) * 4;

  if (crossedCenter) {
    rat.x = centerX;
    rat.paused = true;
    rat.pauseElapsed = 0;
  }
}

function updateVieEffects(now) {
  const rat = vieState.rat;
  if (vieState.alive && rat.paused) {
    if (now - vieState.lastEffectSpawn > 450) {
      vieState.lastEffectSpawn = now;
      vieState.effects.push({
        type: 'heart',
        x: rat.x + (Math.random() - 0.5) * 30,
        y: (canvas.height - 50) - 55 + (Math.random() - 0.5) * 10,
        spawnTime: now,
        life: 1300
      });
    }
  }
  vieState.effects = vieState.effects.filter(e => now - e.spawnTime < e.life);
}

function updateVie(now) {
  if (!vieState.initialized) initVie();
  let dt = 16;
  if (vieState.lastFrameTime) dt = Math.min(now - vieState.lastFrameTime, 50);
  vieState.lastFrameTime = now;

  for (const p of vieState.particles) {
    p.x += p.vx * speed;
    p.y += p.vy * speed;
    p.angle += p.spin * speed;
  }
  if (vieState.particles.length > 1) resolveCollisions(vieState.particles);
  for (const p of vieState.particles) {
    if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; }
    if (p.x + p.r > canvas.width) { p.x = canvas.width - p.r; p.vx *= -1; }
    if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; }
    if (p.y + p.r > canvas.height) { p.y = canvas.height - p.r; p.vy *= -1; }
  }

  updateVieRat(dt, now);
  updateVieEffects(now);
}

function drawRat(rat, groundY) {
  const x = rat.x;
  const y = groundY - rat.bounce;
  const lie = rat.lie;
  const bodyScaleY = 1 - 0.65 * lie;
  const bodyCenterY = -12 + 8 * lie;

  ctx.save();
  ctx.globalAlpha = rat.opacity;
  ctx.translate(x, y);
  ctx.scale(rat.dir >= 0 ? 1 : -1, 1);

  ctx.strokeStyle = '#a8845c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, bodyCenterY + 2);
  ctx.quadraticCurveTo(-26, bodyCenterY - 6, -30, bodyCenterY + 4);
  ctx.stroke();

  ctx.fillStyle = '#9a7a55';
  ctx.beginPath();
  ctx.ellipse(0, bodyCenterY, 16, 10 * bodyScaleY, 0, 0, Math.PI * 2);
  ctx.fill();

  const headX = 15, headY = bodyCenterY - 2 * bodyScaleY;
  ctx.beginPath();
  ctx.ellipse(headX, headY, 8, 7 * bodyScaleY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(headX + 2, headY - 6 * bodyScaleY, 4, 0, Math.PI * 2);
  ctx.arc(headX - 5, headY - 6 * bodyScaleY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2a1c10';
  ctx.beginPath();
  ctx.arc(headX + 4, headY, lie > 0.7 ? 1 : 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headX + 8, headY + 1, 1.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(-9, bodyCenterY + 7 * bodyScaleY, 3, 5 * bodyScaleY);
  ctx.fillRect(4, bodyCenterY + 7 * bodyScaleY, 3, 5 * bodyScaleY);

  // Goutte de sueur : au-delà de 70 °C, le rat souffre de la chaleur.
  // Forme classique : pointe en haut, renflement rond en bas.
  if (lie < 0.5 && getTempC() > 70) {
    const dropX = headX - 9;
    const dropY = headY - 19 * bodyScaleY + Math.sin(performance.now() / 300) * 3;
    const bulbR = 6;
    const tipY = dropY - bulbR * 2.2;
    ctx.fillStyle = '#5fa8e8';
    ctx.beginPath();
    ctx.moveTo(dropX, tipY);
    ctx.quadraticCurveTo(dropX + bulbR, dropY - bulbR * 0.7, dropX + bulbR, dropY);
    ctx.arc(dropX, dropY, bulbR, 0, Math.PI, false);
    ctx.quadraticCurveTo(dropX - bulbR, dropY - bulbR * 0.7, dropX, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(dropX - 2, dropY - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glaçon : en dessous de 0 °C, le rat a froid.
  if (lie < 0.5 && getTempC() < 0) {
    const iceX = headX - 4;
    const iceY = headY - 20 * bodyScaleY;
    const iceSize = 14;
    ctx.save();
    ctx.translate(iceX, iceY);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#bfe6ff';
    ctx.fillRect(-iceSize / 2, -iceSize / 2, iceSize, iceSize);
    ctx.strokeStyle = '#8fcbf0';
    ctx.lineWidth = 1;
    ctx.strokeRect(-iceSize / 2, -iceSize / 2, iceSize, iceSize);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-iceSize / 2 + 2, -iceSize / 2 + 2, 4, 4);
    ctx.restore();
  }

  ctx.restore();
}

function drawEffect(effect, now) {
  const age = now - effect.spawnTime;
  const lifeFrac = age / effect.life;
  let alpha;
  if (lifeFrac < 0.2) alpha = lifeFrac / 0.2;
  else if (lifeFrac > 0.7) alpha = 1 - (lifeFrac - 0.7) / 0.3;
  else alpha = 1;
  const y = effect.y - age * 0.02;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(effect.type === 'heart' ? '💗' : '💀', effect.x, y);
  ctx.restore();
}

function updateVieCounter() {
  const counts = { O2: 0, CO2: 0, N2: 0 };
  vieState.particles.forEach(p => { if (counts[p.gas.key] !== undefined) counts[p.gas.key]++; });
  updateLegendCounts(counts);
  document.getElementById('counter').textContent = '';
}

function drawVieStatusBanner(o2Percent) {
  const text = o2Percent > VIE_O2_SLOW_THRESHOLD ? 'O\u2082 suffisant' : 'O\u2082 insuffisant';
  const color = o2Percent > VIE_O2_SLOW_THRESHOLD ? '#16a34a' : '#dc2626';
  if (!text) return;

  ctx.save();
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + 40, boxH = 46;
  const boxX = canvas.width / 2 - boxW / 2, boxY = 14;

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, boxY + boxH / 2 + 9);
  ctx.restore();
}

function drawVie() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const groundY = canvas.height - 50;

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 14);
  ctx.lineTo(canvas.width, groundY + 14);
  ctx.stroke();

  vieState.particles.forEach(p => drawMolecule(vieState, p));
  vieState.effects.forEach(e => drawEffect(e, performance.now()));
  drawRat(vieState.rat, groundY);
  drawVieStatusBanner(vieState.o2Percent);
  drawThermometer();
}

let currentKey = 'earth';
let running = true;
let speed = 1;

// --- Gestion des particules ---
function getBounds(state) {
  const minDim = Math.min(canvas.width, canvas.height);
  let margin = 0;
  if (!state.wallsBroken) {
    margin = (state.wallLevel / 100) * MAX_MARGIN_FRACTION * minDim;
  }
  return {
    left: margin,
    top: margin,
    right: canvas.width - margin,
    bottom: canvas.height - margin
  };
}

function addMolecule(planet, gas) {
  const r = gas.r;
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  const vx = (Math.random() - 0.5) * 2;
  const vy = (Math.random() - 0.5) * 2;
  planet.state.particles.push({
    gas: gas,
    x: x, y: y, vx: vx, vy: vy, r: r,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.06,
    collides: Math.random() < 0.5
  });
}

function createParticles(planet) {
  const state = planet.state;
  state.particles = [];
  state.wallsBroken = false;
  const gases = planet.gases;
  let allocated = 0;
  const counts = [];
  for (let i = 0; i < gases.length - 1; i++) {
    const c = Math.round(state.totalParticles * gases[i].prop);
    counts.push(c);
    allocated += c;
  }
  counts.push(state.totalParticles - allocated);
  gases.forEach((g, i) => {
    for (let j = 0; j < counts[i]; j++) addMolecule(planet, g);
  });
}

function checkBreak(planet) {
  const state = planet.state;
  if (!state.wallsBroken && state.pressure >= BREAK_THRESHOLD) {
    breakWalls(planet);
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Une hausse de pression (curseur) fait légèrement monter la température (pas l'inverse).
function bumpTemperature(pressureDelta) {
  if (pressureDelta <= 0) return;
  const speedRange = document.getElementById('speedRange');
  const bump = pressureDelta * 0.004;
  speed = Math.min(3, speed + bump);
  speedRange.value = speed.toFixed(2);
  updateTempDisplay(speed);
}

// Recalcule la pression réelle = niveau du curseur + bonus automatique (molécules / température).
// C'est cette valeur totale qui déclenche l'explosion, mais SEUL wallLevel fait rétrécir le cadre.
function recomputePressure(planet) {
  const state = planet.state;
  state.pressure = Math.max(0, state.wallLevel + state.extraPressure);
  if (planet.key === currentKey) updatePressureLabel(planet);
  checkBreak(planet);
}

// Déplacement direct du curseur "Pression" : seul ce geste fait rétrécir le cadre.
function setWallLevel(planet, newValue) {
  const state = planet.state;
  newValue = Math.min(100, Math.max(0, Math.round(newValue)));
  const oldWallLevel = state.wallLevel;
  state.wallLevel = newValue;
  if (newValue > oldWallLevel) bumpTemperature(newValue - oldWallLevel);
  if (planet.key === currentKey) {
    document.getElementById('pressureRange').value = newValue;
  }
  recomputePressure(planet);
}

// Bonus de pression automatique (nombre de molécules ou température) : augmente la pression réelle
// (et peut donc provoquer l'explosion), mais ne fait jamais rétrécir visuellement le cadre.
function bumpExtraPressure(planet, delta, cascadeTemp) {
  const state = planet.state;
  state.extraPressure = Math.max(0, state.extraPressure + delta);
  if (delta > 0 && cascadeTemp) bumpTemperature(delta);
  recomputePressure(planet);
}

function resetPressureState(planet) {
  const state = planet.state;
  state.wallLevel = 0;
  state.extraPressure = 0;
  state.pressure = 0;
  if (planet.key === currentKey) {
    document.getElementById('pressureRange').value = 0;
  }
}

function breakWalls(planet) {
  const state = planet.state;
  state.wallsBroken = true;
  state.breakTime = performance.now();
  const cx = canvas.width / 2, cy = canvas.height / 2;
  state.particles.forEach(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const kick = 2 + Math.random() * 3;
    p.vx += (dx / dist) * kick;
    p.vy += (dy / dist) * kick;
  });
  if (planet.key === currentKey) updatePressureLabel(planet);
}

// --- Simulation physique ---
function resolveCollisions(particles) {
  const collidables = particles.filter(p => p.collides);
  for (let i = 0; i < collidables.length; i++) {
    for (let j = i + 1; j < collidables.length; j++) {
      const a = collidables[i], b = collidables[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.r + b.r;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;
        const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
        const rel = dvx * nx + dvy * ny;
        if (rel < 0) {
          a.vx += rel * nx;
          a.vy += rel * ny;
          b.vx -= rel * nx;
          b.vy -= rel * ny;
        }
      }
    }
  }
}

function update(planet) {
  const state = planet.state;
  const bounds = getBounds(state);
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * speed;
    p.y += p.vy * speed;
    p.angle += p.spin * speed;
  }
  if (state.particles.length > 1) resolveCollisions(state.particles);
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    if (!state.wallsBroken) {
      if (p.x - p.r < bounds.left) { p.x = bounds.left + p.r; p.vx *= -1; }
      if (p.x + p.r > bounds.right) { p.x = bounds.right - p.r; p.vx *= -1; }
      if (p.y - p.r < bounds.top) { p.y = bounds.top + p.r; p.vy *= -1; }
      if (p.y + p.r > bounds.bottom) { p.y = bounds.bottom - p.r; p.vy *= -1; }
    } else {
      if (p.x < -p.r * 3 || p.x > canvas.width + p.r * 3 ||
          p.y < -p.r * 3 || p.y > canvas.height + p.r * 3) {
        state.particles.splice(i, 1);
      }
    }
  }
}

// --- Rendu ---
function pressureColor(t) {
  t = Math.min(Math.max(t, 0), 1);
  const c1 = [27, 58, 92];
  const c2 = [220, 38, 38];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function tempColor(t) {
  t = Math.min(Math.max(t, 0), 1);
  const c1 = [59, 130, 246];
  const c2 = [220, 38, 38];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function drawThermometer() {
  const minSlider = 0.2, maxSlider = 3;
  const frac = Math.min(Math.max((speed - minSlider) / (maxSlider - minSlider), 0), 1);
  const color = tempColor(frac);

  const panelW = 54, panelH = 118;
  const panelX = canvas.width - panelW - 12;
  const panelY = 12;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.strokeStyle = 'rgba(27,58,92,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fill();
  ctx.stroke();

  const tubeWidth = 12, tubeHeight = 68, bulbR = 10;
  const tubeX = panelX + panelW / 2;
  const tubeTop = panelY + 10;
  const tubeBottom = tubeTop + tubeHeight;
  const bulbCenterY = tubeBottom + bulbR - 2;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(ctx, tubeX - tubeWidth / 2, tubeTop, tubeWidth, tubeHeight, tubeWidth / 2);
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.3;
  roundRect(ctx, tubeX - tubeWidth / 2, tubeTop, tubeWidth, tubeHeight, tubeWidth / 2);
  ctx.stroke();

  const fillHeight = tubeHeight * frac;
  const fillTop = tubeBottom - fillHeight;
  ctx.save();
  roundRect(ctx, tubeX - tubeWidth / 2 + 2, tubeTop + 2, tubeWidth - 4, tubeHeight - 4, (tubeWidth - 4) / 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(tubeX - tubeWidth / 2, fillTop, tubeWidth, tubeHeight);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(tubeX, bulbCenterY, bulbR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  const tempValue = Math.round(-20 + frac * (120 - (-20)));
  ctx.fillStyle = '#1b3a5c';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(tempValue + ' °C', tubeX, bulbCenterY + bulbR + 16);
  ctx.restore();
}

function drawAtom(x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMolecule(state, p) {
  const gas = p.gas;
  if (!state.detailedModel || gas.atoms === 1) {
    drawAtom(p.x, p.y, gas.r, gas.color);
    return;
  }
  const atomR = gas.r * 0.6;
  const step = gas.r * 1.1;
  const dx = Math.cos(p.angle) * step;
  const dy = Math.sin(p.angle) * step;
  const x1 = p.x - dx, y1 = p.y - dy;
  const x2 = p.x + dx, y2 = p.y + dy;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (gas.atoms === 2) {
    drawAtom(x1, y1, atomR, gas.color);
    drawAtom(x2, y2, atomR, gas.color);
  } else if (gas.atoms === 3) {
    // CO2 : deux atomes d'oxygène (rouge) autour d'un atome de carbone (noir)
    const oxygenColor = '#ef4444';
    const carbonColor = '#1f2937';
    drawAtom(x1, y1, atomR, oxygenColor);
    drawAtom(p.x, p.y, atomR, carbonColor);
    drawAtom(x2, y2, atomR, oxygenColor);
  }
}

function draw(planet) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const state = planet.state;
  if (!state.wallsBroken) {
    const bounds = getBounds(state);
    ctx.strokeStyle = pressureColor(state.pressure / 100);
    ctx.lineWidth = 4;
    ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  } else {
    const elapsed = performance.now() - (state.breakTime || 0);
    if (elapsed < 400) {
      ctx.fillStyle = `rgba(220,38,38,${0.35 * (1 - elapsed / 400)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  state.particles.forEach(p => drawMolecule(state, p));
  drawThermometer();
}

// --- Interface : légende, compteur, onglets ---
function renderLegend(planet) {
  const el = document.getElementById('legend');
  el.innerHTML = '';
  el.setAttribute('data-count', planet.gases.length);
  planet.gases.forEach(g => {
    const div = document.createElement('div');
    div.className = 'legend-item';
    const shortLabel = g.short || g.label;
    div.innerHTML = `<div class="legend-item-top"><span class="dot" style="background:${g.color};"></span><span class="legend-label-full">${g.label}</span><span class="legend-label-short">${shortLabel}</span></div><span class="legend-count" id="count-${g.key}">0</span>`;
    el.appendChild(div);
  });
}

function updateLegendCounts(counts) {
  Object.keys(counts).forEach(key => {
    const el = document.getElementById('count-' + key);
    if (el) el.textContent = counts[key] + ' molécules';
  });
}

function updateCounter() {
  const planet = planets[currentKey];
  const state = planet.state;
  const counts = {};
  planet.gases.forEach(g => counts[g.key] = 0);
  state.particles.forEach(p => counts[p.gas.key]++);
  updateLegendCounts(counts);

  if (state.wallsBroken && state.particles.length === 0) {
    document.getElementById('counter').textContent =
      '⚠️ Toutes les molécules se sont échappées ! Cliquez sur « Réinitialiser » pour recommencer.';
    return;
  }

  const modelText = state.detailedModel ? ' (modèle détaillé)' : '';
  const brokenText = state.wallsBroken ? '  —  parois brisées, fuite en cours...' : '';
  document.getElementById('counter').textContent = `${modelText}${brokenText}`.trim();
}

function updatePressureLabel(planet) {
  const state = planet.state;
  const label = document.getElementById('pressureLabel');
  if (state.wallsBroken) {
    label.textContent = '💥 Parois brisées !';
    label.style.color = '#dc2626';
  } else if (state.pressure >= BREAK_THRESHOLD - 15) {
    label.textContent = `Critique (${state.pressure})`;
    label.style.color = '#ea580c';
  } else if (state.pressure >= 40) {
    label.textContent = `Élevée (${state.pressure})`;
    label.style.color = '#b45309';
  } else {
    label.textContent = `Normale (${state.pressure})`;
    label.style.color = '#1b3a5c';
  }
}

// ================= Onglet Quizz : associer chaque diagramme en colonnes à sa planète =================
// Les hauteurs des colonnes réutilisent directement les vraies proportions (planets[key].gases[i].prop),
// donc si ces valeurs changent un jour, le quizz reste automatiquement cohérent avec la simulation.
const QUIZ_PLANET_KEYS = ['earth', 'mars', 'mystery'];
// Échelle commune aux 3 diagrammes : 100% de composition = cette hauteur de barre, en px.
// Le graphique est plus petit sur mobile (.quiz-chart réduit), donc l'échelle doit l'être aussi,
// sinon une barre proche de 100% (ex. le CO2 de Mars) dépasse en haut de sa carte.
function getQuizMaxBarHeight() {
  return window.innerWidth <= 640 ? 66 : 95;
}
const QUIZ_PHOTOS = {
  earth: { url: 'https://commons.wikimedia.org/wiki/Special:FilePath/The_Blue_Marble_(remastered).jpg?width=300' },
  mars: { url: 'https://commons.wikimedia.org/wiki/Special:FilePath/OSIRIS_Mars_true_color.jpg?width=300' },
  mystery: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Artist's_impression_of_an_exoplanet_(ann12064c).jpg?width=300" }
};

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuizChart(container, planetKey) {
  container.innerHTML = '';
  planets[planetKey].gases.forEach(g => {
    const col = document.createElement('div');
    col.className = 'quiz-bar-col';

    const bar = document.createElement('div');
    bar.className = 'quiz-bar';
    bar.style.height = Math.max(4, g.prop * getQuizMaxBarHeight()) + 'px';
    bar.style.background = g.key === 'CO2'
      ? 'repeating-linear-gradient(45deg, #ef4444 0px, #ef4444 6px, #1f2937 6px, #1f2937 12px)'
      : g.color;

    const label = document.createElement('div');
    label.className = 'quiz-bar-label';
    label.innerHTML = '<span>' + (QUIZ_FORMULA[g.key] || g.key) + '</span>';

    col.appendChild(bar);
    col.appendChild(label);
    container.appendChild(col);
  });
}

const QUIZ_FORMULA = { N2: 'N\u2082', O2: 'O\u2082', CO2: 'CO\u2082', other: 'Autres' };
// Mini icône "modèle détaillé" (boules-et-bâtons). Le CO2 garde ses couleurs chimiques rouge/noir
// (oxygène/carbone), et sa barre reprend ces mêmes couleurs en rayures pour qu'on puisse relier
// les deux sans ambiguïté.
function miniMoleculeSVG(gas) {
  if (gas.atoms === 1) {
    return `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="${gas.color}"/></svg>`;
  }
  if (gas.atoms === 2) {
    return `<svg width="30" height="18" viewBox="0 0 30 18">
      <line x1="7" y1="9" x2="23" y2="9" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>
      <circle cx="7" cy="9" r="6" fill="${gas.color}"/>
      <circle cx="23" cy="9" r="6" fill="${gas.color}"/>
    </svg>`;
  }
  return `<svg width="42" height="18" viewBox="0 0 42 18">
    <line x1="7" y1="9" x2="35" y2="9" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>
    <circle cx="7" cy="9" r="5.5" fill="#ef4444"/>
    <circle cx="21" cy="9" r="5.5" fill="#1f2937"/>
    <circle cx="35" cy="9" r="5.5" fill="#ef4444"/>
  </svg>`;
}

function dropZoneUnderPoint(x, y) {
  const zones = document.querySelectorAll('.quiz-dropzone, .quiz-bank');
  for (const z of zones) {
    const r = z.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
  }
  return null;
}

let quizDrag = null;
function finishQuizDrag(img, x, y) {
  img.classList.remove('dragging');
  img.style.position = '';
  img.style.left = '';
  img.style.top = '';
  img.style.width = '';
  img.style.height = '';
  document.querySelectorAll('.quiz-dropzone').forEach(z => z.classList.remove('hover'));

  const target = dropZoneUnderPoint(x, y);
  const bank = document.getElementById('quizBank');

  if (target && target.classList.contains('quiz-dropzone')) {
    const existing = target.querySelector('.quiz-photo');
    if (existing && existing !== img) bank.appendChild(existing);
    target.appendChild(img);
  } else {
    bank.appendChild(img);
  }
  document.querySelectorAll('.quiz-dropzone').forEach(z => {
    z.classList.toggle('filled', !!z.querySelector('.quiz-photo'));
  });
  quizDrag = null;
}

function attachQuizDrag(img) {
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    quizDrag = { el: img };
    img.classList.add('dragging');
    img.style.width = rect.width + 'px';
    img.style.height = rect.height + 'px';
    img.style.left = (rect.left) + 'px';
    img.style.top = (rect.top) + 'px';
    img.dataset.grabX = e.clientX - rect.left;
    img.dataset.grabY = e.clientY - rect.top;
    document.body.appendChild(img);
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', (e) => {
    if (!quizDrag || quizDrag.el !== img) return;
    img.style.left = (e.clientX - parseFloat(img.dataset.grabX)) + 'px';
    img.style.top = (e.clientY - parseFloat(img.dataset.grabY)) + 'px';
    document.querySelectorAll('.quiz-dropzone').forEach(z => z.classList.remove('hover'));
    const target = dropZoneUnderPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('quiz-dropzone')) target.classList.add('hover');
  });
  img.addEventListener('pointerup', (e) => {
    if (!quizDrag || quizDrag.el !== img) return;
    finishQuizDrag(img, e.clientX, e.clientY);
  });
  img.addEventListener('pointercancel', (e) => {
    if (!quizDrag || quizDrag.el !== img) return;
    finishQuizDrag(img, e.clientX, e.clientY);
  });
}

function makeQuizPhotoEl(planetKey) {
  const img = document.createElement('img');
  img.className = 'quiz-photo';
  img.src = QUIZ_PHOTOS[planetKey].url;
  img.alt = 'Photo de planète à identifier';
  img.draggable = false;
  img.dataset.planet = planetKey;
  attachQuizDrag(img);
  return img;
}

function initQuiz() {
  const columnsEl = document.getElementById('quizColumns');
  const bankEl = document.getElementById('quizBank');
  columnsEl.innerHTML = '';
  bankEl.innerHTML = '';

  shuffleArray(QUIZ_PLANET_KEYS).forEach(planetKey => {
    const col = document.createElement('div');
    col.className = 'quiz-col';
    const chart = document.createElement('div');
    chart.className = 'quiz-chart';
    buildQuizChart(chart, planetKey);
    const zone = document.createElement('div');
    zone.className = 'quiz-dropzone';
    zone.dataset.answer = planetKey;
    col.appendChild(chart);
    col.appendChild(zone);
    columnsEl.appendChild(col);
  });

  shuffleArray(QUIZ_PLANET_KEYS).forEach(planetKey => {
    bankEl.appendChild(makeQuizPhotoEl(planetKey));
  });
}

// Le résultat ne s'affiche pas en bas : il clignote 5 fois, bien visible, au-dessus de l'animation.
function flashQuizResult(text, correct) {
  const zone = document.getElementById('quizFlashZone');
  zone.textContent = text;
  zone.classList.remove('blinking', 'flash-correct', 'flash-wrong');
  void zone.offsetWidth;
  zone.classList.add(correct ? 'flash-correct' : 'flash-wrong');
  zone.style.display = 'block';
  void zone.offsetWidth;
  zone.classList.add('blinking');
  setTimeout(() => {
    zone.style.display = 'none';
    zone.classList.remove('blinking');
  }, 1350);
}

document.getElementById('quizCheckBtn').addEventListener('click', function () {
  const zones = document.querySelectorAll('.quiz-dropzone');
  let allFilled = true;
  let allCorrect = true;
  zones.forEach(zone => {
    const photo = zone.querySelector('.quiz-photo');
    if (!photo) { allFilled = false; return; }
    if (photo.dataset.planet !== zone.dataset.answer) allCorrect = false;
  });
  if (!allFilled) {
    flashQuizResult('Place les 3 photos avant de vérifier.', false);
    return;
  }
  flashQuizResult(allCorrect ? '✅ Parfait !' : '❌ C\'est faux...', allCorrect);
});
document.getElementById('quizResetBtn').addEventListener('click', initQuiz);

// ================= Onglet Questions à faire : le chien qui court puis nous fixe =================
let finalTimers = [];
function initFinalTab() {
  finalTimers.forEach(t => clearTimeout(t));
  finalTimers = [];

  const dogRun = document.getElementById('finalDogRun');
  const dogGlare = document.getElementById('finalDogGlare');
  const track = document.getElementById('finalDogTrack');

  dogGlare.style.display = 'none';
  dogRun.style.display = 'inline-block';
  dogRun.style.transition = 'none';
  dogRun.style.left = '0px';

  const runDuration = 1800;

  requestAnimationFrame(() => {
    const trackWidth = Math.max(40, track.getBoundingClientRect().width - 44);
    requestAnimationFrame(() => {
      dogRun.style.transition = `left ${runDuration}ms linear`;
      dogRun.style.left = trackWidth + 'px';
    });
  });

  finalTimers.push(setTimeout(() => {
    dogRun.style.display = 'none';
    dogGlare.style.display = 'inline-block';
  }, runDuration + 100));
}

function switchTab(key) {
  currentKey = key;

  document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab_' + key).classList.add('active');

  document.getElementById('mysteryBanner').style.display = (key === 'mystery') ? 'block' : 'none';

  const isRappels = key === 'rappels';
  const isQuiz = key === 'quiz';
  const isFinal = key === 'final';
  const isSpecial = isRappels || isQuiz || isFinal;
  containerEl.classList.toggle('quiz-mode', isQuiz);
  canvas.style.display = isSpecial ? 'none' : 'block';
  document.getElementById('rappelsContent').style.display = isRappels ? 'flex' : 'none';
  document.getElementById('quizContent').style.display = isQuiz ? 'flex' : 'none';
  document.getElementById('finalContent').style.display = isFinal ? 'flex' : 'none';
  document.getElementById('legend').style.display = isSpecial ? 'none' : 'flex';
  document.getElementById('tempRow').style.display = isSpecial ? 'none' : 'flex';
  document.getElementById('buttonRow').style.display = isSpecial ? 'none' : 'flex';
  document.getElementById('counter').style.display = isSpecial ? 'none' : 'block';
  document.getElementById('vieRatRow').style.display = (key === 'vie') ? 'flex' : 'none';

  if (isRappels) {
    containerEl.style.background = '#f5f3ff';
    containerEl.style.borderColor = '#6d28d9';
    document.getElementById('title').textContent = 'Rappels de calculs';
    document.getElementById('subtitle').textContent = '';
    document.getElementById('moleculeRow').style.display = 'none';
    document.getElementById('pressureRow').style.display = 'none';
    return;
  }

  if (isQuiz) {
    containerEl.style.background = '#fef3e2';
    containerEl.style.borderColor = '#7c2d12';
    document.getElementById('title').textContent = 'Quizz : associe chaque atmosphère à sa planète';
    document.getElementById('subtitle').textContent = '';
    document.getElementById('moleculeRow').style.display = 'none';
    document.getElementById('pressureRow').style.display = 'none';
    initQuiz();
    return;
  }

  if (isFinal) {
    containerEl.style.background = '#eef6ff';
    containerEl.style.borderColor = '#1b3a5c';
    document.getElementById('title').textContent = 'Questions à faire';
    document.getElementById('subtitle').textContent = '';
    document.getElementById('moleculeRow').style.display = 'none';
    document.getElementById('pressureRow').style.display = 'none';
    initFinalTab();
    return;
  }

  if (key === 'vie') {
    containerEl.style.background = vieConfig.bg;
    containerEl.style.borderColor = vieConfig.border;
    document.getElementById('title').textContent = vieConfig.title;
    document.getElementById('subtitle').textContent = vieConfig.subtitle;
    renderLegend({ gases: [GAS_O2, GAS_CO2, GAS_N2] });
    document.getElementById('moleculeRow').style.display = 'none';
    document.getElementById('pressureRow').style.display = 'none';
    document.getElementById('btnDetail').style.display = 'none';
    if (!vieState.initialized) initVie();
    updateVieCounter();
    return;
  }

  document.getElementById('moleculeRow').style.display = 'flex';
  document.getElementById('pressureRow').style.display = 'flex';
  document.getElementById('btnDetail').style.display = 'inline-block';

  const planet = planets[key];
  containerEl.style.background = planet.bg;
  containerEl.style.borderColor = planet.border;
  document.getElementById('title').textContent = planet.title;
  document.getElementById('subtitle').textContent = planet.subtitle;
  renderLegend(planet);

  document.getElementById('moleculeRange').value = planet.state.totalParticles;
  document.getElementById('moleculeLabel').textContent = planet.state.totalParticles;
  document.getElementById('pressureRange').value = planet.state.wallLevel;
  document.getElementById('btnDetail').textContent = planet.state.detailedModel
    ? 'Modèle simple'
    : 'Modèle détaillé';

  updatePressureLabel(planet);
  updateCounter();
}

// --- Initialisation des trois planètes ---
Object.values(planets).forEach(planet => {
  planet.state = {
    totalParticles: 150,
    pressure: 0,
    wallLevel: 0,
    extraPressure: 0,
    wallsBroken: false,
    detailedModel: false,
    particles: [],
    breakTime: 0
  };
  createParticles(planet);
});

document.getElementById('tab_earth').addEventListener('click', () => switchTab('earth'));
document.getElementById('tab_mars').addEventListener('click', () => switchTab('mars'));
document.getElementById('tab_mystery').addEventListener('click', () => switchTab('mystery'));
document.getElementById('tab_vie').addEventListener('click', () => switchTab('vie'));
document.getElementById('tab_rappels').addEventListener('click', () => switchTab('rappels'));
document.getElementById('tab_quiz').addEventListener('click', () => switchTab('quiz'));
document.getElementById('tab_final').addEventListener('click', () => switchTab('final'));

document.getElementById('toggleBtn').addEventListener('click', function () {
  running = !running;
  this.textContent = running ? 'Pause' : 'Reprendre';
});

const tempLabel = document.getElementById('tempLabel');
function sliderToTempC(sliderValue) {
  const minSlider = 0.2, maxSlider = 3;
  const minTemp = -20, maxTemp = 120;
  return minTemp + (sliderValue - minSlider) * (maxTemp - minTemp) / (maxSlider - minSlider);
}
function getTempC() {
  return sliderToTempC(speed);
}
function updateTempDisplay(sliderValue) {
  tempLabel.textContent = Math.round(sliderToTempC(sliderValue)) + ' °C';
}
document.getElementById('speedRange').addEventListener('input', function () {
  const oldSpeed = speed;
  speed = parseFloat(this.value);
  updateTempDisplay(speed);
  if (currentKey !== 'vie' && speed > oldSpeed) {
    const planet = planets[currentKey];
    bumpExtraPressure(planet, (speed - oldSpeed) * 15, false);
  }
});
updateTempDisplay(speed);

document.getElementById('moleculeRange').addEventListener('input', function () {
  const planet = planets[currentKey];
  const oldTotal = planet.state.totalParticles;
  const newTotal = parseInt(this.value, 10);
  planet.state.totalParticles = newTotal;
  document.getElementById('moleculeLabel').textContent = newTotal;
  createParticles(planet);
  bumpExtraPressure(planet, (newTotal - oldTotal) * 0.15, true);
  updateCounter();
});

document.getElementById('btnDetail').addEventListener('click', function () {
  const planet = planets[currentKey];
  planet.state.detailedModel = !planet.state.detailedModel;
  this.textContent = planet.state.detailedModel
    ? 'Modèle simple'
    : 'Modèle détaillé';
  updateCounter();
});

document.getElementById('pressureRange').addEventListener('input', function () {
  const planet = planets[currentKey];
  setWallLevel(planet, parseInt(this.value, 10));
});

document.getElementById('resetBtn').addEventListener('click', function () {
  if (currentKey === 'vie') {
    initVie();
    updateVieCounter();
    return;
  }
  const planet = planets[currentKey];
  createParticles(planet);
  resetPressureState(planet);
  updatePressureLabel(planet);
  updateCounter();
});

const vieKillRange = document.getElementById('vieKillRange');
const vieO2Label = document.getElementById('vieO2Label');
vieKillRange.addEventListener('input', function () {
  const kill = parseFloat(this.value);
  const o2Percent = 100 - kill;
  vieO2Label.textContent = Math.round(o2Percent) + '% O₂';
  setVieO2Percent(o2Percent);
});

switchTab('final');

function loop() {
  if (running && currentKey !== 'rappels' && currentKey !== 'quiz' && currentKey !== 'final') {
    if (currentKey === 'vie') {
      updateVie(performance.now());
      drawVie();
      updateVieCounter();
    } else {
      const planet = planets[currentKey];
      update(planet);
      draw(planet);
      updateCounter();
    }
  }
  requestAnimationFrame(loop);
}
loop();
