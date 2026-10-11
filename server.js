// Aviso visível se algo quebrar (útil para depurar no celular)
function showErr(msg) {
  let d = document.getElementById('errBanner');
  if (!d) { d = document.createElement('div'); d.id = 'errBanner';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#c0392b;color:#fff;padding:8px;font-size:13px';
    document.body.appendChild(d); }
  d.textContent = msg;
}
window.addEventListener('error', e => showErr('Erro: ' + e.message));
const socket = io();
socket.on('connect_error', e => showErr('Sem conexão com o servidor: ' + e.message));
socket.on('connect', () => { const b = document.getElementById('errBanner'); if (b) b.remove(); });
let myRoomId = '', pendingRoomIdToJoin = '', selectedCardUrl = '', myPlayedCardUrl = '';
let modalAction = 'PLAY', myHandElements = [], amINarrator = false, narratorHasPlayed = false;
const $ = id => document.getElementById(id);

function toggleHostMenu() { const m = $('hostMenu'); m.style.display = m.style.display === 'none' ? 'block' : 'none'; }

function showCreateRoom() {
  const name = $('hostPlayerName').value;
  if (!name) return alert("Por favor, digite seu apelido de Host!");
  socket.emit('createRoom', { targetScore: $('targetScoreInput').value, playerName: name });
}
socket.on('roomCreated', ({ roomId, players }) => {
  myRoomId = roomId;
  $('initialMenu').style.display = 'none';
  $('game').style.display = 'block';
  $('roomCodeDisplay').innerText = 'Código da Sala: ' + roomId;
  $('waitingMessage').style.display = 'block';
  updatePlayersList(players);
});

function checkRoom() {
  const room = $('roomIdCheck').value;
  if (!room) return alert("Digite o código da sala!");
  socket.emit('validateRoom', { roomId: room });
}
socket.on('roomValidated', ({ roomId }) => {
  pendingRoomIdToJoin = roomId;
  $('initialMenu').style.display = 'none';
  $('joinNameForm').style.display = 'block';
});
socket.on('joinError', ({ message }) => alert(message));

function joinRoom() {
  const name = $('guestPlayerName').value;
  if (!name) return alert("Por favor, digite seu apelido para entrar!");
  socket.emit('joinRoom', { roomId: pendingRoomIdToJoin, playerName: name });
}
socket.on('joinedSuccess', ({ roomId }) => {
  myRoomId = roomId;
  $('joinNameForm').style.display = 'none';
  $('game').style.display = 'block';
  $('roomCodeDisplay').innerText = 'Sala: ' + roomId;
  $('waitingMessage').style.display = 'none';
});
function backToMenu() {
  $('joinNameForm').style.display = 'none';
  $('initialMenu').style.display = 'block';
  pendingRoomIdToJoin = '';
}
socket.on('playerJoined', ({ players }) => {
  updatePlayersList(players);
  if (players.length > 1) {
    $('waitingMessage').style.display = 'none';
    if ($('roomCodeDisplay').innerText.includes('Código da Sala:')) $('startBtn').style.display = 'block';
  }
});
function updatePlayersList(players) {
  $('playersList').innerHTML = '<strong>Na Mesa:</strong> ' + players.map(p => p.name).join(', ');
}

function startGame() { socket.emit('startGame', { roomId: myRoomId }); }
function nextRound() { socket.emit('nextRound', { roomId: myRoomId }); }

// Carrega a arte da carta; se o servidor ainda estiver gerando, tenta de novo (sem fotos de reserva)
function loadInto(cardDiv, url, tries = 0) {
  const img = new Image();
  img.onload = () => { cardDiv.classList.remove('card-loading'); cardDiv.style.backgroundImage = `url('${url}')`; };
  img.onerror = () => { if (tries < 8) setTimeout(() => loadInto(cardDiv, url, tries + 1), 3000 + tries * 1500); };
  img.src = url;
}

function appendCardToBoard(url, isVotingPhase = false) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card card-loading';
  loadInto(cardDiv, url);

  if (isVotingPhase) {
    if (amINarrator) {
      cardDiv.classList.add('narrator-card-view');
      cardDiv.onclick = () => alert("Você é o narrador! Apenas observe a votação.");
    } else if (url === myPlayedCardUrl) {
      cardDiv.classList.add('my-card-disabled');
      cardDiv.onclick = () => alert("Você não pode votar na sua própria carta!");
    } else {
      cardDiv.onclick = () => openModal(url, 'VOTE');
    }
  } else {
    if (!amINarrator && !narratorHasPlayed) cardDiv.classList.add('locked-card');
    cardDiv.onclick = () => {
      if (!amINarrator && !narratorHasPlayed) return alert("Calma! Espere o Narrador falar a dica e jogar primeiro.");
      openModal(url, 'PLAY');
    };
    myHandElements.push(cardDiv);
  }
  $('hand').appendChild(cardDiv);
}

