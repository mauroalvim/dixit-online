const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// Função para gerar URLs de cartas únicas e evitar repetições
function generateUniqueCard() {
    const randomSeed = Math.random().toString(36).substring(2, 10);
    return `https://picsum.photos/seed/${randomSeed}/200/300`;
}

io.on('connection', (socket) => {
  console.log(`Novo usuário conectado: ${socket.id}`);

  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const hostPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };

    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: parseInt(targetScore) || 30,
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
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [] };
      
      // Sorteia o primeiro narrador
      room.players.forEach((p, i) => p.isNarrator = (i === 0));
      
      // Distribui 5 cartas ÚNICAS para todos
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, () => generateUniqueCard());
      });

      io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  // Função para avançar de rodada
  socket.on('nextRound', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'ROUND_END') {
        room.status = 'LOADING_IMAGES';
        room.playersLoadedImages = 0;
        room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [] };

        // Passa o narrador para o próximo
        const currentNarratorIndex = room.players.findIndex(p => p.isNarrator);
        const nextNarratorIndex = (currentNarratorIndex + 1) % room.players.length;
        room.players.forEach((p, i) => p.isNarrator = (i === nextNarratorIndex));

        // Repõe a mão dos jogadores para sempre terem 5 cartas
        room.players.forEach(p => {
            const cardsNeeded = 5 - p.hand.length;
            for(let i = 0; i < cardsNeeded; i++) {
                p.hand.push(generateUniqueCard());
            }
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

  socket.on('playCard', ({ roomId, cardUrl }) => {
    const room = gameRooms[roomId];
    if(room) {
      // Salva qual é a carta oficial do narrador
      const narrator = room.players.find(p => p.isNarrator);
      if (narrator && narrator.id === socket.id) {
          room.currentRound.narratorCard = cardUrl;
      }

      const alreadyPlayed = room.currentRound.playedCards.find(c => c.playerId === socket.id);
      if (!alreadyPlayed) {
        room.currentRound.playedCards.push({ playerId: socket.id, cardUrl: cardUrl });
      }

      // Quando todos jogarem as cartas
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
          room.currentRound.votes.push({ playerId: socket.id, votedCardUrl: cardUrl });
          
          const expectedVotes = room.players.length - 1; // Narrador não vota
          
          // Quando todos votarem
          if (room.currentRound.votes.length === expectedVotes) {
              const narratorCard = room.currentRound.narratorCard;
              const narratorPlayer = room.players.find(p => p.isNarrator);
              
              let acertos = 0;
              room.currentRound.votes.forEach(v => { if(v.votedCardUrl === narratorCard) acertos++; });

              // LÓGICA DE PONTUAÇÃO DO DIXIT
              if (acertos === 0 || acertos === expectedVotes) {
                  // Todos acertaram ou todos erraram (Narrador = 0, Outros = 2)
                  room.players.forEach(p => { if(!p.isNarrator) p.score += 2; });
              } else {
                  // Alguns acertaram (Narrador = 3, Quem acertou = 3)
                  narratorPlayer.score += 3;
                  room.currentRound.votes.forEach(v => {
                      if(v.votedCardUrl === narratorCard) {
                          const voter = room.players.find(p => p.id === v.playerId);
                          if(voter) voter.score += 3;
                      }
                  });
              }

              // Ponto bônus por enganar os outros
              room.currentRound.votes.forEach(v => {
                  if (v.votedCardUrl !== narratorCard) {
                      const ownerOfCard = room.currentRound.playedCards.find(c => c.cardUrl === v.votedCardUrl);
                      if(ownerOfCard && ownerOfCard.playerId !== narratorPlayer.id) {
                          const owner = room.players.find(p => p.id === ownerOfCard.playerId);
                          if(owner) owner.score += 1;
                      }
                  }
              });

              // Tira as cartas jogadas da mão dos jogadores
              room.players.forEach(p => {
                  const pCard = room.currentRound.playedCards.find(c => c.playerId === p.id);
                  if (pCard) {
                      p.hand = p.hand.filter(h => h !== pCard.cardUrl);
                  }
              });

              room.status = 'ROUND_END';
              
              // Verifica se alguém atingiu a pontuação máxima
              const isGameOver = room.players.some(p => p.score >= room.targetScore);
              
              // Ordena do maior para o menor pontuador
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
