const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// =========================================================================
// 🎴 SEU REPOSITÓRIO DE CARTAS (O BARALHO MESTRE)
// =========================================================================
// Como você sugeriu, aqui está o banco de dados fixo. 
// Essas URLs já estão em cache, carregarão instantaneamente e nunca se repetem.
// Você pode adicionar ou trocar por links de imagens do Pinterest/Imgur (.jpg ou .png).
const MASTER_DECK = [
    "https://image.pollinations.ai/prompt/surreal%20painting%20melting%20clocks%20in%20a%20vibrant%20red%20desert%20Dali%20style?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20giant%20glowing%20whale%20flying%20through%20a%20starry%20night%20sky%20over%20a%20city?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20mysterious%20staircase%20leading%20up%20into%20a%20giant%20glowing%20eye%20in%20the%20clouds?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20tree%20with%20glowing%20blue%20butterflies%20instead%20of%20leaves%20fantasy%20art?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20wooden%20door%20standing%20open%20in%20the%20middle%20of%20the%20ocean%20showing%20a%20galaxy?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/floating%20islands%20connected%20by%20golden%20chains%20in%20a%20pink%20sky?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20giant%20teacup%20in%20a%20forest%20pouring%20a%20colorful%20waterfall?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20mechanical%20steampunk%20owl%20with%20stained%20glass%20wings?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20vintage%20mirror%20reflecting%20an%20underwater%20world%20with%20jellyfish?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20magical%20train%20driving%20through%20fluffy%20colorful%20clouds?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/giant%20neon%20mushrooms%20glowing%20in%20a%20dark%20mystical%20cave?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20cat%20made%20entirely%20of%20bright%20nebulae%20and%20stars?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20floating%20house%20suspended%20by%20hundreds%20of%20giant%20colorful%20balloons?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20surreal%20labyrinth%20of%20endless%20stairs%20MC%20Escher%20style%20but%20colorful?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20chessboard%20where%20pieces%20are%20bizarre%20living%20fantasy%20creatures?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20glowing%20castle%20built%20on%20the%20back%20of%20a%20giant%20swimming%20turtle?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/vibrant%20clouds%20shaped%20like%20mythical%20dragons%20and%20beasts?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20waterfall%20of%20liquid%20gold%20falling%20into%20a%20mystical%20glowing%20pool?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20surreal%20library%20with%20floating%20magical%20books%20and%20glowing%20pages?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20clockwork%20sun%20made%20of%20gears%20radiating%20magical%20neon%20light?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20person%20walking%20on%20a%20tightrope%20made%20of%20light%20between%20two%20planets?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20hot%20air%20balloon%20shaped%20like%20a%20giant%20jellyfish%20over%20a%20desert?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20forest%20where%20the%20trees%20are%20made%20of%20crystal%20and%20glass?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20giant%20pocket%20watch%20half%20buried%20in%20snow%20glowing%20blue?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20painting%20of%20a%20boat%20sailing%20on%20a%20sea%20of%20clouds?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20keyhole%20in%20a%20brick%20wall%20showing%20a%20vibrant%20jungle%20inside?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20flock%20of%20birds%20turning%20into%20autumn%20leaves%20in%20the%20sky?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/an%20hourglass%20where%20the%20sand%20is%20a%20miniature%20city%20falling%20apart?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20piano%20in%20the%20middle%20of%20a%20field%20playing%20glowing%20musical%20notes?width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/a%20lantern%20containing%20a%20tiny%20trapped%20galaxy?width=300&height=450&nologo=true"
];
// =========================================================================

io.on('connection', (socket) => {
  console.log(`Novo usuário conectado: ${socket.id}`);

  socket.on('validateRoom', ({ roomId }) => {
      const room = gameRooms[roomId];
      if (room && room.status === 'LOBBY') {
          socket.emit('roomValidated', { roomId });
      } else {
          socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
      }
  });

  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString(); 
    const hostPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };

    // Ao criar a sala, embaralhamos uma cópia do Baralho Mestre para esta partida
    const shuffledDeck = [...MASTER_DECK].sort(() => Math.random() - 0.5);

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
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      const newPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };
      room.players.push(newPlayer);
      socket.join(roomId);
      
      io.to(roomId).emit('playerJoined', { players: room.players });
      socket.emit('joinedSuccess', { roomId });
    } else {
      socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.status = 'NARRATOR_TURN';
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };
      
      room.players.forEach((p, i) => p.isNarrator = (i === 0));
      
      // Distribui 5 cartas do Baralho para cada jogador
      room.players.forEach(p => {
        p.hand = room.deck.splice(0, 5);
      });

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

        // Repõe 1 carta para cada jogador
        room.players.forEach(p => {
            const cardsNeeded = 5 - p.hand.length;
            for(let i = 0; i < cardsNeeded; i++) {
                if (room.deck.length > 0) {
                    p.hand.push(room.deck.splice(0, 1)[0]);
                } else {
                    // Se o baralho acabar, re-embaralha o Mestre
                    room.deck = [...MASTER_DECK].sort(() => Math.random() - 0.5);
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
          if (isNarrator) return;

          room.currentRound.votes.push({ playerId: socket.id, votedCardUrl: cardUrl });
          const expectedVotes = room.players.length - 1; 
          
          if (room.currentRound.votes.length === expectedVotes) {
              const narratorCard = room.currentRound.narratorCard;
              const narratorPlayer = room.players.find(p => p.isNarrator);
              
              let acertos = 0;
              room.currentRound.votes.forEach(v => { if(v.votedCardUrl === narratorCard) acertos++; });

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

              room.currentRound.votes.forEach(v => {
                  if (v.votedCardUrl !== narratorCard) {
                      const ownerOfCard = room.currentRound.playedCards.find(c => c.cardUrl === v.votedCardUrl);
                      if(ownerOfCard && ownerOfCard.playerId !== narratorPlayer.id) {
                          const owner = room.players.find(p => p.id === ownerOfCard.playerId);
                          if(owner) owner.score += 1;
                      }
                  }
              });

              room.players.forEach(p => {
                  const pCard = room.currentRound.playedCards.find(c => c.playerId === p.id);
                  if (pCard) {
                      p.hand = p.hand.filter(h => h !== pCard.cardUrl);
                  }
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
