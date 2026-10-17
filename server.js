const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORLD = {
  width: 1600,
  height: 1200,
  cx: 800,
  cy: 600,
  innerR: 430,
  outerR: 630,
  roadW: 200,
};

const players = new Map();

function randomColor() {
  const palette = ['#ff4d6d', '#ffb703', '#48cae4', '#90be6d', '#f72585', '#7bdff2', '#ffd166', '#c77dff'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(a) {
  let angle = a;
  while (angle < 0) angle += Math.PI * 2;
  while (angle > Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

function makePlayer(id, name) {
  const spawnAngle = (Math.random() * Math.PI * 2);
  return {
    id,
    name: name || `Racer ${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    color: randomColor(),
    x: WORLD.cx + Math.cos(spawnAngle) * 500,
    y: WORLD.cy + Math.sin(spawnAngle) * 500,
    angle: spawnAngle + Math.PI / 2,
    speed: 0,
    lap: 1,
    progress: 0.15,
    lastProgress: 0.15,
    bestLap: 0,
    input: {},
  };
}

function dragPlayer(player) {
  const dx = player.x - WORLD.cx;
  const dy = player.y - WORLD.cy;
  const dist = Math.hypot(dx, dy);

  if (dist > WORLD.outerR - 30 || dist < WORLD.innerR + 30) {
    player.speed *= 0.93;
  } else {
    player.speed *= 0.986;
  }

  player.x = clamp(player.x, 60, WORLD.width - 60);
  player.y = clamp(player.y, 60, WORLD.height - 60);
}

function updatePlayer(player, input) {
  if (!player) return;

  const accel = 0.32;
  const brake = 0.52;
  const turnRate = 0.045;
  const maxSpeed = 9.5;

  if (input.throttle) {
    player.speed += accel;
  }
  if (input.brake) {
    player.speed -= brake;
  }
  if (input.left) {
    player.angle += turnRate * (0.55 + Math.abs(player.speed) * 0.16);
  }
  if (input.right) {
    player.angle -= turnRate * (0.55 + Math.abs(player.speed) * 0.16);
  }

  player.speed *= 0.992;
  player.speed = clamp(player.speed, -3.5, maxSpeed);

  player.x += Math.cos(player.angle) * player.speed;
  player.y += Math.sin(player.angle) * player.speed;

  const dx = player.x - WORLD.cx;
  const dy = player.y - WORLD.cy;
  const dist = Math.hypot(dx, dy);

  if (dist > WORLD.outerR - 30 || dist < WORLD.innerR + 30) {
    player.speed *= 0.92;
  }

  const wrapped = Math.atan2(dy, dx);
  const progress = normalizeAngle(wrapped + Math.PI) / (Math.PI * 2);

  if (player.speed > 1.5) {
    const delta = progress - player.lastProgress;
    if (delta < -0.7) {
      player.lap += 1;
    }
    player.lastProgress = progress;
  }

  player.progress = progress;
  player.x = clamp(player.x, 40, WORLD.width - 40);
  player.y = clamp(player.y, 40, WORLD.height - 40);

  const trackDist = Math.abs(dist - (WORLD.innerR + WORLD.outerR) / 2);
  if (trackDist > WORLD.roadW / 2) {
    player.speed *= 0.94;
  }

  dragPlayer(player);
}

io.on('connection', (socket) => {
  const playerName = `Racer ${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const player = makePlayer(socket.id, playerName);
  players.set(socket.id, player);

  socket.emit('welcome', {
    id: socket.id,
    name: player.name,
  });

  socket.on('setName', (name) => {
    if (typeof name === 'string' && name.trim()) {
      player.name = name.trim().slice(0, 18);
    }
  });

  socket.on('input', (input) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.input = {
      throttle: !!input.throttle,
      brake: !!input.brake,
      left: !!input.left,
      right: !!input.right,
    };
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
  });
});

setInterval(() => {
  for (const player of players.values()) {
    updatePlayer(player, player.input || {});
  }

  const snapshot = Array.from(players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    angle: player.angle,
    speed: player.speed,
    lap: player.lap,
    progress: player.progress,
  }));

  io.emit('state', { players: snapshot, world: WORLD });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Racer server running on http://localhost:${PORT}`);
});
