// server.js (Seu arquivo principal do Node.js)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { refillBuffer, drawCards } = require('./cardBuffer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 1. INÍCIO DO JOGO: Dispara o preenchimento do buffer assim que ligar o servidor
console.log("Inicializando servidor. Carregando cartas no buffer...");
refillBuffer(); 

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    // Quando o jogador entra na sala, ele pede a mão inicial
    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        
        // Saca 6 cartas imediatamente da memória RAM do servidor (Latência ZERO)
        const initialHand = drawCards(6);
        
        // Envia as cartas prontas para o jogador
        socket.emit('receiveInitialHand', initialHand);
    });

    // Quando o jogador usa uma carta e precisa comprar outra no fim do turno
    socket.on('drawSingleCard', () => {
        const newCard = drawCards(1);
        socket.emit('receiveNewCard', newCard[0]);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
