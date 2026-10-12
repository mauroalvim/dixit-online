const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const salas = {};

const promptJuizIA = `Você é um curador de arte extremamente rigoroso para um jogo de tabuleiro estilo Dixit. 
Sua tarefa é analisar as URLs de imagens fornecidas e REJEITAR sumariamente qualquer uma que viole as regras abaixo.

REGRA DE REJEIÇÃO ABSOLUTA:
- REJEITE qualquer imagem que mostre rostos humanos fotorrealistas ou proporções anatômicas realistas de pessoas.
- REJEITE fotografias do mundo real ou imagens geradas por IA que tentem simular fotografias reais (mesmo que com filtros).

CRITÉRIO DE APROVAÇÃO:
- APROVE APENAS pinturas, ilustrações abstratas, cenários surreais, oníricos ou de fantasia, onde as figuras (se houverem) sejam claramente estilizadas, cartunescas ou silhuetas.

Retorne APENAS um array JSON contendo as URLs aprovadas. Exemplo: ["url1", "url2"]`;

// Função para embaralhar as cartas (Fisher-Yates) - ISSO RESOLVE O PROBLEMA DO RANDOM
function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function buscarCartasPixabay() {
    try {
        // Adicionando um fator de página aleatória para trazer lotes diferentes do Pixabay
        const randomPage = Math.floor(Math.random() * 5) + 1; 
        const query = encodeURIComponent("surreal abstract -portrait -face -human");
        const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&per_page=40&page=${randomPage}&safesearch=true`;
        
        const response = await axios.get(url);
        return response.data.hits.map(hit => hit.largeImageURL);
    } catch (error) {
        console.error("Erro no Pixabay:", error.message);
        return [];
    }
}

async function buscarCartasWikimedia() {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=images&titles=Surrealism&gimlimit=30&iiprop=url`;
        const response = await axios.get(url);
        const pages = response.data.query.pages;
        return Object.values(pages).map(p => p.imageinfo[0].url).filter(url => url.match(/\.(jpeg|jpg|png)$/i));
    } catch (error) {
        console.error("Erro no Wikimedia:", error.message);
        return ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Shakespeare_The_Tempest_-_Project_Gutenberg_eText_18271.jpg/800px-Shakespeare_The_Tempest_-_Project_Gutenberg_eText_18271.jpg"];
    }
}

async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${promptJuizIA}\n\nURLs para análise:\n${JSON.stringify(urls)}`);
        const text = result.response.text();
        const jsonMatch = text.match(/\[.*\]/s);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return urls.slice(0, 10); 
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return urls.slice(0, 10); 
    }
}

async function reabastecerBau(salaId) {
    const sala = salas[salaId];
    if (sala.bau.length < 25) {
        let urls = await buscarCartasPixabay();
        if (urls.length < 10) urls = urls.concat(await buscarCartasWikimedia());
        
        let aprovadas = await julgarCartas(urls);
        
        // Aplica o embaralhamento forte antes de colocar no baú da sala
        aprovadas = embaralharArray(aprovadas);
        
        sala.bau.push(...aprovadas);
    }
}

io.on('connection', (socket) => {
    socket.on('entrarSala', async ({ nome, codigo }) => {
        if (!salas[codigo]) {
            salas[codigo] = {
                jogadores: [],
                bau: [],
                mesa: [],
                narradorIndex: 0,
                estado: 'aguardando'
            };
            await reabastecerBau(codigo);
        }
        
        const sala = salas[codigo];
        const jogador = { id: socket.id, nome, mao: [], pontos: 0 };
        sala.jogadores.push(jogador);
        
        socket.join(codigo);
        
        // Garante que o jogador receba 5 cartas aleatórias iniciais se o baú tiver cartas
        for(let i=0; i<5; i++) {
            if(sala.bau.length > 0) jogador.mao.push(sala.bau.shift());
        }
        
        io.to(codigo).emit('atualizarSala', sala);
        reabastecerBau(codigo);
    });

    socket.on('iniciarPartida', (codigo) => {
        if(salas[codigo] && salas[codigo].jogadores.length >= 2) {
            salas[codigo].estado = 'jogando';
            io.to(codigo).emit('atualizarSala', salas[codigo]);
        }
    });

    socket.on('jogarCarta', ({ codigo, cartaUrl }) => {
        const sala = salas[codigo];
        if(!sala) return;
        
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if(jogador) {
            jogador.mao = jogador.mao.filter(c => c !== cartaUrl);
            sala.mesa.push({ jogadorId: socket.id, cartaUrl, votos: [] });
            
            // Simulação de pontuação
            jogador.pontos += 10; 
            
            if(sala.bau.length > 0) jogador.mao.push(sala.bau.shift());
            
            io.to(codigo).emit('atualizarSala', sala);
            reabastecerBau(codigo);
        }
    });

    socket.on('disconnect', () => {
        for (const codigo in salas) {
            salas[codigo].jogadores = salas[codigo].jogadores.filter(j => j.id !== socket.id);
            if(salas[codigo].jogadores.length === 0) {
                delete salas[codigo]; 
            } else {
                io.to(codigo).emit('atualizarSala', salas[codigo]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Imagination rodando na porta ${PORT}`);
});
