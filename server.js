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

// Memória Global para evitar repetições entre partidas diferentes
const memoriaCartasGlobais = new Set();

const promptJuizIA = `Você é um curador de arte extremamente rigoroso para um jogo de tabuleiro estilo Dixit. 
Sua tarefa é analisar as URLs de imagens fornecidas e REJEITAR sumariamente qualquer uma que viole as regras abaixo.

REGRA DE REJEIÇÃO ABSOLUTA:
- REJEITE qualquer imagem que mostre rostos humanos fotorrealistas ou proporções anatômicas realistas de pessoas.
- REJEITE fotografias do mundo real, paisagens reais ou pessoas reais.

CRITÉRIO DE APROVAÇÃO:
- APROVE APENAS pinturas, ilustrações abstratas, cenários surreais, oníricos, de fantasia, contos de fadas, ficção ou mitologia.

Retorne APENAS um array JSON contendo as URLs aprovadas. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// REDE AMPLIADA: Mais de 30 categorias para garantir milhares de possibilidades
const temasBusca = [
    "surreal", "dream", "fantasy", "illusion", "bizarre",
    "mystical", "whimsical", "magic", "fairytale", "wonderland",
    "mythology", "steampunk", "space art", "psychedelic", 
    "magical realism", "concept art", "otherworldly", "ethereal", 
    "surrealism", "abstract", "imaginative", "optical illusion",
    "enchanted forest", "alien landscape", "dreamscape", "surreal painting",
    "digital art fantasy", "creepy art", "dreamy illustration", "cyberpunk city",
    "time travel art", "parallel universe"
];

async function buscarCartasPixabay() {
    try {
        const tema = temasBusca[Math.floor(Math.random() * temasBusca.length)];
        // Navega aleatoriamente entre as 30 primeiras páginas do Pixabay
        const randomPage = Math.floor(Math.random() * 30) + 1; 
        
        // Removemos o -human para ampliar a busca, deixando o Juiz IA fazer o trabalho de barrar rostos reais
        const query = encodeURIComponent(`${tema} -portrait -face -photo`);
        
        const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&orientation=vertical&per_page=100&page=${randomPage}&safesearch=true`;
        
        const response = await axios.get(url);
        
        // Filtra as imagens que já saíram em outras partidas (nunca repete!)
        const urlsIneditas = response.data.hits
            .map(hit => hit.largeImageURL)
            .filter(url => !memoriaCartasGlobais.has(url));
            
        return urlsIneditas;
    } catch (error) {
        console.error("Erro no Pixabay:", error.message);
        return [];
    }
}

async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${promptJuizIA}\n\nURLs:\n${JSON.stringify(urls)}`);
        const text = result.response.text();
        const jsonMatch = text.match(/\[.*\]/s);
        
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return urls.slice(0, 15); 
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return urls.slice(0, 15); 
    }
}

async function preencherBau(codigo) {
    const sala = salas[codigo];
    if (!sala || sala.preenchendo) return;
    
    sala.preenchendo = true;
    
    try {
        while (sala.bau.length < 300) {
            let urls = await buscarCartasPixabay();
            if (urls.length === 0) break;
            
            urls = embaralharArray(urls).slice(0, 40);
            
            let aprovadas = await julgarCartas(urls);
            if (aprovadas.length === 0) continue;
            
            // Adiciona as aprovadas à memória global para nunca mais caírem
            aprovadas.forEach(url => memoriaCartasGlobais.add(url));
            
            sala.bau.push(...embaralharArray(aprovadas));
            
            if (sala.estado === 'jogando') {
                io.to(codigo).emit('atualizarSala', sala);
            }
        }
    } catch (err) {
        console.error("Erro no preenchimento do baú:", err);
    } finally {
        sala.preenchendo = false;
    }
}

io.on('connection', (socket) => {
    socket.on('entrarSala', async ({ nome, codigo }) => {
        if (!salas[codigo]) {
            salas[codigo] = {
                jogadores: [], bau: [], mesa: [], narradorIndex: 0, estado: 'aguardando', preenchendo: false
            };
            preencherBau(codigo); 
        }
        
        const sala = salas[codigo];
        const jogador = { id: socket.id, nome, mao: [], pontos: 0 };
        sala.jogadores.push(jogador);
        
        socket.join(codigo);
        
        setTimeout(() => {
            for(let i=0; i<5; i++) {
                if(sala.bau.length > 0) jogador.mao.push(sala.bau.shift());
            }
            io.to(codigo).emit('atualizarSala', sala);
        }, 1500); 
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
            jogador.pontos += 10; 
            
            if(sala.bau.length > 0) jogador.mao.push(sala.bau.shift());
            io.to(codigo).emit('atualizarSala', sala);
            
            if(sala.bau.length < 300) preencherBau(codigo);
        }
    });

    socket.on('disconnect', () => {
        for (const codigo in salas) {
            salas[codigo].jogadores = salas[codigo].jogadores.filter(j => j.id !== socket.id);
            if(salas[codigo].jogadores.length === 0) delete salas[codigo]; 
            else io.to(codigo).emit('atualizarSala', salas[codigo]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Imagination rodando na porta ${PORT}`);
});
