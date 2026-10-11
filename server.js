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

  // Agora o Host envia o próprio nome ao criar a sala para ser incluído como jogador
  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Cria o jogador Host
    const hostPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };

    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: targetScore,
      status: 'LOBBY',
      players: [hostPlayer], // Host já começa na lista de jogadores
      currentRound: { hint: "", narratorCard: null, playedCards: [], votes: [] }
    };
    
    socket.join(roomId);
    // Retorna a criação e já manda a lista de jogadores com o Host nela
    socket.emit('roomCreated', { roomId, players: gameRooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      const newPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };
      room.players.push(newPlayer);
      socket.join(roomId);
      
      // Avisa a sala inteira (incluindo o host) que a lista de jogadores atualizou
      io.to(roomId).emit('playerJoined', { players: room.players });
      
      // Confirma para o jogador que ele entrou com sucesso
      socket.emit('joinedSuccess', { roomId });
    } else {
      socket.emit('joinError', { message: 'Sala não encontrada ou partida já em andamento!' });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.status = 'NARRATOR_TURN';
      
      // Sorteia o narrador
      const narratorIndex = Math.floor(Math.random() * room.players.length);
      room.players.forEach((p, i) => p.isNarrator = (i === narratorIndex));
      
      // Simulação de distribuição de cartas/imagens para TODOS os jogadores (incluindo o Host)
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, (_, i) => `https://picsum.photos/seed/${roomId}${p.name}${i}/200/300`);
      });

      io.to(roomId).emit('gameStarted', { players: room.players, status: room.status });
    }
  });

  // Novo evento para lidar com a seleção da carta pelo jogador
  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if(room) {
      console.log(`Jogador ${socket.id} escolheu a carta: ${cardUrl}`);
      // Lógica futura: salvar a carta na currentRound.playedCards e verificar se todos jogaram
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
