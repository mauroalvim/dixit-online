const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const cors = require('cors');
require('dotenv').config(); // Necessário para não dar aquele erro no Render

// Importações dos seus módulos
const { generateSurrealImage } = require('./googleApi');
const { refillBuffer, drawCards } = require('./cardBuffer');

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// A MÁGICA AQUI: Serve os arquivos da pasta 'public' (tira a tela branca)
app.use(express.static('public'));
// ----------------------------------------------------

// Inicializa o buffer de cartas do servidor
console.log("Inicializando servidor. Carregando cartas no buffer...");
refillBuffer(); 

// Rota da API do Google
app.post('/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        const imageUrl = await generateSurrealImage(prompt);
        res.json({ imageUrl });
    } catch (error) {
        console.error("Erro na rota /generate-image:", error);
        res.status(500).json({ error: 'Falha ao gerar imagem' });
    }
});

let rooms = {};

// Lógica de conexão dos jogadores
io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('joinRoom', (roomId, playerName) => {
        socket.join(roomId);
        
        // Gerencia as salas e jogadores
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                host: socket.id,
                gameStarted: false
            };
        }
        
        // Garante que playerName exista para evitar erros
        const name = playerName || `Jogador-${socket.id.substring(0,4)}`;
        rooms[roomId].players.push({ id: socket.id, name: name, score: 0 });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        console.log(`${name} joined room ${roomId}`);

        // Saca 6 cartas imediatamente da memória RAM do servidor
        const initialHand = drawCards(6);
        
        // Envia as cartas prontas para o jogador
        socket.emit('receiveInitialHand', initialHand);
    });

    // Quando o jogador usa uma carta e precisa comprar outra no fim do turno
    socket.on('drawSingleCard', () => {
        const newCard = drawCards(1);
        socket.emit('receiveNewCard', newCard[0]);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        // Aqui você pode adicionar lógica para remover o jogador da sala 'rooms' se quiser
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
