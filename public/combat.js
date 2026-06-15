const CPU_NAME = 'Rookie Bot';
const CPU_AVATAR = '🤖';

const CPU_MOVES = [
  { name: 'Jab Combo', description: 'A quick one-two combo to test your guard.', damage: 10, canBlock: true, canCounter: false },
  { name: 'Overhead Smash', description: 'A heavy, telegraphed overhead swing — their signature move.', damage: 30, canBlock: true, canCounter: true },
  { name: 'Leg Sweep', description: 'A low sweeping kick aimed at the knees.', damage: 14, canBlock: true, canCounter: false },
  { name: 'Reckless Tackle', description: "A desperate full-body tackle that's nearly impossible to block.", damage: 16, canBlock: false, canCounter: false },
];

const DEMO_PLAYER_MOVES = [
  { name: 'Takedown Drive', description: "An explosive wrestler's shoot from track-trained legs, driving the opponent down with relentless forward pressure that punches through any guard.", damage: 22, canBlock: false, canCounter: false },
  { name: 'Read and React', description: "Staying calm under pressure, watching the opponent's tell and turning their own aggression against them in a perfectly timed reversal.", damage: 18, canBlock: true, canCounter: true },
  { name: "Drummer's Flurry", description: 'A rapid, rhythmic barrage of strikes thrown with the cadence of a drum solo — fast and light, but hard to interrupt.', damage: 9, canBlock: true, canCounter: false },
  { name: 'Slow Burn Suplex', description: 'Quiet and stubborn — absorbing the punishment, then unleashing it all in a back-breaking grapple that ends the exchange.', damage: 34, canBlock: true, canCounter: false },
];

const state = {
  playerMoves: null,
  cpuMoves: CPU_MOVES,
  cpuName: CPU_NAME,
  playerHP: 100,
  cpuHP: 100,
  selectedAttack: null,
  selectedGuess: null,
  over: false,
};

const noMovesetEl = document.getElementById('no-moveset');
const battleEl = document.getElementById('battle');
const demoBtn = document.getElementById('demo-btn');
const opponentStatusEl = document.getElementById('opponent-status');
const fightControlsEl = document.getElementById('fight-controls');
const attackPicksEl = document.getElementById('attack-picks');
const guessPicksEl = document.getElementById('guess-picks');
const fightBtn = document.getElementById('fight-btn');
const logEl = document.getElementById('log');
const gameOverEl = document.getElementById('game-over');
const restartBtn = document.getElementById('restart-btn');
const playerHpFill = document.getElementById('player-hp-fill');
const playerHpLabel = document.getElementById('player-hp-label');
const cpuHpFill = document.getElementById('cpu-hp-fill');
const cpuHpLabel = document.getElementById('cpu-hp-label');
const cpuNameEl = document.getElementById('cpu-name');
const cpuAvatarEl = document.getElementById('cpu-avatar');

init();

function init() {
  const stored = sessionStorage.getItem('playerMoveset');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 4) {
        state.playerMoves = parsed;
        noMovesetEl.style.display = 'none';
        startBattle();
        return;
      }
    } catch (e) {
      // fall through to demo prompt
    }
  }
  demoBtn.addEventListener('click', () => {
    state.playerMoves = DEMO_PLAYER_MOVES;
    noMovesetEl.style.display = 'none';
    startBattle();
  });
}

function renderPlayerAvatar() {
  const portrait = sessionStorage.getItem('playerPortrait');
  if (portrait) {
    document.getElementById('player-avatar').innerHTML = `<img src="${portrait}" alt="Your fighter portrait" />`;
  }
}

async function startBattle() {
  battleEl.style.display = 'block';
  renderPlayerAvatar();
  await loadOpponent();
  renderAll();
}

function setCpuAvatar(avatar) {
  cpuAvatarEl.innerHTML = '';
  if (avatar && avatar.startsWith('data:')) {
    cpuAvatarEl.innerHTML = `<img src="${avatar}" alt="Opponent portrait" />`;
  } else if (avatar) {
    cpuAvatarEl.textContent = avatar;
  } else {
    cpuAvatarEl.textContent = '🧑';
  }
}

