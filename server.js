const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// LISTA DE PROMPTS SURREAIS (Estilo Dixit puro). 
// Por serem fixos e sem 'seed', a IA só vai criá-los UMA VEZ na primeira partida da vida.
// Depois disso, a CDN serve a imagem em milissegundos para todos os jogadores.
const dixitConcepts = [
    "A giant hourglass containing a bustling miniature city in the top and a serene forest in the bottom",
    "A small paper boat sailing on a sea of floating open books under a starry night sky with two moons",
    "A solitary figure walking on a tightrope made of glowing thread between two giant floating teacups",
    "A chessboard where the pieces are different phases of the moon and the board is the night sky",
    "A solitary lighthouse projecting a beam of music notes instead of light over a stormy sea",
    "A child swinging on a swing suspended from a giant crescent moon, above a cloud sea",
    "A keyhole in an old brick wall revealing a vibrant, lush alien jungle",
    "A painter whose brush is creating real, flying birds escaping the canvas",
    "A pair of gentle hands holding a fragile, glowing miniature galaxy",
    "A door opening in the middle of a burning desert, leading into a snowy winter forest",
    "A giant ancient tortoise carrying a bustling medieval castle on its shell",
    "A pocket watch opening to reveal a miniature spinning solar system inside",
    "A bridge made of giant piano keys stretching over a river of flowing watercolor paints",
    "A hot air balloon where the balloon is a giant, glowing jellyfish in the sky",
    "A vintage bicycle with wheels made of sliced citrus fruits riding on a sunny path",
    "A giant tree whose branches are intertwined human hands reaching for the stars",
    "A book open on a desk, a miniature stormy ocean with a pirate ship spilling out of its pages",
    "A lantern containing a tiny, sleeping dragon illuminating a dark mysterious cave",
    "A path of glowing stepping stones leading into a giant, mysterious foggy forest",
    "A clock face where the hands are snakes and the numbers are blooming flowers",
    "A woman whose hair flows naturally into becoming a winding river through a valley",
    "A massive, floating crystal illuminating a ruined, ancient temple in the clouds",
    "A labyrinth of tall mirrors in a desert, reflecting oceans and deep forests",
    "A giant floating eye in the sky crying a waterfall into a dry canyon below",
    "A mechanical owl with stained glass feathers flying towards a mechanical sun",
    "A cozy armchair in a snowy field, a fire burning brightly in a floating fireplace nearby",
    "A twilight sky filled with floating, glowing jellyfish instead of clouds",
    "A staircase made of clouds spiraling up to a glowing golden door in the sky",
    "A desert landscape where the sand dunes are shaped exactly like sleeping giants",
    "A giant compass where the needle points to a glowing, floating heart in the distance",
    "A futuristic city built entirely inside a giant glass bottle floating on a calm sea",
    "A dark forest where the trees are giant mushrooms glowing with bright bioluminescence",
    "A tightrope walker balancing delicately on a thread of light between two glass skyscrapers",
    "A giant sparkling spider web catching shooting stars instead of insects in space",
    "A pair of angel wings made entirely of autumn leaves falling gently to the ground",
    "A formal tea party set up on a giant lily pad in a pond reflecting a magenta sky",
    "A glowing golden key floating above an open palm in a dark, mysterious room",
    "A landscape where the mountain ranges are actually giant, sleeping green dragons",
    "A clockwork heart beating inside a chest made of rusty gears and brass springs",
    "A giant feather falling from the sky, transforming into a flock of white doves",
    "A tall mirror reflecting a person's childhood self holding their hand warmly",
    "A solitary floating island with a single, glowing tree that drops stars as leaves",
    "A vintage steam train driving directly out of a roaring fireplace into a living room",
    "Heavy rain falling upwards from an umbrella into a bright, sunny blue sky",
    "An intricate birdcage with its door open, holding a glowing miniature storm cloud inside"
];

function generateDeck() {
    // Embaralha as cartas disponíveis para a partida
    const shuffled = [...dixitConcepts].sort(() => Math.random() - 0.5);
    
    return shuffled.map(concept => {
        // Adiciona a base de estilo surrealista para forçar o aspecto "Dixit"
        const prompt = concept + ", surreal Dixit board game art style, highly detailed, whimsical, metaphorical, dreamlike masterpiece";
        const encodedPrompt = encodeURIComponent(prompt);
        // Não usar o Math.random() ou seed é essencial para o CDN cache funcionar perfeitamente
        return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=300&height=450&nologo=true`;
    });
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
      deck: generateDeck(), // Gera o baralho otimizado e surreal
      currentRound: { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false }
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: gameRooms[roomId].players });
    socket.emit('preloadCards', { cards: gameRooms[roomId].deck });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = gameRooms[roomId];
    if (room && room.status === 'LOBBY') {
      const newPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };
      room.players.push(newPlayer);
      socket.join(roomId);
      
      io.to(roomId).emit('playerJoined', { players: room.players });
      socket.emit('joinedSuccess', { roomId });
      socket.emit('preloadCards', { cards: room.deck });
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
      
      room.players.forEach(p => {
        p.hand = room.deck.splice(0, 6); // Agora distribuímos 6 cartas por jogador
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

        room.players.forEach(p => {
            const cardsNeeded = 6 - p.hand.length;
            for(let i = 0; i < cardsNeeded; i++) {
                if (room.deck.length > 0) {
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
