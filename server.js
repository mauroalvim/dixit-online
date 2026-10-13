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

REGRAS DE REJEIÇÃO ABSOLUTA (Elimine imediatamente se tiver):
1. FOTORREALISMO: Rejeite rostos humanos reais, personagens de videogame 3D muito realistas ou fotografias.
2. LIXO VETORIAL: Rejeite fundos totalmente brancos, transparentes, ou objetos/manchas isoladas flutuando no vazio. A imagem PRECISA ter um cenário preenchendo o fundo.
3. PADRÕES E TEXTO: Rejeite texturas repetitivas, imagens de cartas de baralho comuns ou imagens com letras.

CRITÉRIOS DE APROVAÇÃO:
- Aceite ilustrações, pinturas, aquarela, cenários surreais, fantasia e arte estilo "cartoon" ou "livro infantil".

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// MOTOR DO PINTEREST (Novo Intermediário Especializado)
// --------------------------------------------------------
async function buscarCartasPinterest() {
    const pastasDisponiveis = [
        "ligiaausten/dixit",
        "corujinhaliteraria/dixit",
        "jessicabraghiroli/dixit-cards",
        "karenkristenn/cartas-dixit",
        "jojolyne/dixit",
        "renatabueno/dixit-cartas",
        "marcelomourar/dixit",
        "nathaliabrag/dixit-art"
    ];
    
    const pastasSorteadas = embaralharArray([...pastasDisponiveis]).slice(0, 4);
    let urls = [];
    
    for (let pasta of pastasSorteadas) {
        try {
            const urlOriginal = `https://br.pinterest.com/${pasta}.rss`;
            
            // O NOVO TRUQUE: Usar a API rss2json (estável e não é bloqueada pelo Pinterest)
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(urlOriginal)}`;
            
            const response = await axios.get(proxyUrl, { timeout: 8000 });
            const items = response.data.items; 
            
            if (!items) continue;

            for (let item of items) {
                // O rss2json devolve as imagens dentro da tag 'description'
                const regex = /<img src="([^"]+)"/;
                const match = regex.exec(item.description);
                
                if (match) {
                    let imgUrl = match[1];
                    imgUrl = imgUrl.replace(/\/\d+x\//, '/736x/'); 
                    
                    if (!memoriaCartasGlobais.has(imgUrl)) {
                        urls.push(imgUrl);
                    }
                }
            }
        } catch (e) {
            console.error(`Erro ao buscar Pinterest (${pasta}):`, e.message);
        }
    }
    return embaralharArray(urls);
}

// --------------------------------------------------------
// MOTOR DO PIXABAY (Plano B Corrigido)
// --------------------------------------------------------
const temasBusca = [
    "surreal", "dream", "fantasy landscape", "whimsical", "fairytale", 
    "mythology", "steampunk", "space art", "magical realism", 
    "concept art", "storybook illustration"
];

async function buscarCartasMisturadasPixabay(quantidadePorTema = 5) {
    try {
        const temasSorteados = embaralharArray([...temasBusca]).slice(0, 5); 
        const promessas = temasSorteados.map(async (tema) => {
            const randomPage = Math.floor(Math.random() * 15) + 1; 
            // Palavras negativas removidas para não bloquear a API
            const query = encodeURIComponent(`${tema} painting`);
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&orientation=vertical&per_page=${quantidadePorTema}&page=${randomPage}&safesearch=true`;
            
            try {
                const res = await axios.get(url, { timeout: 5000 });
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
        return [];
    }
}

// --------------------------------------------------------
// JUIZ IA
// --------------------------------------------------------
async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${promptJuizIA}\n\nURLs:\n${JSON.stringify(urls)}`);
        const text = result.response.text();
        const jsonMatch = text.match(/\[.*\]/s);
        
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return []; 
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return []; 
    }
}

// --------------------------------------------------------
// GERENCIAMENTO DO BAÚ (SISTEMA ANTI-BLOQUEIO)
// --------------------------------------------------------
async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        console.log(`[SALA ${codigo}] Tentando Pinterest via rss2json...`);
        let urlsPinterest = await buscarCartasPinterest();
        let urlsFinal = [];
        
        if (urlsPinterest.length > 0) {
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
            // Garantia Anti-Bloqueio: Se a IA rejeitar tudo, injeta 10 forçadas para o jogo avançar
            urlsFinal = aprovadas.length > 0 ? aprovadas : urlsPinterest.slice(0, 10);
        } else {
            console.log(`[SALA ${codigo}] Pinterest falhou. Acionando Pixabay...`);
            let urlsPixabay = await buscarCartasMisturadasPixabay(15);
            let aprovadasPixabay = await julgarCartas(urlsPixabay.slice(0, 40));
            // Garantia Anti-Bloqueio para o Pixabay
            urlsFinal = aprovadasPixabay.length > 0 ? aprovadasPixabay : urlsPixabay.slice(0, 10);
        }
        
        if (urlsFinal.length > 0) {
            urlsFinal.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...embaralharArray(urlsFinal));
        }
        
        // CORREÇÃO CRÍTICA: Emite SEMPRE a ordem para atualizar a sala, mesmo que algo falhe,
        // para que o cliente não fique preso no loading infinito.
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
            let urlsPinterest = await buscarCartasPinterest();
            let urlsAnalisar = [];

            if (urlsPinterest.length > 5) {
                urlsAnalisar = urlsPinterest.slice(0, 30);
            } else {
                let urlsPixabay = await buscarCartasMisturadasPixabay(10);
                if (urlsPixabay.length === 0) break;
                urlsAnalisar = urlsPixabay.slice(0, 30);
            }
            
            let aprovadas = await julgarCartas(urlsAnalisar);
            if (aprovadas.length > 0) {
                aprovadas.forEach(url => memoriaCartasGlobais.add(url));
                sala.bau.push(...embaralharArray(aprovadas));
                
                if (sala.estado === 'jogando') {
                    io.to(codigo).emit('atualizarSala', sala);
                }
            }
        }
    } catch (err) {
        console.error("Erro no preenchimento lento do baú:", err);
    } finally {
        sala.preenchendo = false;
    }
}

// --------------------------------------------------------
// LÓGICA DO JOGO (SOCKETS)
// --------------------------------------------------------
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
        // Só atualiza o jogador no lobby se já existirem cartas prontas, 
        // caso contrário, o preencherBauRapidoInicial encarrega-se disso.
        if (sala.bau.length > 0 || sala.estado === 'aguardando') {
            io.to(codigo).emit('atualizarSala', sala);
        }
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
