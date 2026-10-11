const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

// ---------- CONFIG (tudo ajustável por variável de ambiente no Render) ----------
const IMG_BASE = process.env.IMG_BASE || 'https://image.pollinations.ai/prompt/';
const IMG_KEY = process.env.POLLINATIONS_KEY || '';      // se o provedor exigir chave
const IMG_MODEL = process.env.IMG_MODEL || 'flux';
const CARD_W = +process.env.CARD_W || 640;
const CARD_H = +process.env.CARD_H || 960;               // proporção 2:3 como no Dixit
const MAX_PARALLEL = +process.env.IMG_PARALLEL || 2;     // evita 429 do provedor
const CACHE_MAX = 400;

// ---------- BANCO DE CENAS (metáforas oníricas ao estilo Dixit) ----------
const subjects = [
  "a little girl rowing a paper boat across a night sky full of lanterns",
  "a giant key floating above a sleeping village, a tiny door in the clouds",
  "a rabbit in a waistcoat carrying a glowing lantern through an endless library",
  "a bird cage with its door open, filled with a tiny garden and a sleeping moon",
  "a house standing on enormous chicken legs wandering through a field of sunflowers",
  "a man with a tree growing out of his coat, birds nesting in the branches",
  "a ship sailing through the clouds with whales swimming alongside",
  "a staircase spiraling up into a giant open eye in the sky",
  "a girl holding a bundle of balloons that lift an entire small town off the ground",
  "a fox dressed as a conductor leading an orchestra of fireflies",
  "a tiny knight facing a gigantic snail with a castle on its shell",
  "an old woman knitting a river that flows out of her window",
  "a lighthouse in the middle of a desert guiding a fleet of sand ships",
  "a child sleeping inside a huge open book while the story grows around her",
  "a moon hanging like a lamp over a table set for a tea party of animals",
  "a mechanical heart wound with a golden key in a cluttered clockmaker's workshop",
  "a hot air balloon shaped like a giant pear drifting over a patchwork kingdom",
  "a masked ball of owls and cats in a ruined theatre lit by candles",
  "a girl walking a huge fish on a leash through a quiet city street",
  "a tower made of stacked teapots and books reaching the stars",
  "a swan pulling a boat carrying a sleeping prince through a mirror lake",
  "a forest where every tree is a candle and the fog is made of dreams",
  "a bridge of piano keys crossing a canyon, a lone traveler halfway over",
  "a mermaid reading a letter at a desk underwater, bottles floating like stars",
  "a giant hand gently placing a tiny sun into the sky",
  "a caravan of elephants carrying a whole city on their backs across the dunes",
  "a boy flying a kite that is also a dragon over a sea of paper waves",
  "a clock tower whose pendulum is a swinging moon above a sleepy town",
  "a witch's cottage inside an enormous pumpkin, smoke curling into a spiral",
  "a door standing alone in a snowy field, warm light spilling out of it",
  "a ladder leaning against the clouds with a girl picking stars like fruit",
  "a mirror reflecting a different world, a child about to step through",
  "an enormous cat sleeping curled around a small village on a hill",
  "a train made of leaves puffing through an autumn sky",
  "a spider weaving a web of moonlight between two towers",
  "a tiny astronaut tending a garden on a floating rock",
  "a king whose crown is a nest, seated on a throne of tangled roots",
  "a girl in a red cloak crossing a field of giant mushrooms at dusk",
  "a violin-shaped boat on a calm sea under a sky of swirling constellations",
  "a carnival of strange creatures marching at the edge of a cliff at sunset"
];

const styles = [
  "gouache and watercolor illustration, French fairy-tale picture book, soft grainy paper texture",
  "dreamy oil painting, poetic surrealism in the spirit of Magritte, smooth luminous skies",
  "whimsical vintage storybook illustration, muted warm palette, fine ink linework",
  "delicate ink and watercolor with Art Nouveau flourishes, elegant and ethereal",
  "dark enchanting fairy tale, painterly chiaroscuro, glowing candlelight, moody and mysterious",
  "naive folk-art collage with cut-paper textures, charming and colorful",
  "soft pastel children's book illustration, anthropomorphic animals, tender atmosphere",
  "Victorian surreal collage-painting, cabinet-of-curiosities mood, sepia and teal accents",
  "luminous painterly landscape, glowing atmospheric clouds, magical realism"
];

