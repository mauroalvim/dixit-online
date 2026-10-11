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
// 🎴 SEU REPOSITÓRIO DE CARTAS (A SUA IDEIA DO PINTEREST/IMGUR)
// =========================================================================
// Aqui estão 40 links diretos de imagens abstratas e coloridas para garantir
// que o jogo não trave. Você pode apagar esses links e colocar os seus
// do Pinterest, Imgur, etc. Lembre-se que o link deve terminar em .jpg ou .png
const MASTER_DECK = [
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1506744626753-1fa44df14d28?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1497215848122-330104711311?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1505909182942-e2f09aee3e89?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1524169358666-79f22534bc6e?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1519120944692-1a8d8cfc107f?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1464802686167-b939a6910659?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1515405295579-ba7b45403062?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1501862700950-18382cd41497?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1484589065579-248aad0d8e93?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1549490349-8643362247b5?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1574169208507-84376144848b?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1552083375-1447ce886485?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1563089145-599997674d42?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1551009175-8a68da93d5f9?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1579546929662-711aa81148cf?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1557672199-6e8c8b2b8faa?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1561214115-f2f119cd5e80?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1563089145-599997674d42?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1566041510639-8d95a2490bfb?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1568283626786-fb7131751dce?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1573511190529-672522718e87?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1574169208507-84376144848b?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1574169208536-c953e05c1440?w=300&h=450&fit=crop",
    "https://images.unsplash.com/photo-1576502200916-3808e07386a5?w=300&h=450&fit=crop"
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
