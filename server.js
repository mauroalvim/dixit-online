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

const promptJuizIA = `Você é um curador de arte para um jogo de tabuleiro (estilo Dixit). 
Analise a lista de URLs de imagens e retorne UM ARRAY JSON com as URLs APROVADAS.

REGRAS PARA REJEITAR (NÃO INCLUA NA RESPOSTA):
- Fotografias ou fotorrealismo.
- Rostos humanos realistas (estilo fotografia).
- Imagens com fundo totalmente branco, fundo transparente ou objetos isolados sem cenário.
- Padrões repetitivos (tipo papel de parede) ou texturas planas sem profundidade.

REGRAS PARA APROVAR:
- Ilustrações, pinturas, arte digital, cenários de fantasia, surreais ou abstratos narrativos.
- Personagens desenhados/estilizados inseridos num cenário ou paisagem.

Responda APENAS com o JSON. Exemplo: ["url1", "url2", "url3"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Lista massiva de temas para garantir diversidade extrema
const temasBusca = [
    "surreal", "dream", "fantasy", "illusion", "bizarre",
    "mystical", "whimsical", "magic", "fairytale", "wonderland",
    "mythology", "steampunk", "space art", "psychedelic", 
    "magical realism", "concept art", "otherworldly", "ethereal", 
    "surrealism", "abstract", "imaginative", "optical illusion",
    "watercolor fantasy", "oil painting surreal", "digital art stylized",
    "storybook illustration", "dreamscape", "fantasy landscape",
    "surreal creatures", "mystical forest", "floating islands",
    "cosmic art", "alien world", "gothic fantasy", "cyberpunk art",
    "retro futurism", "enchanted garden", "underwater fantasy",
    "celestial art", "mind bending", "strange art", "quirky illustration",
    "surreal portrait", "dreamlike scene", "fantasy architecture",
    "magical creatures", "surreal nature", "abstract expressionism",
    "pop surrealism", "lowbrow art", "dark fantasy", "epic fantasy",
    "surreal collage", "vintage surrealism", "surreal photography manipulation",
    "origami landscape", "papercraft scene", "claymation style",
    "cubism art", "fauvism style", "pointillism art", "geometric abstract",
    "steampunk animals", "watercolor galaxy", "fantasy map"
];

async function buscarCartasMisturadasPixabay(quantidadePorTema = 5) {
    try {
        const temasSorteados = embaralharArray([...temasBusca]).slice(0, 10); 
        const promessas = temasSorteados.map(async (tema) => {
            const randomPage = Math.floor(Math.random() * 20) + 1; 
            // Pesquisa limpa e direta para não quebrar a API do Pixabay
            const query = encodeURIComponent(tema);
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&orientation=vertical&per_page=${quantidadePorTema}&page=${randomPage}&safesearch=true`;
            
            try {
                const res = await axios.get(url);
                return res.data.hits.map(hit => hit.largeImageURL);
            } catch (e) {
                return [];
            }
        });

        const arraysDeUrls = await Promise.all(promessas);
        const todasUrls = arraysDeUrls.flat();
        
        const urlsIneditas = todasUrls.filter(url => !memoriaCartasGlobais.has(url));
            
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
        return urls.slice(0, Math.min(urls.length, 5)); 
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return urls.slice(0, Math.min(urls.length, 5)); 
    }
}

async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        let urlsMisturadas = await buscarCartasMisturadasPixabay(5); // 10 temas x 5 = 50 imagens
        
        // Passa 30 para o Juiz
        let aprovadas = await julgarCartas(urlsMisturadas.slice(0, 30));
        
        if (aprovadas.length > 0) {
            aprovadas.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...embaralharArray(aprovadas));
        } else {
            // REDE DE SEGURANÇA: Se a IA rejeitar tudo ou falhar, injeta 10 cartas à força para o jogo nunca bloquear
            console.log(`[AVISO] IA rejeitou todas as imagens iniciais da Sala ${codigo}. Aplicando fallback de segurança.`);
            const fallbackUrls = urlsMisturadas.slice(0, 10);
            fallbackUrls.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...fallbackUrls);
        }
        
        io.to(codigo).emit('atualizarSala', sala);

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
            let urlsMisturadas = await buscarCartasMisturadasPixabay(10); 
            if (urlsMisturadas.length === 0) break;
            
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
