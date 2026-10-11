const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados em memória
const gameRooms = {}; 

io.on('connection', (socket) => {
  console.log(`Novo usuário conectado: ${socket.id}`);

  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const hostPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };

    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: targetScore,
      status: 'LOBBY',
      players: [hostPlayer], 
      playersLoadedImages: 0,
      currentRound: { hint: "", narratorCard: null, playedCards: [], votes: [] }
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
      room.status = 'LOADING_IMAGES';
      room.playersLoadedImages = 0;
      
      // Limpa a rodada atual caso seja uma nova rodada
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [] };
      
      // Sorteia o narrador
      const narratorIndex = Math.floor(Math.random() * room.players.length);
      room.players.forEach((p, i) => p.isNarrator = (i === narratorIndex));
      
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, (_, i) => `https://picsum.photos/seed/${roomId}${p.name}${i}/200/300`);
      });

      io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  socket.on('imagesLoaded', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.playersLoadedImages++;
      
      if (room.playersLoadedImages === room.players.length) {
        room.status = 'NARRATOR_TURN';
        io.to(roomId).emit('allClientsReady');
      }
    }
  });

  // Onde a mágica da Fase de Escolha acontece:
  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if(room) {
      // Evita que o mesmo jogador envie duas vezes
      const alreadyPlayed = room.currentRound.playedCards.find(c => c.playerId === socket.id);
      if (!alreadyPlayed) {
        room.currentRound.playedCards.push({ playerId: socket.id, cardUrl: cardUrl });
      }

      // Se todos os jogadores já escolheram suas cartas
      if (room.currentRound.playedCards.length === room.players.length) {
        room.status = 'VOTING_PHASE';
        
        // Embaralha as cartas jogadas para ninguém saber de quem é qual (Algoritmo Fisher-Yates)
        const shuffledCards = [...room.currentRound.playedCards].sort(() => Math.random() - 0.5);
        
        // Envia apenas as URLs (esconde os IDs dos jogadores)
        const cardsToVote = shuffledCards.map(c => c.cardUrl);
        
        io.to(roomId).emit('startVotingPhase', { cards: cardsToVote });
      }
    }
  });

  // Onde a mágica da Fase de Votação acontece:
  socket.on('voteCard', ({ roomId, cardUrl }) => {
      const room = gameRooms[roomId];
      if (room) {
          room.currentRound.votes.push({ playerId: socket.id, votedCardUrl: cardUrl });
          
          // Em Dixit, o Narrador não vota. Então esperamos os votos de (Total de Jogadores - 1)
          const expectedVotes = room.players.length - 1;
          
          if (room.currentRound.votes.length === expectedVotes) {
              room.status = 'ROUND_END';
              // Avisa que os votos acabaram. Na próxima etapa faremos o cálculo dos pontos!
              io.to(roomId).emit('roundEnded', { 
                  playedCards: room.currentRound.playedCards, 
                  votes: room.currentRound.votes 
              });
          }
      }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
