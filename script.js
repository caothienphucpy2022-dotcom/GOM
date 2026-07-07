const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W, H;
function resize() {
  W = canvas.clientWidth;
  H = Math.max(420, Math.floor(W * 1.4));
  canvas.width = Math.floor(W * devicePixelRatio);
  canvas.height = Math.floor(H * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// game state
const GROUND_Y = 420;
let keys = {};
let last = performance.now();
let elapsed = 0;
let score = 0;
let level = 1;
let selectedSkin = 0;
let selectedLevel = 1;
const LEVEL_COUNTS = [2, 4, 6];
const HISTORY_KEY = "comet_history";
let comets = [];
let golds = [];
let bullets = [];
let particles = [];
let goldCollected = 0;
let gameState = "menu"; // 'menu' | 'playing' | 'gameover'
// limits
const MAX_ACTIVE_COMETS = 3;
const playerSprites = new Image();
let playerSpriteLoaded = false;
playerSprites.src = "img/plays.png";
playerSprites.onload = () => {
  playerSpriteLoaded = true;
};
// gold spawn timing
let goldSpawnTimer = 0;
let goldSpawnInterval = 2.0;
let goldSpawnMax = 2;

class Player {
  constructor() {
    this.w = 32;
    this.h = 48;
    this.x = 80;
    this.y = GROUND_Y - this.h;
    this.vx = 0;
    this.vy = 0;
    this.speed = 220;
    this.jump = 520;
    this.onGround = true;
  }
  update(dt) {
    if (keys["ArrowLeft"] || keys["a"]) this.vx = -this.speed;
    else if (keys["ArrowRight"] || keys["d"]) this.vx = this.speed;
    else this.vx = 0;
    this.x += this.vx * dt;
    this.vy += 1400 * dt;
    this.y += this.vy * dt;
    if (this.y + this.h >= GROUND_Y) {
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.onGround = true;
    } else this.onGround = false;
    this.x = Math.max(10, Math.min(W - this.w - 10, this.x));
  }
  jump() {
    if (this.onGround) {
      this.vy = -this.jump;
      this.onGround = false;
    }
  }
  draw(ctx) {
    ctx.save();
    if (playerSpriteLoaded) {
      const frameW = playerSprites.width / 4;
      const frameH = playerSprites.height;
      const sx = selectedSkin * frameW;
      ctx.drawImage(
        playerSprites,
        sx,
        0,
        frameW,
        frameH,
        this.x - 4,
        this.y,
        this.w,
        this.h,
      );
    } else {
      ctx.fillStyle = "#cfefff";
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#98f1ff";
      ctx.fillRect(this.x + 6, this.y + 6, 12, 12);
    }
    ctx.restore();
  }
}

class Comet {
  // warmupTime seconds on sky; fallTime seconds to reach ground after warmup
  constructor(fallTime = 2.0, warmupTime = 1.7) {
    this.targetR = 12 + Math.random() * 20;
    this.r = 5;
    this.x = 20 + Math.random() * Math.max(0, W - 40);
    this.y = -this.r - Math.random() * 160;
    this.vx = 0;
    this.vy = 0;
    this.flash = 1;
    this.state = "warmup";
    this.warmupTime = warmupTime;
    this.timer = 0;
    this.fallTime = fallTime;
    this.finalVx = -40 + Math.random() * 80;
    this.g = 0;
  }
  update(dt) {
    if (this.state === "warmup") {
      this.timer += dt;
      const t = Math.min(1, this.timer / this.warmupTime);
      this.r = 5 + (this.targetR - 5) * t;
      this.flash = 0.6 + 0.4 * Math.sin(this.timer * 12);
      if (this.timer >= this.warmupTime) {
        const distance = GROUND_Y - this.r - this.y;
        const tfall = Math.max(0.2, this.fallTime);
        this.g = (2 * distance) / (tfall * tfall);
        this.vy = 0;
        this.vx = this.finalVx;
        this.state = "active";
      }
    } else {
      this.vy += this.g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.flash -= dt * 1.2;
      if (this.flash < 0) this.flash = 0;
    }
  }
  draw(ctx) {
    ctx.save();
    const g = ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      this.r,
    );
    g.addColorStop(0, "#fff4d0");
    g.addColorStop(0.4, "#ffb86b");
    g.addColorStop(1, "#ff6b2f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    if (this.state === "warmup") {
      ctx.globalAlpha = 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(this.timer * 8)));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

class Gold {
  // warmup then fall
  constructor(fallTime = 2.0, warmupTime = 1.7) {
    this.targetR = 8 + Math.random() * 6;
    this.r = 5;
    this.x = 20 + Math.random() * Math.max(0, W - 40);
    this.y = -this.r - Math.random() * 120;
    this.vx = -20 + Math.random() * 40;
    this.vy = 0;
    this.collected = false;
    this.state = "warmup";
    this.timer = 0;
    this.warmupTime = warmupTime;
    this.fallTime = fallTime;
    this.g = 0;
  }
  update(dt) {
    if (this.state === "warmup") {
      this.timer += dt;
      const t = Math.min(1, this.timer / this.warmupTime);
      this.r = 5 + (this.targetR - 5) * t;
      if (this.timer >= this.warmupTime) {
        const distance = GROUND_Y - this.r - this.y;
        const tfall = Math.max(0.2, this.fallTime);
        this.g = (2 * distance) / (tfall * tfall);
        this.vy = 0;
        this.state = "active";
      }
    } else {
      this.vy += this.g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
  }
  draw(ctx) {
    ctx.save();
    const g = ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      this.r,
    );
    g.addColorStop(0, "#fff7b0");
    g.addColorStop(0.5, "#ffd24d");
    g.addColorStop(1, "#ffb800");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function pickFallTime() {
  const choices = [3.0, 2.0, 1.5];
  const weights = [0.2, 0.6, 0.2];
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < choices.length; i++) {
    acc += weights[i];
    if (r <= acc) return choices[i];
  }
  return 2.0;
}

function spawnGoldWave(count) {
  for (let i = 0; i < count; i++) {
    const ft = pickFallTime();
    const g = new Gold(ft, 1.7);
    const playerCenter = player.x + player.w / 2;
    let attempts = 0;
    let chosenX = g.x;
    // 40% chance to aim at player (spawn above player with small jitter)
    if (Math.random() < 0.4) {
      const jitter = -15 + Math.random() * 30;
      chosenX = Math.max(20, Math.min(W - 20, playerCenter + jitter));
    } else {
      while (attempts < 8) {
        const candidate = 20 + Math.random() * Math.max(0, W - 40);
        if (Math.abs(candidate - playerCenter) > 55 || Math.random() > 0.15) {
          chosenX = candidate;
          break;
        }
        attempts++;
      }
    }
    g.x = chosenX;
    golds.push(g);
  }
}

function spawnCometWave(count) {
  for (let i = 0; i < count; i++) {
    const ft = pickFallTime();
    const c = new Comet(ft, 1.7);
    const playerCenter = player.x + player.w / 2;
    let attempts = 0;
    let chosenX = c.x;
    // 40% chance to aim at player
    if (Math.random() < 0.4) {
      const jitter = -15 + Math.random() * 30;
      chosenX = Math.max(20, Math.min(W - 20, playerCenter + jitter));
    } else {
      while (attempts < 8) {
        const candidate = 20 + Math.random() * Math.max(0, W - 40);
        if (Math.abs(candidate - playerCenter) > 55 || Math.random() > 0.15) {
          chosenX = candidate;
          break;
        }
        attempts++;
      }
    }
    c.x = chosenX;
    comets.push(c);
  }
}

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vy = -700;
    this.r = 5;
  }
  update(dt) {
    this.y += this.vy * dt;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#ffd24d";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, life, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color || "#ffd24d";
    this.r = 3 + Math.random() * 3;
  }
  update(dt) {
    this.vy += 800 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function rectCircleCollide(px, py, pw, ph, cx, cy, cr) {
  const nearestX = Math.max(px, Math.min(cx, px + pw));
  const nearestY = Math.max(py, Math.min(cy, py + ph));
  const dx = cx - nearestX,
    dy = cy - nearestY;
  return dx * dx + dy * dy < cr * cr;
}

const player = new Player();

function update(dt) {
  if (gameState !== "playing") return;
  elapsed += dt;
  document.getElementById("time").textContent = "Time: " + elapsed.toFixed(2);
  player.update(dt);
  // update comets
  for (let i = comets.length - 1; i >= 0; i--) {
    comets[i].update(dt);
    if (comets[i].y - comets[i].r > H + 50) comets.splice(i, 1);
  }
  // update golds
  for (let i = golds.length - 1; i >= 0; i--) {
    golds[i].update(dt);
    if (golds[i].y - golds[i].r > H + 50) golds.splice(i, 1);
  }
  // comet wave spawn based on selected level: 2, 4, or 6 per wave
  if (Math.random() < 0.008 + Math.min(0.18, elapsed * 0.002 + level * 0.006)) {
    const desired = LEVEL_COUNTS[selectedLevel - 1] || LEVEL_COUNTS[0];
    const allowed = Math.max(0, desired - comets.length);
    const count = Math.min(desired, allowed);
    if (count > 0) spawnCometWave(count);
  }
  // gold waves by timer
  goldSpawnTimer += dt;
  // gold spawn rule: first 30s spawn max 3, then every 60s add +1
  let dynamicGoldMax = 3;
  if (elapsed > 30) {
    dynamicGoldMax = 3 + Math.floor((elapsed - 30) / 60);
  }
  if (goldSpawnTimer >= goldSpawnInterval) {
    goldSpawnTimer = 0;
    const count = 1 + Math.floor(Math.random() * dynamicGoldMax);
    spawnGoldWave(count);
  }
  // collisions
  for (const c of comets) {
    if (
      rectCircleCollide(player.x, player.y, player.w, player.h, c.x, c.y, c.r)
    ) {
      gameOver();
      return;
    }
  }
  for (let i = golds.length - 1; i >= 0; i--) {
    const g = golds[i];
    if (
      rectCircleCollide(player.x, player.y, player.w, player.h, g.x, g.y, g.r)
    ) {
      goldCollected++;
      // create explosion particles at gold location
      for (let p = 0; p < 14; p++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 240;
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp * 0.6 - 60;
        const life = 0.5 + Math.random() * 0.5;
        const col = p % 2 ? "#ffd24d" : "#ffb800";
        particles.push(new Particle(g.x, g.y, vx, vy, life, col));
      }
      golds.splice(i, 1);
      document.getElementById("score").textContent = "Gold: " + goldCollected;
    }
  }

  // update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const pr = particles[i];
    pr.update(dt);
    if (pr.life <= 0 || pr.y - pr.r > H + 50) particles.splice(i, 1);
  }
  // update bullets and check collisions with comets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt);
    if (b.y < -50) {
      bullets.splice(i, 1);
      continue;
    }
    for (let j = comets.length - 1; j >= 0; j--) {
      const c = comets[j];
      const dx = b.x - c.x,
        dy = b.y - c.y;
      if (dx * dx + dy * dy < (b.r + c.r) * (b.r + c.r)) {
        // destroy comet and bullet
        bullets.splice(i, 1);
        comets.splice(j, 1);
        // explosion fragments falling from destroyed comet
        for (let p = 0; p < 20; p++) {
          const ang = Math.random() * Math.PI * 2;
          const speed = 120 + Math.random() * 220;
          const vx = Math.cos(ang) * speed;
          const vy = Math.sin(ang) * speed * 0.7 - 80;
          const life = 0.5 + Math.random() * 0.6;
          const col = p % 2 ? "#ff9f1c" : "#ffb93b";
          particles.push(new Particle(c.x, c.y, vx, vy, life, col));
        }
        break;
      }
    }
  }
}

let running = false;
function gameOver() {
  running = false;
  gameState = "gameover";
  const bonus = Math.floor(elapsed);
  const final = goldCollected + bonus;
  document.getElementById("finalGold").textContent = final;
  document.getElementById("finalTime").textContent = elapsed.toFixed(2);
  // save score and history
  saveHighscore(final, elapsed);
  saveHistory({
    date: Date.now(),
    time: elapsed.toFixed(2),
    level: selectedLevel,
    skin: selectedSkin,
    gold: goldCollected,
  });
  document.getElementById("gameover").classList.remove("hidden");
}

function saveHighscore(gold, time) {
  try {
    const key = "comet_highscores";
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ gold: gold, time: time, date: Date.now() });
    list.sort((a, b) => b.gold - a.gold || a.time - b.time);
    localStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
  } catch (e) {
    console.error("saveHighscore", e);
  }
}

