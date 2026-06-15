const params = new URLSearchParams(window.location.search);
const matchId = params.get('match');
const myRole = params.get('player') === '2' ? 2 : 1;

const errorEl = document.getElementById('error');
const waitingEl = document.getElementById('waiting');
const battleEl = document.getElementById('battle');
const roomCodeEl = document.getElementById('room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const meNameEl = document.getElementById('me-name');
const oppNameEl = document.getElementById('opp-name');
const meAvatarEl = document.getElementById('me-avatar');
const oppAvatarEl = document.getElementById('opp-avatar');
const meHpFill = document.getElementById('me-hp-fill');
const meHpLabel = document.getElementById('me-hp-label');
const oppHpFill = document.getElementById('opp-hp-fill');
const oppHpLabel = document.getElementById('opp-hp-label');
const turnStatusEl = document.getElementById('turn-status');
const fightControlsEl = document.getElementById('fight-controls');
const attackPicksEl = document.getElementById('attack-picks');
const guessPicksEl = document.getElementById('guess-picks');
const fightBtn = document.getElementById('fight-btn');
const logEl = document.getElementById('log');
const gameOverEl = document.getElementById('game-over');
const resultTextEl = document.getElementById('result-text');

let match = null;
let selectedAttack = null;
let selectedGuess = null;
let lastTurn = null;

init();

async function init() {
  if (!matchId) {
    showError('No match specified.');
    return;
  }

  try {
    const cfgRes = await fetch('/config');
    const cfg = await cfgRes.json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      showError('Live matches are not configured on this server.');
      return;
    }

    const res = await fetch(`/matches/${matchId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Match not found.');
    match = data;
    render();

    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    sb.channel(`match-${matchId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      }, (payload) => {
        match = payload.new;
        render();
      })
      .subscribe();
  } catch (err) {
    showError(err.message);
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(matchId).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => { copyCodeBtn.textContent = 'Copy'; }, 1500);
  });
});

function setAvatar(el, avatar) {
  el.innerHTML = '';
  if (avatar && avatar.startsWith('data:')) {
    el.innerHTML = `<img src="${avatar}" alt="Fighter portrait" />`;
  } else if (avatar) {
    el.textContent = avatar;
  } else {
    el.textContent = '🧑';
  }
}

function render() {
  if (match.status === 'waiting') {
    waitingEl.style.display = 'block';
    battleEl.style.display = 'none';
    roomCodeEl.textContent = matchId;
    return;
  }

  waitingEl.style.display = 'none';
  battleEl.style.display = 'block';

  if (match.turn !== lastTurn) {
    selectedAttack = null;
    selectedGuess = null;
    lastTurn = match.turn;
  }

  const me = myRole === 1 ? match.player1_fighter : match.player2_fighter;
  const opp = myRole === 1 ? match.player2_fighter : match.player1_fighter;
  const myHP = myRole === 1 ? match.player1_hp : match.player2_hp;
  const oppHP = myRole === 1 ? match.player2_hp : match.player1_hp;
  const myPick = myRole === 1 ? match.player1_pick : match.player2_pick;

  meNameEl.textContent = me.name;
  oppNameEl.textContent = opp.name;
  setAvatar(meAvatarEl, me.avatar);
  setAvatar(oppAvatarEl, opp.avatar);

  meHpFill.style.width = myHP + '%';
  oppHpFill.style.width = oppHP + '%';
  meHpFill.classList.toggle('low', myHP <= 30);
  oppHpFill.classList.toggle('low', oppHP <= 30);
  meHpLabel.textContent = `${myHP} / 100`;
  oppHpLabel.textContent = `${oppHP} / 100`;

  renderLog(match.log);

  if (match.status === 'done') {
    fightControlsEl.style.display = 'none';
    turnStatusEl.textContent = '';
    gameOverEl.style.display = 'block';
    resultTextEl.textContent = resultText();
    return;
  }

  gameOverEl.style.display = 'none';
  fightControlsEl.style.display = 'block';
  turnStatusEl.textContent = myPick ? 'Waiting for opponent...' : '';

  renderMovePickButtons(attackPicksEl, me.moves, selectedAttack, !!myPick, (idx) => {
    selectedAttack = idx;
    render();
  });
  renderMovePickButtons(guessPicksEl, opp.moves, selectedGuess, !!myPick, (idx) => {
    selectedGuess = idx;
    render();
  });

  fightBtn.disabled = !!myPick || selectedAttack === null || selectedGuess === null;
}

function resultText() {
  if (match.winner === 'draw') return "Double KO! It's a draw.";
  const winnerFighter = match.winner === 'player1' ? match.player1_fighter : match.player2_fighter;
  const youWon = (match.winner === 'player1' && myRole === 1) || (match.winner === 'player2' && myRole === 2);
  return youWon ? `${winnerFighter.name} wins! You win!` : `${winnerFighter.name} wins.`;
}

function renderMovePickButtons(container, moves, selectedIdx, locked, onSelect) {
  container.innerHTML = '';
  moves.forEach((move, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'move-pick-btn' + (idx === selectedIdx ? ' selected' : '');
    btn.disabled = locked;

    const tags = [];
    if (move.canCounter) tags.push('★ signature');
    if (!move.canBlock) tags.push('unblockable');

    btn.innerHTML = `${escapeHtml(move.name)}<span class="pick-dmg">${move.damage} dmg${tags.length ? ' · ' + tags.join(', ') : ''}</span>`;
    btn.addEventListener('click', () => onSelect(idx));
    container.appendChild(btn);
  });
}

function renderLog(entries) {
  logEl.innerHTML = '';
  for (const text of entries) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.textContent = text;
    logEl.appendChild(div);
  }
}

fightBtn.addEventListener('click', async () => {
  fightBtn.disabled = true;
  try {
    const res = await fetch(`/matches/${matchId}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: myRole, attackIdx: selectedAttack, guessIdx: selectedGuess, turn: match.turn }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit move.');
    turnStatusEl.textContent = 'Waiting for opponent...';
  } catch (err) {
    showError(err.message);
    fightBtn.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