async function loadOpponent() {
  fightControlsEl.style.display = 'none';

  const friendRaw = sessionStorage.getItem('opponentFighter');
  if (friendRaw) {
    try {
      const fighter = JSON.parse(friendRaw);
      if (Array.isArray(fighter.moves) && fighter.moves.length === 4 && fighter.name) {
        state.cpuMoves = fighter.moves;
        state.cpuName = fighter.name;
        cpuNameEl.textContent = state.cpuName;
        setCpuAvatar(fighter.avatar);
        opponentStatusEl.style.display = 'none';
        fightControlsEl.style.display = 'block';
        return;
      }
    } catch (e) {
      // fall through to random opponent
    }
  }

  opponentStatusEl.style.display = 'block';
  opponentStatusEl.textContent = "Scouting today's opponent...";
  cpuNameEl.textContent = '???';
  cpuAvatarEl.innerHTML = '';
  cpuAvatarEl.textContent = '❓';

  try {
    const res = await fetch('/generate-opponent', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load opponent.');
    state.cpuMoves = data.moves;
    state.cpuName = data.name;
    setCpuAvatar(data.avatar);
  } catch (e) {
    state.cpuMoves = CPU_MOVES;
    state.cpuName = CPU_NAME;
    setCpuAvatar(CPU_AVATAR);
  }

  cpuNameEl.textContent = state.cpuName;
  opponentStatusEl.style.display = 'none';
  fightControlsEl.style.display = 'block';
}

function renderAll() {
  renderHP();
  renderMovePickButtons(attackPicksEl, state.playerMoves, state.selectedAttack, (idx) => {
    state.selectedAttack = idx;
    renderAll();
  });
  renderMovePickButtons(guessPicksEl, state.cpuMoves, state.selectedGuess, (idx) => {
    state.selectedGuess = idx;
    renderAll();
  });
  fightBtn.disabled = state.over || state.selectedAttack === null || state.selectedGuess === null;
}

function renderHP() {
  const pPct = Math.max(0, state.playerHP);
  const cPct = Math.max(0, state.cpuHP);
  playerHpFill.style.width = pPct + '%';
  cpuHpFill.style.width = cPct + '%';
  playerHpFill.classList.toggle('low', pPct <= 30);
  cpuHpFill.classList.toggle('low', cPct <= 30);
  playerHpLabel.textContent = `${pPct} / 100`;
  cpuHpLabel.textContent = `${cPct} / 100`;
}

function renderMovePickButtons(container, moves, selectedIdx, onSelect) {
  container.innerHTML = '';
  moves.forEach((move, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'move-pick-btn' + (idx === selectedIdx ? ' selected' : '');
    btn.disabled = state.over;

    const tags = [];
    if (move.canCounter) tags.push('★ signature');
    if (!move.canBlock) tags.push('unblockable');

    btn.innerHTML = `${escapeHtml(move.name)}<span class="pick-dmg">${move.damage} dmg${tags.length ? ' · ' + tags.join(', ') : ''}</span>`;
    btn.addEventListener('click', () => onSelect(idx));
    container.appendChild(btn);
  });
}

fightBtn.addEventListener('click', doTurn);

restartBtn.addEventListener('click', async () => {
  state.playerHP = 100;
  state.cpuHP = 100;
  state.selectedAttack = null;
  state.selectedGuess = null;
  state.over = false;
  logEl.innerHTML = '';
  gameOverEl.style.display = 'none';
  fightBtn.style.display = 'block';
  renderHP();
  await loadOpponent();
  renderAll();
});

// All moves can be blocked (halving damage) by default. A move dealt by the
// attacker that the defender correctly guessed AND that is the attacker's
// signature (canCounter) move backfires completely: the defender takes no
// damage and the attacker eats the move's own damage instead.
function resolveAttack(attackerMove, defenderGuessMove) {
  const readPerfectly = attackerMove.canCounter && defenderGuessMove && defenderGuessMove.name === attackerMove.name;

  if (readPerfectly) {
    return { toDefender: 0, toAttacker: attackerMove.damage, punished: true };
  }
  if (attackerMove.canBlock) {
    return { toDefender: Math.round(attackerMove.damage * 0.5), toAttacker: 0, punished: false };
  }
  return { toDefender: attackerMove.damage, toAttacker: 0, punished: false };
}

function doTurn() {
  const playerAttack = state.playerMoves[state.selectedAttack];
  const playerGuess = state.cpuMoves[state.selectedGuess];

  const cpuAttack = state.cpuMoves[Math.floor(Math.random() * state.cpuMoves.length)];
  const cpuGuess = state.playerMoves[Math.floor(Math.random() * state.playerMoves.length)];

  const cpuToPlayer = resolveAttack(cpuAttack, playerGuess);
  const playerToCpu = resolveAttack(playerAttack, cpuGuess);

  state.playerHP -= cpuToPlayer.toDefender + playerToCpu.toAttacker;
  state.cpuHP -= playerToCpu.toDefender + cpuToPlayer.toAttacker;

  logEntry(describePlayerAttack(playerAttack, playerToCpu));
  logEntry(describeCpuAttack(cpuAttack, cpuToPlayer));

  state.selectedAttack = null;
  state.selectedGuess = null;

  if (state.playerHP <= 0 || state.cpuHP <= 0) {
    state.over = true;
    if (state.playerHP <= 0 && state.cpuHP <= 0) {
      logEntry({ text: "Double KO! It's a draw.", cls: 'lose' });
    } else if (state.cpuHP <= 0) {
      logEntry({ text: `${state.cpuName} is down. You win!`, cls: 'win' });
    } else {
      logEntry({ text: "You're down. Defeat.", cls: 'lose' });
    }
    gameOverEl.style.display = 'block';
    fightBtn.style.display = 'none';
  }

  renderAll();
}

function describePlayerAttack(move, result) {
  if (result.punished) {
    return { text: `${state.cpuName} read your ${move.name} coming and turned it back on you for ${result.toAttacker} dmg!`, cls: 'lose' };
  }
  if (!move.canBlock) {
    return { text: `You used ${move.name} — unblockable! ${state.cpuName} takes ${result.toDefender} dmg.`, cls: 'punish' };
  }
  return { text: `You used ${move.name} — ${state.cpuName} blocks, taking ${result.toDefender} dmg.`, cls: '' };
}

function describeCpuAttack(move, result) {
  if (result.punished) {
    return { text: `You read ${state.cpuName}'s ${move.name} coming and turned it back on them for ${result.toAttacker} dmg!`, cls: 'punish' };
  }
  if (!move.canBlock) {
    return { text: `${state.cpuName} used ${move.name} — unblockable! You take ${result.toDefender} dmg.`, cls: 'lose' };
  }
  return { text: `${state.cpuName} used ${move.name} — you block, taking ${result.toDefender} dmg.`, cls: '' };
}

function logEntry(entry) {
  const div = document.createElement('div');
  div.className = 'entry' + (entry.cls ? ' ' + entry.cls : '');
  div.textContent = entry.text;
  logEl.insertBefore(div, logEl.firstChild);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