const moods = [
  "golden hour light", "moonlit night with soft blue shadows", "misty dawn in pastel tones",
  "warm sunset palette of coral and violet", "deep teal and amber glow", "autumn colors of rust and gold",
  "snowy twilight with warm windows", "stormy sky breaking into light"
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- CARTAS: registro, cache, fila de geração ----------
const metas = new Map();     // id -> { prompt, seed }
const cache = new Map();     // id -> { buf, type }  (LRU simples)
const inflight = new Map();  // id -> Promise

function makePrompt(subject) {
  return `${subject}. ${pick(styles)}. ${pick(moods)}. Whimsical surreal hand-painted illustration for a dreamlike storytelling board game card, rich detail, poetic and evocative, vertical composition. Not a photograph, no text, no letters, no watermark, no frame, no border.`;
}

// Cria n cartas na sala (sem repetir cena até esgotar o banco) e devolve as URLs
function buildDeck(room, n) {
  const urls = [];
  let bag = [];
  for (let i = 0; i < n; i++) {
    if (!bag.length) bag = shuffle(subjects);
    const id = crypto.randomBytes(6).toString('hex');
    metas.set(id, { prompt: makePrompt(bag.pop()), seed: Math.floor(Math.random() * 9999999) });
    room.cardIds.add(id);
    urls.push(`/card/${id}`);
  }
  return urls;
}

let running = 0;
const hi = [], lo = [];
function schedule(fn, high) {
  return new Promise((resolve, reject) => { (high ? hi : lo).push({ fn, resolve, reject }); pump(); });
}
function pump() {
  while (running < MAX_PARALLEL && (hi.length || lo.length)) {
    const t = hi.shift() || lo.shift();
    running++;
    t.fn().then(t.resolve, t.reject).finally(() => { running--; pump(); });
  }
}

async function fetchUpstream(meta) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = meta.seed + attempt * 7919;
    const url = `${IMG_BASE}${encodeURIComponent(meta.prompt)}?width=${CARD_W}&height=${CARD_H}&seed=${seed}&model=${IMG_MODEL}&nologo=true&private=true`;
    try {
      const r = await fetch(url, {
        headers: IMG_KEY ? { Authorization: `Bearer ${IMG_KEY}` } : {},
        signal: AbortSignal.timeout(70000)
      });
      const type = r.headers.get('content-type') || '';
      if (r.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 8000) return { buf, type };
      }
      console.log('Provedor respondeu', r.status, type);
      if (r.status === 429) await sleep(4000 * (attempt + 1));
    } catch (e) {
      console.log('Falha ao gerar carta:', e.message);
      await sleep(1500);
    }
  }
  return null;
}

// Plano B artístico (NUNCA foto): paisagem onírica gerada proceduralmente
function fallbackSvg(seed) {
  let s = seed >>> 0;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const h = Math.floor(r() * 360);
  const c = (dh, l, sat = 55) => `hsl(${(h + dh) % 360},${sat}%,${l}%)`;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 960"><defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(0, 16)}"/><stop offset=".6" stop-color="${c(40, 42)}"/><stop offset="1" stop-color="${c(190, 62)}"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="14"/></filter></defs><rect width="640" height="960" fill="url(#g)"/>`;
  for (let i = 0; i < 45; i++) o += `<circle cx="${r() * 640}" cy="${r() * 520}" r="${0.6 + r() * 2}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
  const mx = 140 + r() * 360, my = 150 + r() * 180, mr = 55 + r() * 45;
  o += `<circle cx="${mx}" cy="${my}" r="${mr * 1.8}" fill="${c(170, 80)}" opacity=".35" filter="url(#b)"/><circle cx="${mx}" cy="${my}" r="${mr}" fill="${c(170, 88, 70)}"/>`;
  for (let i = 0; i < 4; i++) {
    const x = 90 + r() * 460, y = 380 + i * 130 + r() * 50, w = 70 + r() * 90;
    o += `<path d="M${x - w} ${y} Q${x} ${y - 28} ${x + w} ${y} L${x + w * 0.15} ${y + w * 0.9} Q${x} ${y + w} ${x - w * 0.15} ${y + w * 0.9}Z" fill="${c(20 + i * 25, 22 + i * 4)}"/>`;
    o += `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="14" fill="${c(110, 52)}"/>`;
    if (r() > 0.4) o += `<rect x="${x - 8}" y="${y - 34}" width="16" height="22" fill="${c(60, 85, 70)}"/><path d="M${x - 12} ${y - 34} L${x} ${y - 52} L${x + 12} ${y - 34}Z" fill="${c(300, 35)}"/>`;
  }
  return o + `</svg>`;
}

