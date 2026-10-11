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
      playersLoadedImages: 0, // Novo contador para sincronizar o carregamento
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
      room.playersLoadedImages = 0; // Reseta o contador
      
      // Sorteia o narrador
      const narratorIndex = Math.floor(Math.random() * room.players.length);
      room.players.forEach((p, i) => p.isNarrator = (i === narratorIndex));
      
      // Distribuição de cartas geradas por IA (simulação)
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, (_, i) => `https://picsum.photos/seed/${roomId}${p.name}${i}/200/300`);
      });

      // Dispara o evento apenas mandando as cartas, sem iniciar a rodada visualmente ainda
      io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  // Evento que recebe a confirmação de que um jogador terminou de baixar as imagens
  socket.on('imagesLoaded', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.playersLoadedImages++;
      
      // Verifica se TODOS os jogadores já carregaram as cartas
      if (room.playersLoadedImages === room.players.length) {
        room.status = 'NARRATOR_TURN';
        // Libera a tela para todos ao mesmo tempo
        io.to(roomId).emit('allClientsReady');
      }
    }
  });

  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if(room) {
      console.log(`Jogador ${socket.id} escolheu a carta: ${cardUrl}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
