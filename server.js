const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// --- GERADOR DE ARTE SURREALISTA (ESTILO DIXIT) ---
const subjects = [
    "melting clocks in a desert",
    "a giant glowing whale flying in a starry sky",
    "a staircase leading into a giant eye",
    "a tree with glowing butterflies instead of leaves",
    "a door standing alone in the middle of the ocean",
    "floating islands connected by chains",
    "a giant teacup pouring a waterfall",
    "a mechanical owl with stained glass wings",
    "a mirror reflecting a different galaxy",
    "a train driving through the clouds",
    "giant mushrooms glowing in a dark forest",
    "a cat made of nebulae and stars",
    "a house suspended by giant balloons",
    "a labyrinth of endless stairs",
    "a chessboard where pieces are living creatures",
    "a city built on the back of a giant turtle",
    "clouds shaped like mythical beasts",
    "a waterfall of liquid gold",
    "a library with floating books",
    "a clockwork sun radiating magical light"
];

const styles = [
    "Salvador Dali surrealism",
    "Rene Magritte style",
    "dreamcore aesthetic",
    "highly colorful magical realism",
    "psychedelic abstract art",
    "whimsical fantasy illustration",
    "ethereal digital art",
    "vibrant oil painting",
    "intricate surreal masterpiece"
];

function generateUniqueCard() {
    const seed = Math.floor(Math.random() * 9999999);
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const style = styles[Math.floor(Math.random() * styles.length)];
    
    // Prompt rigoroso para garantir a arte
    const prompt = `Surreal masterpiece, ${subject},${style}, vibrant colors, high definition`;
    const encodedPrompt = encodeURIComponent(prompt);
    
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=300&height=450&seed=${seed}&nologo=true`;
}

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

    gameRooms[roomId] = {
      hostSocketId: socket.id,
      targetScore: parseInt(targetScore) || 30,
      status: 'LOBBY',
      players: [hostPlayer], 
      playersLoadedImages: 0,
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
      room.status = 'LOADING_IMAGES';
      room.playersLoadedImages = 0;
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };
      
      room.players.forEach((p, i) => p.isNarrator = (i === 0));
      
      room.players.forEach(p => {
        p.hand = Array.from({length: 5}, () => generateUniqueCard());
      });

      io.to(roomId).emit('gameStarted', { players: room.players });
    }
  });

  socket.on('nextRound', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'ROUND_END') {
        room.status = 'LOADING_IMAGES';
        room.playersLoadedImages = 0;
        room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };

        const currentNarratorIndex = room.players.findIndex(p => p.isNarrator);
        const nextNarratorIndex = (currentNarratorIndex + 1) % room.players.length;
        room.players.forEach((p, i) => p.isNarrator = (i === nextNarratorIndex));

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
