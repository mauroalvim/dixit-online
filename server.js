
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

  socket.on('createRoom', ({ targetScore }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: targetScore,
      status: 'LOBBY',
      players: [],
      currentRound: { hint: "", narratorCard: null, playedCards: [], votes: [] }
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      const newPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };
      room.players.push(newPlayer);
      socket.join(roomId);
      io.to(room.hostSocketId).emit('playerJoined', { players: room.players });
      socket.emit('joinedSuccess', { roomId, playerName });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.status = 'NARRATOR_TURN';
      // Sorteia o narrador
      const narratorIndex = Math.floor(Math.random() * room.players.length);
      room.players.forEach((p, i) => p.isNarrator = (i === narratorIndex));
      
      // Aqui integraria a chamada da IA para gerar imagens únicas para a mão de cada jogador
      // Exemplo fictício de distribuição de URLs geradas:
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, (_, i) => `https://picsum.photos/seed/${roomId}${p.name}${i}/200/300`);
      });

      io.to(roomId).emit('gameStarted', { players: room.players, status: room.status });
    }
  });

  // Outros eventos (narratorPlay, playerPlay, vote) seguiriam a mesma lógica baseada no nosso plano
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