function remember(id, img) {
  cache.set(id, img);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function getCard(id, high = true) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const meta = metas.get(id);
  if (!meta) return Promise.resolve(null);
  const p = schedule(async () => {
    const img = (await fetchUpstream(meta)) || { buf: Buffer.from(fallbackSvg(meta.seed)), type: 'image/svg+xml' };
    remember(id, img);
    return img;
  }, high).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

const idOf = url => url.split('/').pop();
const warm = (urls, high) => urls.forEach(u => getCard(idOf(u), high).catch(() => {}));

app.get('/card/:id', async (req, res) => {
  const img = await getCard(req.params.id);
  if (!img) return res.sendStatus(404);
  res.set({ 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400, immutable' });
  res.send(img.buf);
});

// ---------- SALAS ----------
const gameRooms = {};

function newRound() { return { narratorCard: null, playedCards: [], votes: [], narratorPlayed: false }; }

function drawCard(room) {
  if (!room.deck.length) room.deck.push(...buildDeck(room, 20));
  return room.deck.shift();
}

// Cada jogador recebe só a própria mão (antes todos viam as cartas de todos)
function sendState(room) {
  room.players.forEach(p => {
    io.to(p.id).emit('gameStarted', {
      players: room.players.map(q => ({ id: q.id, name: q.name, score: q.score, isNarrator: q.isNarrator, hand: q.id === p.id ? q.hand : [] }))
    });
  });
}

function dealAndWarm(room) {
  room.players.forEach(p => { while (p.hand.length < 5) p.hand.push(drawCard(room)); });
  room.players.forEach(p => warm(p.hand, true));
  warm(room.deck.slice(0, room.players.length * 3), false);
}

setInterval(() => {
  const limit = Date.now() - 6 * 3600 * 1000;
  for (const [id, room] of Object.entries(gameRooms)) {
    if (room.createdAt < limit) {
      room.cardIds.forEach(c => { metas.delete(c); cache.delete(c); });
      delete gameRooms[id];
    }
  }
}, 30 * 60 * 1000);

io.on('connection', (socket) => {
  socket.on('validateRoom', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') socket.emit('roomValidated', { roomId });
    else socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
  });

  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    const room = {
      hostSocketId: socket.id,
      targetScore: parseInt(targetScore) || 30,
      status: 'LOBBY',
      createdAt: Date.now(),
      cardIds: new Set(),
      players: [{ id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false }],
      deck: [],
      currentRound: newRound()
    };
    room.deck = buildDeck(room, 60);
    gameRooms[roomId] = room;
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: room.players });
    warm(room.deck.slice(0, 20), false); // já vai gerando as primeiras cartas enquanto o pessoal entra
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      room.players.push({ id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false });
      socket.join(roomId);
      io.to(roomId).emit('playerJoined', { players: room.players });
      socket.emit('joinedSuccess', { roomId });
    } else {
      socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (!room || room.hostSocketId !== socket.id || room.status !== 'LOBBY') return;
    room.status = 'NARRATOR_TURN';
    room.currentRound = newRound();
    room.players.forEach((p, i) => p.isNarrator = (i === 0));
    dealAndWarm(room);
    sendState(room);
  });

  socket.on('nextRound', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (!room || room.hostSocketId !== socket.id || room.status !== 'ROUND_END') return;
    room.status = 'NARRATOR_TURN';
    room.currentRound = newRound();
    const cur = room.players.findIndex(p => p.isNarrator);
    const next = (cur + 1) % room.players.length;
    room.players.forEach((p, i) => p.isNarrator = (i === next));
    dealAndWarm(room);
    sendState(room);
  });

  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if (!room || room.status !== 'NARRATOR_TURN') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.hand.includes(cardUrl)) return;
    const round = room.currentRound;
    if (!player.isNarrator && !round.narratorPlayed) return;
    if (round.playedCards.some(c => c.playerId === socket.id)) return;

    round.playedCards.push({ playerId: socket.id, cardUrl });
    if (player.isNarrator) {
      round.narratorCard = cardUrl;
      round.narratorPlayed = true;
      io.to(roomId).emit('narratorPlayed');
    }
    if (round.playedCards.length === room.players.length) {
      room.status = 'VOTING_PHASE';
      io.to(roomId).emit('startVotingPhase', { cards: shuffle(round.playedCards).map(c => c.cardUrl) });
    }
  });

  socket.on('voteCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if (!room || room.status !== 'VOTING_PHASE') return;
    const voter = room.players.find(p => p.id === socket.id);
    const round = room.currentRound;
    if (!voter || voter.isNarrator) return;
    if (round.votes.some(v => v.playerId === socket.id)) return;
    const target = round.playedCards.find(c => c.cardUrl === cardUrl);
    if (!target || target.playerId === socket.id) return;

    round.votes.push({ playerId: socket.id, votedCardUrl: cardUrl });
    const expectedVotes = room.players.length - 1;
    if (round.votes.length < expectedVotes) return;

    const narratorCard = round.narratorCard;
    const narrator = room.players.find(p => p.isNarrator);
    const acertos = round.votes.filter(v => v.votedCardUrl === narratorCard).length;

    if (acertos === 0 || acertos === expectedVotes) {
      room.players.forEach(p => { if (!p.isNarrator) p.score += 2; });
    } else {
      narrator.score += 3;
      round.votes.forEach(v => {
        if (v.votedCardUrl === narratorCard) room.players.find(p => p.id === v.playerId).score += 3;
      });
    }
    round.votes.forEach(v => {
      if (v.votedCardUrl !== narratorCard) {
        const owner = round.playedCards.find(c => c.cardUrl === v.votedCardUrl);
        if (owner && owner.playerId !== narrator.id) room.players.find(p => p.id === owner.playerId).score += 1;
      }
    });

    room.players.forEach(p => {
      const played = round.playedCards.find(c => c.playerId === p.id);
      if (played) p.hand = p.hand.filter(h => h !== played.cardUrl);
    });

    room.status = 'ROUND_END';
    io.to(roomId).emit('roundEnded', {
      ranking: [...room.players].sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, isNarrator: p.isNarrator })),
      isGameOver: room.players.some(p => p.score >= room.targetScore),
      targetScore: room.targetScore,
      hostSocketId: room.hostSocketId
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