socket.on('gameStarted', ({ players }) => {
  $('startBtn').style.display = 'none';
  $('waitingMessage').style.display = 'none';
  const ins = $('actionInstruction');
  $('hand').innerHTML = '';
  myHandElements = [];
  narratorHasPlayed = false;
  myPlayedCardUrl = '';
  const me = players.find(p => p.id === socket.id);
  if (!me) return;
  amINarrator = me.isNarrator;
  ins.innerHTML = amINarrator
    ? '<span style="color:#38ef7d; font-weight:800; font-size:1.4em;">Você é o Narrador!</span><br>Fale sua dica em voz alta e escolha uma carta.'
    : '<span style="color:#f1c40f; font-weight:600; font-size:1.2em;">Aguarde...</span><br>O Narrador está dando a dica. Olhe suas cartas enquanto isso!';
  me.hand.forEach(url => appendCardToBoard(url, false));
});

socket.on('narratorPlayed', () => {
  narratorHasPlayed = true;
  if (!amINarrator) {
    $('actionInstruction').innerHTML = '<span style="color:#6e8efb; font-weight:800; font-size:1.4em;">Sua Vez!</span><br>O Narrador deu a dica. Escolha a sua carta que mais combina com a dica.';
    myHandElements.forEach(d => d.classList.remove('locked-card'));
  }
});

socket.on('startVotingPhase', ({ cards }) => {
  $('hand').innerHTML = '';
  $('actionInstruction').innerHTML = amINarrator
    ? '<span style="color:#f1c40f; font-weight:800; font-size:1.3em;">Hora da Votação!</span><br>Aguarde os jogadores votarem (Você não vota).'
    : '<span style="color:#a777e3; font-weight:800; font-size:1.4em;">Votação!</span><br>Qual destas é a carta do narrador?';
  cards.forEach(url => appendCardToBoard(url, true));
});

socket.on('roundEnded', ({ ranking, isGameOver, hostSocketId }) => {
  $('actionInstruction').innerHTML = '';
  let html = isGameOver
    ? `<div class="winner-title">🏆 ${ranking[0].name} VENCEU! 🏆</div>`
    : `<h3 style="color: #a777e3; margin-bottom: 10px; font-size: 1.5em;">Fim da Rodada!</h3>`;
  html += `<table class="ranking-table"><tr><th>Pos.</th><th>Jogador</th><th>Pts</th></tr>`;
  ranking.forEach((p, i) => {
    const rowStyle = i === 0 ? 'color:#f1c40f; font-weight:bold; background:rgba(241,196,15,.2);' : '';
    const nar = p.isNarrator ? '<br><span style="font-size:12px; color:#38ef7d; font-weight:normal;">(Narrador)</span>' : '';
    html += `<tr style="${rowStyle}"><td style="font-size:1.2em;">${i + 1}º</td><td>${p.name} ${nar}</td><td style="font-size:1.4em;">${p.score}</td></tr>`;
  });
  html += `</table>`;
  const isHost = socket.id === hostSocketId;
  if (!isGameOver && isHost) html += `<button onclick="nextRound()" style="background: linear-gradient(135deg, #f1c40f, #e67e22); padding: 18px; font-size: 1.1em; margin-top: 20px;">Próxima Rodada</button>`;
  else if (!isGameOver) html += `<p style="margin-top:20px; font-size:15px; opacity:.9;">Aguardando o Host iniciar a próxima rodada...</p>`;
  else if (isHost) html += `<button onclick="window.location.reload()" style="background: linear-gradient(135deg, #11998e, #38ef7d); padding: 18px; font-size: 1.1em; margin-top: 20px;">Jogar Novamente</button>`;
  $('hand').innerHTML = html;
});

function openModal(url, action) {
  selectedCardUrl = url;
  modalAction = action;
  $('modalImage').src = url;
  const b = $('btnConfirmModal');
  if (action === 'PLAY') { b.innerText = 'Enviar Carta para a Mesa'; b.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)'; }
  else { b.innerText = 'Confirmar Voto'; b.style.background = 'linear-gradient(135deg, #a777e3, #6e8efb)'; }
  $('cardModal').style.display = 'block';
}
function closeModal() { $('cardModal').style.display = 'none'; selectedCardUrl = ''; }

function handleConfirmModal() {
  if (!selectedCardUrl) return;
  if (modalAction === 'PLAY') {
    myPlayedCardUrl = selectedCardUrl;
    socket.emit('playCard', { roomId: myRoomId, cardUrl: selectedCardUrl });
    $('hand').innerHTML = '';
    $('actionInstruction').innerHTML = '<span style="color:#38ef7d; font-size:1.2em;">Carta na mesa!</span><br>Aguardando os outros jogadores...';
  } else {
    socket.emit('voteCard', { roomId: myRoomId, cardUrl: selectedCardUrl });
    $('hand').innerHTML = '';
    $('actionInstruction').innerHTML = '<span style="color:#6e8efb; font-size:1.2em;">Voto registrado!</span><br>Aguardando apuração...';
  }
  closeModal();
}
