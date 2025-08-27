// Code Runner: Debugging Adventure — CHAOS EDITION
// Vanilla JS + canvas - endless runner with intentional jank/funny/random events

(() => {
  // --- Canvas setup
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  // logical size
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;

  canvas.width = WIDTH * DPR;
  canvas.height = HEIGHT * DPR;
  ctx.scale(DPR, DPR);

  // UI elements
  const scoreEl = document.getElementById('score');
  const chaosInd = document.getElementById('chaos-ind');
  const highEl = document.getElementById('high');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayScore = document.getElementById('overlay-score');
  const restartBtn = document.getElementById('restart-btn');
  const fakeUpdate = document.getElementById('fake-update');
  const progbar = fakeUpdate.querySelector('.progbar');
  const logList = document.getElementById('log-list');

  // game constants
  const GROUND_H = 50;
  const GRAV_NORMAL = 1600;            // px/s^2 base
  const JUMP_V_BASE = -520;          // initial jump velocity base
  const BASE_SPEED = 240;       // ground scroll px/s
  const SPEED_INC = 0.015;      // per second difficulty ramp
  const SPAWN_BUG_INTERVAL = 1.25; // seconds (will decrease)
  const SPAWN_SNIPPET_INTERVAL = 1.8;
  const SPAWN_DUCK_INTERVAL = 8; // seconds avg

  // chaos state
  let chaosActive = false;
  function setChaos(on, reason = '') {
    chaosActive = on;
    chaosInd.textContent = `Chaos: ${on ? 'ON' : 'OFF'}` + (reason ? ` (${reason})` : '');
  }

  // game state
  let lastTime = 0;
  let running = false;
  let gameOver = false;
  let speed = BASE_SPEED;
  let score = 0;
  let high = parseInt(localStorage.getItem('cr_high') || '0', 10);
  let spawnBugTimer = 0;
  let spawnSnippetTimer = 0;
  let spawnDuckTimer = 0;

  // player object
  const player = {
    x: 80,
    y: HEIGHT - GROUND_H - 44,
    w: 28,
    h: 36,
    vy: 0,
    grounded: true,
    invincible: false,
    invTimer: 0
  };

  // world arrays
  const bugs = [];      // obstacles
  const snippets = [];  // collectibles
  const ducks = [];     // powerups
  const speechBubbles = []; // {text,x,y,ttl}

  // error messages for death screen & bug speech
  const randomErrors = [
    "Segmentation fault: core dumped 🪦",
    "UnhandledPromiseRejection: caffeine missing ☕",
    "404: Debugging skills not found",
    "NullPointer: brain == null",
    "SyntaxError: life unexpected token",
    "RangeError: patience exceeded",
    "TypeError: coffee is not a function",
  ];

  // real error tips (tiny useful descriptions) - sprinkle as "helpful" thing during death
  const realErrorTips = [
    {err:'NullPointer', tip:'Accessing a null reference. Check your object initialization.'},
    {err:'SyntaxError', tip:'Look for missing brackets, commas or unmatched quotes.'},
    {err:'UnhandledPromiseRejection', tip:'You forgot to catch a rejected promise; use try/catch or .catch()'},
    {err:'Segmentation fault', tip:'Memory access violation — usually in native languages.'},
  ];

  // duck roast lines
  const duckRoasts = [
    "Did you forget semicolons or your life choices?",
    "I watched your commit history... it's tragic.",
    "Have you tried turning it off and on again?",
    "This code needs prayer and a migration.",
  ];

  // speech messages for bugs
  const bugSpeech = [
    "Unexpected token: ;",
    "ReferenceError: x is not defined",
    "Stack overflow (not the website)",
    "I ate your for-loop 🐛",
    "404: variable not found",
  ];

  // helpers
  function rand(min, max){ return Math.random() * (max - min) + min; }
  function now(){ return performance.now() / 1000; }
  function rectsOverlap(a,b){
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  // chaos helpers
  function logChaos(text) {
    const el = document.createElement('div');
    el.textContent = `${(new Date()).toLocaleTimeString().slice(3)} — ${text}`;
    logList.prepend(el);
    // keep small
    while (logList.children.length > 30) logList.removeChild(logList.lastChild);
  }

  // spawn functions (bugs now carry speech & sometimes weird behavior)
  function spawnBug(storm=false) {
    const h = rand(18, 32);
    const y = HEIGHT - GROUND_H - h;
    const b = {
      x: WIDTH + 20 + rand(0, 160),
      y,
      w: rand(26, 44),
      h,
      speed: speed + rand(-10, 30),
      type: 'bug',
      speech: bugSpeech[Math.floor(rand(0, bugSpeech.length))],
      speechTTL: 1.6 + Math.random() * 2,
      glitchy: Math.random() < 0.18, // 18% chance to be glitchy (fall through floor, fly)
      homing: Math.random() < 0.12 // 12% chance to chase
    };
    // if storm: make many small fast bugs
    if (storm) {
      b.w *= 0.6;
      b.h *= 0.6;
      b.speed += 60;
      b.speech = "BUG STORM!";
      b.speechTTL = 2.2;
    }
    bugs.push(b);
  }

  function spawnSnippet() {
    const size = 14;
    const y = HEIGHT - GROUND_H - size - rand(40, 150);
    const s = {
      x: WIDTH + 12 + rand(0, 80),
      y,
      w: size,
      h: size,
      speed: speed * 0.9,
      type: 'snippet',
      explosive: Math.random() < 0.18 // 18% chance to be an exploding snippet
    };
    snippets.push(s);
  }

  function spawnDuck() {
    const size = 18;
    const y = HEIGHT - GROUND_H - size - rand(60, 160);
    const d = {
      x: WIDTH + 12 + rand(0, 80),
      y,
      w: size,
      h: size,
      speed: speed * 0.95,
      type: 'duck'
    };
    ducks.push(d);
  }

  // reset
  function reset() {
    lastTime = now();
    running = true;
    gameOver = false;
    speed = BASE_SPEED;
    score = 0;
    spawnBugTimer = 0;
    spawnSnippetTimer = 0;
    spawnDuckTimer = 0;
    bugs.length = 0;
    snippets.length = 0;
    ducks.length = 0;
    speechBubbles.length = 0;
    player.x = 80;
    player.y = HEIGHT - GROUND_H - player.h;
    player.vy = 0;
    player.grounded = true;
    player.invincible = false;
    player.invTimer = 0;
    overlay.classList.add('hidden');
    progbar.style.width = '0%';
    setChaos(false);
    updateScoreUI();
    lastChaosEvent = now() + rand(4,8);
    nextChaosEventIn = rand(6,14);
    requestAnimationFrame(loop);
  }

  // inputs
  let pressing = false;
  let controlsInverted = false; // when active, jump acts like crouch (fun jank)
  let gravityMultiplier = 1; // chaos modifies
  function doJump(){
    if (gameOver) return;
    if (controlsInverted) {
      // inverted control: cause a small crouch (reduce height briefly)
      player.h = 18;
      setTimeout(()=>{ player.h = 36; }, 420);
      logChaos('Controls inverted — you crouched instead of jumping.');
      return;
    }
    if (player.grounded){
      // randomize jump sometimes for jank
      const jitter = (Math.random() < 0.22) ? rand(0.6, 1.6) : 1; // random jump multiplier
      player.vy = JUMP_V_BASE * jitter;
      player.grounded = false;
      if (jitter > 1.3) logChaos('JUMP JITTER: You launched unpredictably!');
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      doJump();
    } else if (e.key.toLowerCase() === 'r') {
      if (gameOver) reset();
    }
  });
  // touch support
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doJump();
  }, {passive:false});
  canvas.addEventListener('mousedown', (e) => {
    doJump();
  });

  restartBtn.addEventListener('click', reset);

  // UI
  function updateScoreUI(){
    scoreEl.innerText = `Score: ${Math.floor(score)}`;
    highEl.innerText = `High: ${high}`;
  }

  // draw helpers (same as original with small additions)
  function drawGround(scroll) {
    ctx.fillStyle = 'green';
    ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, GROUND_H);
    ctx.fillStyle = '#bfe7ff';
    const tileW = 48;
    const offset = Math.floor(scroll / 6) % tileW;
    for (let x = -offset; x < WIDTH; x += tileW) {
      ctx.fillRect(x + 6, HEIGHT - GROUND_H + 6, tileW - 12, 12);
    }
  }

  function drawPlayer(p) {
    ctx.fillStyle = 'pink';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillText('👨🏿‍💻', p.x + p.w / 4, p.y + p.h / 7);
    ctx.fillRect(p.x + 6, p.y + 8, 6, 6);

    // Draw "Coder" text in the center
    ctx.fillStyle = 'black';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coder', p.x + p.w / 2, p.y + p.h / 2);

    if (p.invincible) {
      ctx.strokeStyle = 'rgba(255,200,55,0.9)';
      ctx.lineWidth = 3;
      roundRect(ctx, p.x - 6, p.y - 6, p.w + 12, p.h + 12, 6, false, true);
    }
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawBug(b) {
    ctx.fillStyle = '#ff2a2a'; // A more intense red
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Draw "error" or "bug" text in the center
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = b.speech.includes('error') ? 'error' : 'bug🐛';
    ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2);


    ctx.fillStyle = '#8b1f1f';
    ctx.fillRect(b.x + b.w / 2 - 1, b.y - 6, 2, 6);
    // speech bubble
    if (b.speech && b.speechTTL > 0) {
      drawSpeech(b.speech, b.x + b.w / 2, b.y - 28, b.speechTTL);
    }
  }

  function drawSnippet(s) {
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#7a5a0a';
    ctx.font = '10px monospace';
    ctx.fillText('<>', s.x + 2, s.y + s.h - 2);
    if (s.explosive) {
      // tiny red border to hint it's explosive
      ctx.strokeStyle = '#ff7b7b';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - 1, s.y -1, s.w+2, s.h+2);
    }
  }

  function drawDuck(d) {
    ctx.fillStyle = '#ffde59';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#333';
    ctx.fillRect(d.x + d.w - 8, d.y + 6, 3, 3);
  }

  // draw speech as DOM overlay (so it's crisp)
  function drawSpeech(text, x, y, ttl) {
    // create a temporary positioned element inside wrap
    const wrap = document.getElementById('wrap');
    const bubble = document.createElement('div');
    bubble.className = 'speech';
    bubble.textContent = text;
    // position by converting game coords to css coords
    const scale = canvas.clientWidth / WIDTH;
    bubble.style.left = (x * scale - 80) + 'px';
    bubble.style.top = (y * scale - 10) + 'px';
    wrap.appendChild(bubble);
    setTimeout(()=> { bubble.remove(); }, Math.max(700, ttl*900));
  }

  // visual invert state
  let invertedColors = false;
  function setInvert(on, t=0) {
    invertedColors = on;
    if (on) {
      document.body.style.filter = 'invert(1) hue-rotate(180deg)';
      setTimeout(()=> { setInvert(false); }, Math.max(600, t*1000));
    } else {
      document.body.style.filter = '';
    }
  }

  // main loop variables for chaos
  let lastChaosEvent = 0;
  let nextChaosEventIn = rand(6,14);

  // main loop
  function loop(ts) {
    if (!running) return;
    const t = now();
    let dt = t - lastTime;
    lastTime = t;
    if (dt > 0.08) dt = 0.08; // clamp

    // increase difficulty slowly
    speed += SPEED_INC * dt * 100; // scaled
    // update spawn timers (spawn rates slightly faster with speed)
    spawnBugTimer += dt;
    spawnSnippetTimer += dt;
    spawnDuckTimer += dt;

    // spawn logic
    const dynamicBugInterval = Math.max(0.6, SPAWN_BUG_INTERVAL - (speed - BASE_SPEED) / 600);
    if (spawnBugTimer > dynamicBugInterval) {
      spawnBug();
      spawnBugTimer = 0;
    }
    const dynamicSnippetInterval = Math.max(0.9, SPAWN_SNIPPET_INTERVAL - (speed - BASE_SPEED) / 800);
    if (spawnSnippetTimer > dynamicSnippetInterval) {
      spawnSnippet();
      spawnSnippetTimer = 0;
    }
    if (spawnDuckTimer > rand(6, Math.max(6, SPAWN_DUCK_INTERVAL - (speed - BASE_SPEED) / 300))) {
      spawnDuck();
      spawnDuckTimer = 0;
    }

    // chaotic event scheduler: occasionally perform random weirdness
    if (t - lastChaosEvent > nextChaosEventIn) {
      lastChaosEvent = t;
      nextChaosEventIn = rand(6,14);
      triggerRandomChaos();
    }

    // update player physics
    player.vy += GRAV_NORMAL * gravityMultiplier * dt;
    player.y += player.vy * dt;

    if (player.y + player.h >= HEIGHT - GROUND_H) {
      player.y = HEIGHT - GROUND_H - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    // update invincibility
    if (player.invincible) {
      player.invTimer -= dt;
      if (player.invTimer <= 0) {
        player.invincible = false;
        player.invTimer = 0;
        logChaos('Invincibility ended.');
      }
    }

    // update objects movement (move left based on speed)
    const baseMove = speed * dt;
    for (let i = bugs.length - 1; i >= 0; i--) {
      const b = bugs[i];
      // homing bug behavior
      if (b.homing && Math.random() < 0.35) {
        // slowly adjust vertical position to player
        const dir = (player.y - b.y) * 0.04;
        b.y += dir;
      }
      // glitchy bug may float randomly
      if (b.glitchy && Math.random() < 0.05) {
        b.y += Math.sin(now()*20 + i) * 2;
      }
      b.x -= baseMove * (b.speed / (speed + 1));
      // speech TTL
      if (b.speechTTL && b.speechTTL > 0) {
        b.speechTTL -= dt;
      }
      // remove when offscreen
      if (b.x + b.w < -20) bugs.splice(i, 1);
    }
    for (let i = snippets.length - 1; i >= 0; i--) {
      const s = snippets[i];
      s.x -= baseMove * (s.speed / (speed + 1));
      if (s.x + s.w < -20) snippets.splice(i, 1);
    }
    for (let i = ducks.length - 1; i >= 0; i--) {
      const d = ducks[i];
      d.x -= baseMove * (d.speed / (speed + 1));
      if (d.x + d.w < -20) ducks.splice(i, 1);
    }

    // collisions
    for (let i = bugs.length - 1; i >= 0; i--) {
      if (rectsOverlap(player, bugs[i])) {
        if (!player.invincible) {
          endGame();
          return;
        } else {
          bugs.splice(i, 1);
          score += 6;
          logChaos('Invincible — you squashed a bug like a god.');
        }
      }
    }

    // snippets
    for (let i = snippets.length - 1; i >= 0; i--) {
      if (rectsOverlap(player, snippets[i])) {
        const s = snippets[i];
        snippets.splice(i, 1);
        score += 10;
        // explosive snippet behavior
        if (s.explosive && Math.random() < 0.86) {
          // trigger screen shake and invert colors briefly
          logChaos('Exploding snippet! Screen will glitch.');
          setInvert(true, 0.9);
          // small random speed change for chaos
          speed *= 1 + rand(-0.12, 0.22);
        }
      }
    }

    // ducks
    for (let i = ducks.length - 1; i >= 0; i--) {
      if (rectsOverlap(player, ducks[i])) {
        ducks.splice(i, 1);
        const r = Math.random();
        if (r < 0.60) {
          // normal invincibility
          player.invincible = true;
          player.invTimer = 5.0;
          logChaos('Rubber duck acquired — invincible for 5s (maybe).');
        } else if (r < 0.9) {
          // follow + roast (harmless)
          startDuckRoast();
          logChaos('Rubber duck is judgemental and follows you.');
        } else {
          // fake powerup: instant explode
          logChaos('The duck was cursed. You exploded. (worth it)');
          endGame('The rubber duck betrayed you.');
          return;
        }
      }
    }

    // scoring: based on distance (time*speed)
    score += (dt * (speed / 40));
    if (score > high) {
      high = Math.floor(score);
      localStorage.setItem('cr_high', high);
    }
    updateScoreUI();

    // draw scene
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#eef9ff');
    g.addColorStop(1, '#f7fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // draw ground + player + objects
    drawGround(score * 18);
    drawPlayer(player);
    for (let s of snippets) drawSnippet(s);
    for (let d of ducks) drawDuck(d);
    for (let b of bugs) drawBug(b);

    // small HUD: show high
    ctx.fillStyle = '#0b2340';
    ctx.font = '12px Inter, system-ui, monospace';
    ctx.fillText(`High: ${high}`, WIDTH - 110, 20);

    requestAnimationFrame(loop);
  }

  function endGame(extraMsg) {
    running = false;
    gameOver = true;
    const err = randomErrors[Math.floor(Math.random() * randomErrors.length)];
    overlayTitle.innerText = 'Debugging Failed!';
    overlayMsg.innerText = `${extraMsg ? extraMsg + ' — ' : ''}${err}`;
    // try to attach a useful small tip sometimes
    if (Math.random() < 0.46) {
      const t = realErrorTips[Math.floor(Math.random() * realErrorTips.length)];
      overlayMsg.innerText += `\nTip: ${t.tip}`;
    }
    overlayScore.innerText = `Score: ${Math.floor(score)} • High: ${high}\n${funDeathComment()}`;
    overlay.classList.remove('hidden');
    logChaos('Game ended. Showed death overlay.');
  }

  function funDeathComment() {
    const comments = [
      'Skill issue. Try again.',
      'You write code like a sleeping bot.',
      'Score archived in the void.',
      'Touch grass 🌱',
      'Refactor your life, maybe.'
    ];
    return comments[Math.floor(Math.random()*comments.length)];
  }

  // Duck roast mode: duck follows player and spouts insults occasionally (non-harmful)
  let duckRoastActive = false;
  let duckRoastTimer = 0;
  function startDuckRoast() {
    duckRoastActive = true;
    duckRoastTimer = 0;
    setTimeout(()=> { duckRoastActive = false; logChaos('Duck roast ended.'); }, 8000);
    // spawn a friendly little visual duck that chases player (purely cosmetic)
    const duckVisual = {x: player.x - 40, y: player.y - 20, w: 14, h: 14, ttl: 8};
    ducks.push(duckVisual); // will behave like visual until ttl used
    (function roastLoop() {
      if (!duckRoastActive) return;
      const roast = duckRoasts[Math.floor(Math.random()*duckRoasts.length)];
      // place speech near player
      drawSpeech(roast, player.x + player.w/2 - 10 + rand(-20,20), player.y - 30 + rand(-10,10), 2.2);
      setTimeout(roastLoop, 1500 + Math.random()*1800);
    })();
  }

  // chaos event triggers
  function triggerRandomChaos() {
    const r = Math.random();
    // pick an event
    if (r < 0.16) {
      // Windows Update freeze for 1-2s
      setChaos(true, 'Windows Update');
      fakeUpdate.classList.remove('hidden');
      progbar.style.width = '0%';
      logChaos('Fake "Windows Update" started — the demo is paused.');
      let p = 0;
      const dur = 1100 + Math.random()*1000;
      const start = now();
      const iv = setInterval(()=> {
        p = Math.min(100, ((now()-start)/ (dur/1000))*100);
        progbar.style.width = p + '%';
      }, 90);
      setTimeout(()=> {
        clearInterval(iv);
        progbar.style.width = '0%';
        setChaos(false);
        logChaos('Windows Update finished. Resume.');
      }, dur);
    } else if (r < 0.34) {
      // invert controls for 3-5s (jump becomes crouch)
      controlsInverted = true;
      setChaos(true, 'Invert Controls');
      logChaos('Controls inverted! Jump will crouch for a short while.');
      setTimeout(()=> {
        controlsInverted = false;
        setChaos(false);
        logChaos('Controls returned to normal.');
      }, 3200 + Math.random()*1800);
    } else if (r < 0.54) {
      // physics chaos: random gravity for a while
      const old = gravityMultiplier;
      gravityMultiplier = rand(0.35, 2.4);
      setChaos(true, 'Physics Chaos');
      logChaos(`Physics chaos: gravity x${gravityMultiplier.toFixed(2)}.`);
      setTimeout(()=> {
        gravityMultiplier = 1;
        setChaos(false);
        logChaos('Physics normalized.');
      }, 3600 + Math.random()*2400);
    } else if (r < 0.72) {
      // bug storm
      setChaos(true, 'Bug Storm');
      logChaos('Bug storm: many insects inbound!');
      for (let i=0;i<8;i++) spawnBug(true);
      setTimeout(()=> {
        setChaos(false);
        logChaos('Bug storm subsided.');
      }, 3000 + Math.random()*1200);
    } else if (r < 0.88) {
      // UI insult banner & temporary score swap
      setChaos(true, 'Insult Banner');
      const prev = score;
      score = Math.max(0, score - rand(10, 60));
      logChaos('Score insult: score randomly decreased and an insult shows.');
      drawSpeech('Skill issue. Score down.', WIDTH/2, HEIGHT/2 - 40, 2.4);
      setTimeout(()=> { setChaos(false); }, 2200);
    } else {
      // minor random spawn + small inversion
      spawnSnippet(); spawnBug();
      setChaos(true, 'Random Glitch');
      logChaos('A random glitch spawned stuff.');
      setTimeout(()=> { setChaos(false); }, 1600);
    }
  }

  // expose a simple console helper for debugging the chaotic features
  window.CR = {
    reset,
    triggerChaos: triggerRandomChaos,
    getState: () => ({score, high, speed, bugs: bugs.length, snippets: snippets.length, ducks: ducks.length}),
  };

  // start
  reset();

})();
