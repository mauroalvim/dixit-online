const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// =========================================================================
// 🤖 GERADOR DE BARALHO INFINITO (LEXICA.ART / STABLE DIFFUSION)
// =========================================================================
async function fetchAIImages() {
    return new Promise((resolve) => {
        const prompts = [
            'surrealism masterpiece salvador dali', 
            'dreamcore aesthetic fantasy illustration', 
            'magical realism bizarre landscape', 
            'whimsical dreamlike concept art',
            'dixit board game style illustration'
        ];
        const prompt = prompts[Math.floor(Math.random() * prompts.length)];
        const url = `https://lexica.art/api/v1/search?q=${encodeURIComponent(prompt)}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.images && json.images.length > 0) {
                        const urls = json.images.map(img => img.src).slice(0, 50);
                        resolve(urls);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', () => {
            resolve([]);
        });
    });
}

function getFallbackDeck() {
    const deck = [];
    for(let i = 0; i < 50; i++) {
        deck.push(`https://image.pollinations.ai/prompt/surreal_fantasy_art_${Math.floor(Math.random()*10000)}?width=300&height=450&nologo=true`);
    }
    return deck;
}
// =========================================================================

io.on('connection', (socket) => {
  console.log(`Novo jogador conectado: ${socket.id}`);

  socket.on('validateRoom', ({ roomId }) => {
      const room = gameRooms[roomId];
      if (room && room.status === 'LOBBY') {
          socket.emit('roomValidated', { roomId });
      } else {
          socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
      }
  });

  socket.on('createRoom', async ({ targetScore, playerName }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString(); 
    const hostPlayer = { id: socket.id, name: playerName || `Host-${roomId}`, score: 0, hand: [], isNarrator: false };

    // Informa o cliente que o baralho inteligente está a ser criado
    socket.emit('generatingDeck');

    let aiDeck = await fetchAIImages();
    if (aiDeck.length < 10) aiDeck = getFallbackDeck();

    const shuffledDeck = aiDeck.sort(() => Math.random() - 0.5);

    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: parseInt(targetScore) || 30,
      status: 'LOBBY',
      players: [hostPlayer], 
      deck: shuffledDeck, 
      currentRound: { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false }
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: gameRooms[roomId].players });
    console.log(`Sala ${roomId} criada por ${hostPlayer.name}`);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      const name = playerName || `Jogador-${socket.id.substring(0,4)}`;
      const newPlayer = { id: socket.id, name: name, score: 0, hand: [], isNarrator: false };
      room.players.push(newPlayer);
      socket.join(roomId);
      
      io.to(roomId).emit('playerJoined', { players: room.players });
      socket.emit('joinedSuccess', { roomId });
      console.log(`${name} entrou na sala ${roomId}`);
    } else {
      socket.emit('joinError', { message: 'Sala não encontrada ou partida em andamento!' });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.status = 'NARRATOR_TURN';
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };
      
      // Define o primeiro jogador como Narrador
      room.players.forEach((p, i) => p.isNarrator = (i === 0));
      
      // Distribui 5 cartas do Buffer para cada jogador
      room.players.forEach(p => { p.hand = room.deck.splice(0, 5); });
      
      io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  socket.on('nextRound', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'ROUND_END') {
        room.status = 'NARRATOR_TURN';
        room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };

        const currentNarratorIndex = room.players.findIndex(p => p.isNarrator);
        const nextNarratorIndex = (currentNarratorIndex + 1) % room.players.length;
        room.players.forEach((p, i) => p.isNarrator = (i === nextNarratorIndex));

        room.players.forEach(p => {
            const cardsNeeded = 5 - p.hand.length;
            for(let i = 0; i < cardsNeeded; i++) {
                if (room.deck.length > 0) {
                    p.hand.push(room.deck.splice(0, 1)[0]);
                } else {
                    room.deck = getFallbackDeck(); // Recarrega o buffer se acabar
                    p.hand.push(room.deck.splice(0, 1)[0]);
                }
            }
        });
        io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if(room) {
      const narrator = room.players.find(p => p.isNarrator);
      const isNarratorPlaying = (narrator && narrator.id === socket.id);

      if (!isNarratorPlaying && !room.currentRound.narratorPlayed) return;

      const alreadyPlayed = room.currentRound.playedCards.find(c => c.playerId === socket.id);
      if (!alreadyPlayed) {
        room.currentRound.playedCards.push({ playerId: socket.id, cardUrl: cardUrl });
        if (isNarratorPlaying) {
            room.currentRound.narratorCard = cardUrl;
            room.currentRound.narratorPlayed = true;
            io.to(roomId).emit('narratorPlayed');
        }
      }

      if (room.currentRound.playedCards.length === room.players.length) {
        room.status = 'VOTING_PHASE';
        const shuffledCards = [...room.currentRound.playedCards].sort(() => Math.random() - 0.5);
        const cardsToVote = shuffledCards.map(c => c.cardUrl);
        io.to(roomId).emit('startVotingPhase', { cards: cardsToVote });
      }
    }
  });

  socket.on('voteCard', ({ roomId, cardUrl }) => {
      const room = gameRooms[roomId];
      if (room) {
          const isNarrator = room.players.find(p => p.id === socket.id)?.isNarrator;
          if (isNarrator) return; // Narrador não vota

          room.currentRound.votes.push({ playerId: socket.id, votedCardUrl: cardUrl });
          const expectedVotes = room.players.length - 1; 
          
          if (room.currentRound.votes.length === expectedVotes) {
              const narratorCard = room.currentRound.narratorCard;
              const narratorPlayer = room.players.find(p => p.isNarrator);
              
              let acertos = 0;
              room.currentRound.votes.forEach(v => { if(v.votedCardUrl === narratorCard) acertos++; });

              // Regra Oficial Dixit
              if (acertos === 0 || acertos === expectedVotes) {
                  room.players.forEach(p => { if(!p.isNarrator) p.score += 2; });
              } else {
                  narratorPlayer.score += 3;
                  room.currentRound.votes.forEach(v => {
                      if(v.votedCardUrl === narratorCard) {
                          const voter = room.players.find(p => p.id === v.playerId);
                          if(voter) voter.score += 3;
                      }
                  });
              }

              // Ponto extra para quem enganou
              room.currentRound.votes.forEach(v => {
                  if (v.votedCardUrl !== narratorCard) {
                      const ownerOfCard = room.currentRound.playedCards.find(c => c.cardUrl === v.votedCardUrl);
                      if(ownerOfCard && ownerOfCard.playerId !== narratorPlayer.id) {
                          const owner = room.players.find(p => p.id === ownerOfCard.playerId);
                          if(owner) owner.score += 1;
                      }
                  }
              });

              // Remove as cartas jogadas da mão
              room.players.forEach(p => {
                  const pCard = room.currentRound.playedCards.find(c => c.playerId === p.id);
                  if (pCard) { p.hand = p.hand.filter(h => h !== pCard.cardUrl); }
              });

              room.status = 'ROUND_END';
              const isGameOver = room.players.some(p => p.score >= room.targetScore);
              const ranking = [...room.players].sort((a, b) => b.score - a.score);

              io.to(roomId).emit('roundEnded', { 
                  ranking, 
                  isGameOver, 
                  targetScore: room.targetScore,
                  hostSocketId: room.hostSocketId
              });
          }
      }
  });
  
  socket.on('disconnect', () => {
      console.log('Jogador desconectado:', socket.id);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Servidor Dixit Online rodando na porta ${port}`));
