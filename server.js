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
// 🎴 O SEU BARALHO MESTRE (ILUSTRAÇÕES SURREALISTAS)
// =========================================================================
// Aqui pode substituir estes links pelos seus links do Imgur com as cartas oficiais!
// Por agora, coloquei 40 ilustrações geradas com estilo de fantasia e surrealismo.
const MASTER_DECK = [
    "https://image.pollinations.ai/prompt/whimsical_surreal_illustration_of_a_giant_flying_whale_in_a_starry_sky_dixit_board_game_art_style?seed=101&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_fantasy_art_melting_clocks_hanging_from_a_glowing_tree_in_a_desert_dreamlike?seed=102&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_illustration_a_staircase_made_of_books_leading_into_a_giant_glowing_moon?seed=103&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamcore_art_a_door_standing_alone_in_the_middle_of_the_ocean_opening_to_a_galaxy?seed=104&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_watercolor_a_cat_made_of_bright_nebulae_and_stars_playing_with_a_planet?seed=105&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_illustration_giant_teacup_in_a_mystical_forest_pouring_a_colorful_waterfall?seed=106&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surrealism_a_mechanical_steampunk_owl_with_stained_glass_wings_flying?seed=107&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_realism_a_magical_train_driving_through_fluffy_pink_clouds?seed=108&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamlike_illustration_a_floating_house_suspended_by_hundreds_of_giant_colorful_balloons?seed=109&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_art_a_chessboard_where_pieces_are_bizarre_living_mythical_creatures?seed=110&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_art_a_glowing_castle_built_on_the_back_of_a_giant_swimming_turtle?seed=111&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_painting_a_waterfall_of_liquid_gold_falling_into_a_mystical_glowing_pool?seed=112&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_illustration_a_library_with_floating_magical_books_and_glowing_pages?seed=113&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamlike_art_a_clockwork_sun_made_of_gears_radiating_magical_neon_light?seed=114&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_fantasy_a_person_walking_on_a_tightrope_made_of_light_between_two_planets?seed=115&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_illustration_a_hot_air_balloon_shaped_like_a_giant_jellyfish_over_a_desert?seed=116&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_art_a_forest_where_the_trees_are_made_of_crystal_and_glass?seed=117&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surrealism_a_giant_pocket_watch_half_buried_in_snow_glowing_blue?seed=118&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamcore_a_painting_of_a_boat_sailing_on_a_sea_of_clouds_inside_a_frame?seed=119&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_illustration_a_keyhole_in_a_brick_wall_showing_a_vibrant_jungle_inside?seed=120&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_art_a_flock_of_birds_turning_into_autumn_leaves_in_the_sky?seed=121&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_painting_an_hourglass_where_the_sand_is_a_miniature_city_falling_apart?seed=122&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_illustration_a_piano_in_the_middle_of_a_field_playing_glowing_musical_notes?seed=123&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surrealism_a_vintage_lantern_containing_a_tiny_trapped_galaxy?seed=124&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamlike_art_a_giant_tree_whose_roots_are_made_of_flowing_water?seed=125&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_painting_a_bridge_made_of_stars_connecting_two_crescent_moons?seed=126&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_illustration_a_man_with_an_open_birdcage_for_a_head_releasing_glowing_birds?seed=127&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_art_a_carousel_where_the_horses_are_real_mythical_creatures?seed=128&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_realism_a_giant_eye_reflecting_a_stormy_ocean_with_a_ship?seed=129&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surrealism_a_city_skyline_emerging_from_the_pages_of_an_open_book?seed=130&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamcore_a_field_of_giant_glowing_dandelions_under_a_purple_sky?seed=131&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_illustration_a_knight_playing_chess_with_a_dragon_in_a_cave?seed=132&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_painting_a_woman_whose_dress_turns_into_a_flock_of_butterflies?seed=133&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_art_a_hot_air_balloon_carrying_a_small_island_with_a_lighthouse?seed=134&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/magical_illustration_a_pocket_watch_spilling_water_instead_of_sand?seed=135&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surrealism_a_giant_hand_reaching_out_from_the_clouds_holding_a_star?seed=136&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/dreamlike_art_a_maze_made_of_mirrors_reflecting_different_seasons?seed=137&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/fantasy_painting_a_tree_house_in_the_shape_of_a_giant_lantern?seed=138&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/surreal_illustration_a_man_rowing_a_boat_on_a_river_of_stars?seed=139&width=300&height=450&nologo=true",
    "https://image.pollinations.ai/prompt/whimsical_art_a_giant_sleeping_fox_curled_around_a_small_village?seed=140&width=300&height=450&nologo=true"
];
// =========================================================================

io.on('connection', (socket) => {
  console.log(`Novo utilizador ligado: ${socket.id}`);

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
server.listen(PORT, () => console.log(`Servidor Dixit Online rodando na porta ${PORT}`));