function startGame() {
  elapsed = 0;
  score = 0;
  level = selectedLevel;
  comets.length = 0;
  golds.length = 0;
  bullets.length = 0;
  particles.length = 0;
  goldCollected = 0;
  goldSpawnTimer = 0;
  goldSpawnInterval = 2.0;
  goldSpawnMax = 2;
  document.getElementById("score").textContent = "Gold: 0";
  document.getElementById("time").textContent = "Time: 0.00";
  document.getElementById("level").textContent = "Level: " + selectedLevel;
  document.getElementById("score").textContent = "Gold: 0";
  gameState = "playing";
  running = true;
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("gameover").classList.add("hidden");
}

function goHome() {
  running = false;
  gameState = "menu";
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("gameover").classList.add("hidden");
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(200,255,255,0.03)";
  ctx.lineWidth = 1;
  const step = 36;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(2,26,40,0.3)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#062a3b";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  drawGrid();
  for (const c of comets) c.draw(ctx); // Draw comets
  for (const b of bullets) b.draw(ctx); // Draw bullets
  for (const g of golds) g.draw(ctx);
  for (const p of particles) p.draw(ctx);
  player.draw(ctx);
}

function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (running) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// input
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === " " || e.key === "Spacebar") {
    player.jump();
    e.preventDefault();
  }
  // fire bullet with 'f' or 'F'
  if ((e.key === "f" || e.key === "F") && gameState === "playing") {
    if (goldCollected > 0) {
      const bx = player.x + player.w / 2;
      const by = player.y + 8; // slightly above player
      bullets.push(new Bullet(bx, by));
      goldCollected -= 1;
      document.getElementById("score").textContent = "Gold: " + goldCollected;
    }
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHistory(entry) {
  try {
    const history = loadHistory();
    history.unshift(entry);
    if (history.length > 8) history.length = 8;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch (e) {
    console.error("saveHistory", e);
  }
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const history = loadHistory();
  list.innerHTML = "";
  if (history.length === 0) {
    list.innerHTML = "<li>Chưa có lịch sử</li>";
    return;
  }
  for (const item of history) {
    const li = document.createElement("li");
    li.textContent = `${item.time}s - Lv ${item.level} - Skin ${item.skin + 1} - ${item.gold} vàng`;
    list.appendChild(li);
  }
}

function createMenuHandlers() {
  document.querySelectorAll(".skin-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSkin = Number(button.dataset.skin);
      document
        .querySelectorAll(".skin-button")
        .forEach((b) => b.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  document.querySelectorAll(".level-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLevel = Number(button.dataset.level);
      document
        .querySelectorAll(".level-button")
        .forEach((b) => b.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  document.getElementById("btnStart").addEventListener("click", startGame);
  document
    .getElementById("btnReplay")
    .addEventListener("click", () => startGame());
  document.getElementById("btnHome").addEventListener("click", () => goHome());
}

createMenuHandlers();
renderHistory();
document.getElementById("score").textContent = "Gold: 0";
document.getElementById("time").textContent = "Time: 0.00";
