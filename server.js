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
const memoriaCartasGlobais = new Set();

const promptJuizIA = `Você é um curador de arte extremamente rigoroso para um jogo de tabuleiro estilo Dixit. 
Sua tarefa é analisar as URLs de imagens fornecidas e REJEITAR sumariamente qualquer uma que viole as regras abaixo.

REGRA DE REJEIÇÃO ABSOLUTA:
- REJEITE qualquer imagem que mostre rostos humanos fotorrealistas ou proporções anatômicas realistas.
- REJEITE fotografias do mundo real.

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

const temasBusca = [
    "surreal", "dream", "fantasy", "illusion", "bizarre",
    "mystical", "whimsical", "magic", "fairytale", "wonderland",
    "mythology", "steampunk", "space art", "psychedelic", 
    "magical realism", "concept art", "otherworldly", "ethereal", 
    "surrealism", "abstract", "imaginative", "optical illusion"
];

// O SEGREDO DA DIVERSIDADE: Puxa 5 temas diferentes ao mesmo tempo e mistura!
async function buscarCartasMisturadasPixabay(quantidadePorTema = 10) {
    try {
        const temasSorteados = embaralharArray([...temasBusca]).slice(0, 5); // Pega 5 temas diferentes
        const promessas = temasSorteados.map(async (tema) => {
            const randomPage = Math.floor(Math.random() * 10) + 1; 
            const query = encodeURIComponent(`${tema} -portrait -face -photo`);
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&orientation=vertical&per_page=${quantidadePorTema}&page=${randomPage}&safesearch=true`;
            
            try {
                const res = await axios.get(url);
                return res.data.hits.map(hit => hit.largeImageURL);
            } catch (e) {
                return [];
            }
        });

        // Aguarda todas as buscas terminarem
        const arraysDeUrls = await Promise.all(promessas);
        
        // Junta todas as respostas num array só (A grande "salada")
        const todasUrls = arraysDeUrls.flat();
        
        const urlsIneditas = todasUrls.filter(url => !memoriaCartasGlobais.has(url));
            
        // Embaralha a salada final para que temas fiquem espalhados
        return embaralharArray(urlsIneditas);

    } catch (error) {
        console.error("Erro na busca misturada:", error.message);
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
        return urls.slice(0, Math.min(urls.length, 15)); 
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return urls.slice(0, Math.min(urls.length, 15)); 
    }
}

async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        // Pede um lote diversificado (5 temas x 10 cartas = ~50 imagens misturadas)
        let urlsMisturadas = await buscarCartasMisturadasPixabay(10);
        
        // Pega as 30 primeiras dessa mistura para o Juiz IA analisar rápido
        let aprovadas = await julgarCartas(urlsMisturadas.slice(0, 30));
        
        if (aprovadas.length > 0) {
            aprovadas.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...embaralharArray(aprovadas));
            
            io.to(codigo).emit('atualizarSala', sala);
        }
    } catch (err) {
        console.error("Erro no preenchimento inicial:", err);
    } finally {
        sala.preenchendo = false;
        preencherBauLento(codigo);
    }
}

async function preencherBauLento(codigo) {
    const sala = salas[codigo];
    if (!sala || sala.preenchendo) return;
    
    sala.preenchendo = true;
    try {
        while (sala.bau.length < 150) { 
            // Pede um lote forte de mistura (5 temas x 20 imagens = ~100 imagens misturadas)
            let urlsMisturadas = await buscarCartasMisturadasPixabay(20);
            if (urlsMisturadas.length === 0) break;
            
            // Analisa de 30 em 30 para o Juiz não travar
            let aprovadas = await julgarCartas(urlsMisturadas.slice(0, 30));
            if (aprovadas.length === 0) continue;
            
            aprovadas.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...embaralharArray(aprovadas));
            
            if (sala.estado === 'jogando') {
                io.to(codigo).emit('atualizarSala', sala);
            }
        }
    } catch (err) {
        console.error("Erro no preenchimento lento do baú:", err);
    } finally {
        sala.preenchendo = false;
    }
}

io.on('connection', (socket) => {
    socket.on('entrarSala', ({ nome, codigo }) => {
        if (!salas[codigo]) {
            salas[codigo] = {
                jogadores: [], bau: [], mesa: [], narradorIndex: 0, estado: 'aguardando', preenchendo: false
            };
            preencherBauRapidoInicial(codigo); 
        }
        
        const sala = salas[codigo];
        const jogador = { id: socket.id, nome, mao: [], pontos: 0 };
        sala.jogadores.push(jogador);
        
        socket.join(codigo);
        io.to(codigo).emit('atualizarSala', sala);
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
            
            // Se o baú baixar de 50 (5 jogadores x 10 rodadas), enche de novo
            if(sala.bau.length < 50) preencherBauLento(codigo); 
        }
    });

    socket.on('pedirCartas', (codigo) => {
        const sala = salas[codigo];
        if(!sala) return;
        
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if(jogador && jogador.mao.length < 5 && sala.bau.length > 0) {
            while(jogador.mao.length < 5 && sala.bau.length > 0) {
                jogador.mao.push(sala.bau.shift());
            }
            io.to(codigo).emit('atualizarSala', sala);
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
