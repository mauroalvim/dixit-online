const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const gameRooms = {}; 

// =========================================================================
// 🤖 PINTOR DE CARTAS AUTOMÁTICO DA IA
// =========================================================================
// O servidor vai gerar e guardar 40 cartas inspiradas no Dixit automaticamente.
const pastaCartas = path.join(__dirname, 'public', 'cartas_ia');
if (!fs.existsSync(pastaCartas)) {
    fs.mkdirSync(pastaCartas, { recursive: true });
}

// 40 Ideias surreais para a IA desenhar
const ideias = [
    "whimsical_surreal_illustration_of_a_giant_flying_whale_in_a_starry_sky_dixit_style",
    "surreal_fantasy_art_melting_clocks_hanging_from_a_glowing_tree_in_a_desert",
    "magical_illustration_a_staircase_made_of_books_leading_into_a_giant_glowing_moon",
    "dreamcore_art_a_door_standing_alone_in_the_middle_of_the_ocean_opening_to_a_galaxy",
    "surreal_watercolor_a_cat_made_of_bright_nebulae_and_stars_playing_with_a_planet",
    "fantasy_illustration_giant_teacup_in_a_mystical_forest_pouring_a_colorful_waterfall",
    "surrealism_a_mechanical_steampunk_owl_with_stained_glass_wings_flying",
    "magical_realism_a_magical_train_driving_through_fluffy_pink_clouds",
    "dreamlike_illustration_a_floating_house_suspended_by_hundreds_of_colorful_balloons",
    "surreal_art_a_chessboard_where_pieces_are_bizarre_living_mythical_creatures",
    "whimsical_art_a_glowing_castle_built_on_the_back_of_a_giant_swimming_turtle",
    "fantasy_painting_a_waterfall_of_liquid_gold_falling_into_a_mystical_pool",
    "surreal_illustration_a_library_with_floating_magical_books_and_glowing_pages",
    "dreamlike_art_a_clockwork_sun_made_of_gears_radiating_magical_neon_light",
    "surreal_fantasy_a_person_walking_on_a_tightrope_of_light_between_two_planets",
    "whimsical_illustration_a_hot_air_balloon_shaped_like_a_giant_jellyfish",
    "magical_art_a_forest_where_the_trees_are_made_of_crystal_and_glass",
    "surrealism_a_giant_pocket_watch_half_buried_in_snow_glowing_blue",
    "dreamcore_a_painting_of_a_boat_sailing_on_a_sea_of_clouds_inside_a_frame",
    "fantasy_illustration_a_keyhole_in_a_brick_wall_showing_a_vibrant_jungle",
    "surreal_art_a_flock_of_birds_turning_into_autumn_leaves_in_the_sky",
    "whimsical_painting_an_hourglass_where_the_sand_is_a_miniature_city",
    "magical_illustration_a_piano_in_a_field_playing_glowing_musical_notes",
    "surrealism_a_vintage_lantern_containing_a_tiny_trapped_galaxy",
    "dreamlike_art_a_giant_tree_whose_roots_are_made_of_flowing_water",
    "fantasy_painting_a_bridge_made_of_stars_connecting_two_crescent_moons",
    "surreal_illustration_a_man_with_an_open_birdcage_for_a_head",
    "whimsical_art_a_carousel_where_the_horses_are_real_mythical_creatures",
    "magical_realism_a_giant_eye_reflecting_a_stormy_ocean_with_a_ship",
    "surrealism_a_city_skyline_emerging_from_the_pages_of_an_open_book",
    "dreamcore_a_field_of_giant_glowing_dandelions_under_a_purple_sky",
    "fantasy_illustration_a_knight_playing_chess_with_a_dragon_in_a_cave",
    "surreal_painting_a_woman_whose_dress_turns_into_a_flock_of_butterflies",
    "whimsical_art_a_hot_air_balloon_carrying_a_small_island_with_a_lighthouse",
    "magical_illustration_a_pocket_watch_spilling_water_instead_of_sand",
    "surrealism_a_giant_hand_reaching_out_from_the_clouds_holding_a_star",
    "dreamlike_art_a_maze_made_of_mirrors_reflecting_different_seasons",
    "fantasy_painting_a_tree_house_in_the_shape_of_a_giant_lantern",
    "surreal_illustration_a_man_rowing_a_boat_on_a_river_of_stars",
    "whimsical_art_a_giant_sleeping_fox_curled_around_a_small_village"
];

const MASTER_DECK = [];
for(let i = 0; i < 40; i++) {
    MASTER_DECK.push(`/cartas_ia/carta_${i}.jpg`);
}

async function prepararBaralhoInteligente() {
    console.log("Iniciando a pintura das cartas no servidor...");
    for (let i = 0; i < ideias.length; i++) {
        const caminhoArquivo = path.join(pastaCartas, `carta_${i}.jpg`);
        // Só descarrega se a carta ainda não existir na pasta
        if (!fs.existsSync(caminhoArquivo)) {
            const url = `https://image.pollinations.ai/prompt/${ideias[i]}?width=300&height=450&nologo=true`;
            await new Promise((resolve) => {
                https.get(url, (res) => {
                    if (res.statusCode === 200) {
                        res.pipe(fs.createWriteStream(caminhoArquivo)).on('finish', resolve);
                    } else {
                        resolve();
                    }
                }).on('error', resolve);
            });
            // Espera 1.5 segundos entre cada carta para a IA não bloquear o servidor!
            await new Promise(r => setTimeout(r, 1500)); 
            console.log(`Carta ${i+1}/40 pintada!`);
        }
    }
    console.log("O Baralho Oficial IA está 100% pronto!");
}
// Roda o robô de pintura em segundo plano quando o servidor liga
prepararBaralhoInteligente();
// =========================================================================

io.on('connection', (socket) => {
  console.log(`Novo jogador conectado: ${socket.id}`);

  socket.on('validateRoom', ({ roomId }) => {
      const room = gameRooms[roomId];
      if (room && room.status === 'LOBBY') {
          socket.emit('roomValidated', { roomId });
      } else {
          socket.emit('joinError', { message: 'Sala não encontrada ou partida em andamento!' });
      }
  });

  socket.on('createRoom', ({ targetScore, playerName }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString(); 
    const hostPlayer = { id: socket.id, name: playerName, score: 0, hand: [], isNarrator: false };

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
      socket.emit('joinError', { message: 'Sala não encontrada ou partida em andamento!' });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (room) {
      room.status = 'NARRATOR_TURN';
      room.currentRound = { hint: "", narratorCard: null, playedCards: [], votes: [], narratorPlayed: false };
      
      room.players.forEach((p, i) => p.isNarrator = (i === 0));
      
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

        room.players.forEach(p => {
            const cardsNeeded = 5 - p.hand.length;
            for(let i = 0; i < cardsNeeded; i++) {
                if (room.deck.length > 0) {
                    p.hand.push(room.deck.splice(0, 1)[0]);
                } else {
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
server.listen(PORT, () => console.log(`Servidor Dixit Online a rodar na porta ${PORT}`));
