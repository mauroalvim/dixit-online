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

REGRAS DE REJEIÇÃO (Elimine imediatamente se tiver alguma destas):
1. REJEITE EXPRESSAMENTE QUALQUER ROSTO HUMANO com feições reais, mesmo que seja uma arte digital muito bem feita, pintura realista ou que tenha elementos de fantasia. Se parecer uma pessoa de verdade, rejeite.
2. Fundos transparentes, brancos lisos, áreas de recorte de PNG ou imagens em formato de selo.
3. Fotografias e paisagens do mundo real.
4. Objetos aleatórios isolados flutuando sem nenhum cenário de fundo.

CRITÉRIOS DE APROVAÇÃO:
- Cenas completas de fantasia, ilustrações abstratas, aquarela, cenários surreais e arte estilizada (estilo cartoon/livro infantil).

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// MOTOR DO PINTEREST (A FONTE PRINCIPAL E PRIVILEGIADA)
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
    
    // Aumentamos para puxar de 5 pastas diferentes de uma vez
    const pastasSorteadas = embaralharArray([...pastasDisponiveis]).slice(0, 5);
    
    let urls = [];
    for (let pasta of pastasSorteadas) {
        try {
            const url = `https://br.pinterest.com/${pasta}.rss`;
            const response = await axios.get(url, { timeout: 6000 });
            const xml = response.data;
            
            const regex = /<img src="([^"]+)"/g;
            let match;
            while ((match = regex.exec(xml)) !== null) {
                let imgUrl = match[1];
                imgUrl = imgUrl.replace(/\/\d+x\//, '/736x/'); 
                
                if (!memoriaCartasGlobais.has(imgUrl)) {
                    urls.push(imgUrl);
                }
            }
        } catch (e) {
            console.error(`Erro ao buscar Pinterest (${pasta}):`, e.message);
        }
    }
    return embaralharArray(urls);
}

// --------------------------------------------------------
// MOTOR DO PIXABAY (APENAS ESTEPE / BACKUP)
// --------------------------------------------------------
const temasBusca = [
    "surreal", "dream", "fantasy landscape", "whimsical", "fairytale", 
    "mythology", "steampunk", "space art", "magical realism", 
    "concept art", "ethereal", "abstract painting", "storybook illustration", 
    "dreamscape", "mystical forest"
];

async function buscarCartasMisturadasPixabay(quantidadePorTema = 5) {
    try {
        const temasSorteados = embaralharArray([...temasBusca]).slice(0, 5); 
        const promessas = temasSorteados.map(async (tema) => {
            const randomPage = Math.floor(Math.random() * 15) + 1; 
            const query = encodeURIComponent(`${tema} -transparent -isolated -cutout -png -vector -white`);
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
        return urls.slice(0, Math.min(urls.length, 5)); 
    } catch (error) {
        return urls.slice(0, Math.min(urls.length, 5)); 
    }
}

// --------------------------------------------------------
// GERENCIAMENTO DO BAÚ (FOCO TOTAL NO PINTEREST)
// --------------------------------------------------------
async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        console.log(`[SALA ${codigo}] Puxando lotes do Pinterest (Prioridade Máxima)...`);
        
        // Exclusividade do Pinterest na primeira rodada
        let urlsPinterest = await buscarCartasPinterest();
        
        // Passa até 40 cartas pro Juiz IA analisar
        let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
        
        if (aprovadas.length > 0) {
            aprovadas.forEach(url => memoriaCartasGlobais.add(url));
            sala.bau.push(...embaralharArray(aprovadas));
        } else {
            console.log(`[AVISO] Juiz rejeitou tudo na Sala ${codigo}. Aplicando fallback.`);
            const fallbackUrls = urlsPinterest.slice(0, 10);
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
            let urlsPinterest = await buscarCartasPinterest();
            
            // Se o Pinterest ainda tiver imagens novas (mais que 5)
            if (urlsPinterest.length > 5) {
                let aprovadas = await julgarCartas(urlsPinterest.slice(0, 30));
                if (aprovadas.length > 0) {
                    aprovadas.forEach(url => memoriaCartasGlobais.add(url));
                    sala.bau.push(...embaralharArray(aprovadas));
                }
            } else {
                // Se as cartas inéditas do Pinterest estiverem acabando, apela pro Pixabay
                console.log(`[SALA ${codigo}] Pinterest esgotando. Buscando Pixabay...`);
                let urlsPixabay = await buscarCartasMisturadasPixabay(10);
                if (urlsPixabay.length === 0) break;
                
                let aprovadas = await julgarCartas(urlsPixabay.slice(0, 30));
                if (aprovadas.length > 0) {
                    aprovadas.forEach(url => memoriaCartasGlobais.add(url));
                    sala.bau.push(...embaralharArray(aprovadas));
                }
            }
            
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
