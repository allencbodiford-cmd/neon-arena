const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const socket = io();

const elements = {
  speed: document.getElementById('speed'),
  lap: document.getElementById('lap'),
  position: document.getElementById('position'),
  status: document.getElementById('statusText'),
  leaderboard: document.getElementById('leaderboard'),
  raceBanner: document.getElementById('raceBanner'),
  namePrompt: document.getElementById('namePrompt'),
  playerName: document.getElementById('playerName'),
  joinBtn: document.getElementById('joinBtn'),
};

const controls = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
};

const state = {
  world: { width: 1600, height: 1200, cx: 800, cy: 600, innerR: 430, outerR: 630 },
  players: [],
  localId: null,
  localName: 'Racer 01',
  race: { phase: 'countdown', countdown: 3, laps: 3, winner: null },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function keySet(event, isDown) {
  const k = event.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') controls.throttle = isDown;
  if (k === 's' || k === 'arrowdown') controls.brake = isDown;
  if (k === 'a' || k === 'arrowleft') controls.left = isDown;
  if (k === 'd' || k === 'arrowright') controls.right = isDown;
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  keySet(e, true);
});

window.addEventListener('keyup', (e) => {
  keySet(e, false);
});

function emitInput() {
  socket.emit('input', controls);
}

setInterval(emitInput, 1000 / 60);

socket.on('welcome', (payload) => {
  state.localId = payload.id;
  state.localName = payload.name;
});

socket.on('state', (snapshot) => {
  state.world = snapshot.world;
  state.players = snapshot.players;
  state.race = snapshot.race;
  updateUI();
});

function updateUI() {
  const me = state.players.find((p) => p.id === state.localId);
  updateHUD(me);
  updateRaceBanner();
  updateLeaderboard();
}

function updateHUD(me) {
  if (!me) return;

  const speedValue = Math.round(Math.abs(me.speed) * 18);
  elements.speed.textContent = `${speedValue} km/h`;

  const laps = state.race.laps || 3;
  const lapDisplay = state.race.phase === 'finished'
    ? laps
    : Math.min(me.completedLaps + 1, laps);

  elements.lap.textContent = `Lap ${lapDisplay}/${laps}`;

  const sorted = [...state.players].sort((a, b) => {
    const diff = (b.completedLaps || 0) - (a.completedLaps || 0);
    if (diff !== 0) return diff;
    return (a.finishedAt || Infinity) - (b.finishedAt || Infinity);
  });

  const myPos = sorted.findIndex((p) => p.id === state.localId) + 1;
  elements.position.textContent = `P${myPos}`;

  const phaseText = state.race.phase === 'countdown'
    ? `Race starts in ${Math.max(state.race.countdown, 0)}`
    : state.race.phase === 'finished'
      ? `Winner: ${state.race.winner || 'Unknown'}`
      : 'Race in progress';

  elements.status.textContent = phaseText;
}

function updateRaceBanner() {
  const race = state.race;
  if (race.phase === 'countdown') {
    const value = race.countdown > 0 ? String(race.countdown) : 'GO';
    elements.raceBanner.textContent = value;
    elements.raceBanner.classList.remove('hidden');
    elements.raceBanner.classList.toggle('go', value === 'GO');
    return;
  }

  if (race.phase === 'finished') {
    const winner = race.winner ? `${race.winner} wins!` : 'Race complete!';
    elements.raceBanner.textContent = winner;
    elements.raceBanner.classList.remove('hidden');
    elements.raceBanner.classList.remove('go');
    return;
  }

  elements.raceBanner.classList.add('hidden');
}

function updateLeaderboard() {
  const sorted = [...state.players].sort((a, b) => {
    const diff = (b.completedLaps || 0) - (a.completedLaps || 0);
    if (diff !== 0) return diff;
    return (a.finishedAt || Infinity) - (b.finishedAt || Infinity);
  });

  elements.leaderboard.innerHTML = sorted
    .slice(0, 4)
    .map((player, index) => {
      const isYou = player.id === state.localId;
      const laps = player.completedLaps || 0;
      return `
        <div class="leader-row ${isYou ? 'you' : ''}">
          <span>#${index + 1}</span>
          <span>${player.name}</span>
          <span>${laps}/${state.race.laps || 3}</span>
        </div>
      `;
    })
    .join('');
}

elements.joinBtn.addEventListener('click', () => {
  const value = elements.playerName.value.trim();
  const finalName = value ? value.slice(0, 18) : 'Racer 01';
  socket.emit('setName', finalName);
  state.localName = finalName;
  elements.namePrompt.classList.add('hidden');
});

function worldToScreen(x, y, cameraX, cameraY) {
  return {
    x: x - cameraX,
    y: y - cameraY,
  };
}

function drawTrack() {
  const { cx, cy, innerR, outerR } = state.world;

  ctx.fillStyle = '#08131b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const me = state.players.find((p) => p.id === state.localId);
  let cameraX = me ? me.x - canvas.width / 2 : state.world.cx - canvas.width / 2;
  let cameraY = me ? me.y - canvas.height / 2 : state.world.cy - canvas.height / 2;

  cameraX = clamp(cameraX, 0, state.world.width - canvas.width);
  cameraY = clamp(cameraY, 0, state.world.height - canvas.height);

  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  ctx.fillStyle = '#172532';
  ctx.fillRect(0, 0, state.world.width, state.world.height);

  ctx.beginPath();
  ctx.ellipse(cx, cy, outerR, outerR * 0.56, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1f2d42';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, innerR, innerR * 0.56, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0c1824';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, outerR, outerR * 0.56, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy, innerR, innerR * 0.56, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(106, 223, 255, 0.45)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + outerR * 0.97, cy - 48);
  ctx.lineTo(cx + outerR * 0.97, cy + 48);
  ctx.strokeStyle = '#f8f9fa';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.restore();

  drawPlayers(cameraX, cameraY);
  drawMinimap();
}

function drawPlayers(cameraX, cameraY) {
  const sorted = [...state.players].sort((a, b) => {
    if (a.id === state.localId) return -1;
    if (b.id === state.localId) return 1;
    return 0;
  });

  sorted.forEach((player) => {
    const screen = worldToScreen(player.x, player.y, cameraX, cameraY);
    const isLocal = player.id === state.localId;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(player.angle);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = isLocal ? 18 : 8;

    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ecf1ff';
    ctx.fillRect(-3, -4, 6, 8);

    ctx.restore();

    const label = isLocal ? `${player.name} (YOU)` : player.name;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(label, screen.x - 18, screen.y - 22);
  });
}

function drawMinimap() {
  const mapW = 180;
  const mapH = 120;
  const x = canvas.width - mapW - 18;
  const y = canvas.height - mapH - 18;

  ctx.fillStyle = 'rgba(9, 14, 21, 0.7)';
  ctx.fillRect(x, y, mapW, mapH);

  ctx.beginPath();
  ctx.ellipse(x + mapW / 2, y + mapH / 2, mapW * 0.42, mapH * 0.30, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(99, 155, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  state.players.forEach((player) => {
    const px = (player.x / state.world.width) * mapW;
    const py = (player.y / state.world.height) * mapH;
    ctx.fillStyle = player.id === state.localId ? '#7af5ff' : player.color;
    ctx.fillRect(x + px - 3, y + py - 3, 6, 6);
  });
}

function render() {
  drawTrack();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
