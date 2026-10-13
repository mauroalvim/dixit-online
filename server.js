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
1. FOTORREALISMO: Rejeite rostos humanos reais, pessoas ou fotografias.
2. LIXO VETORIAL: Rejeite fundos totalmente brancos, transparentes, ou objetos isolados.
3. PADRÕES: Rejeite texturas repetitivas ou letras.

CRITÉRIOS DE APROVAÇÃO:
- Aceite ilustrações, pinturas, aquarela, cenários surreais e arte fantasia.

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// O SEGREDO 10.61: PROXY INTERNO DE IMAGENS
// Resolve o bloqueio do Pinterest sem precisar de AWS S3
// --------------------------------------------------------
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL missing');

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: {
                'Referer': 'https://br.pinterest.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Mantém a imagem em cache no navegador do jogador para ser super rápido
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        console.error('Erro no proxy de imagem:', error.message);
        res.status(404).send('Imagem indisponível');
    }
});

// --------------------------------------------------------
// MOTOR DO PINTEREST
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
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(urlOriginal)}`;
            
            const response = await axios.get(proxyUrl, { timeout: 8000 });
            const items = response.data.items; 
            
            if (!items) continue;

            for (let item of items) {
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
// MOTOR DO PIXABAY (Backup de emergência)
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
        return []; 
    }
}

// --------------------------------------------------------
// GERENCIAMENTO DO BAÚ 
// --------------------------------------------------------
async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        console.log(`[SALA ${codigo}] Puxando Pinterest...`);
        let urlsPinterest = await buscarCartasPinterest();
        let urlsFinais = [];
        
        if (urlsPinterest.length > 0) {
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
            urlsFinais = aprovadas.length > 0 ? aprovadas : urlsPinterest.slice(0, 15);
        } else {
            console.log(`[SALA ${codigo}] Pinterest falhou. Acionando Pixabay...`);
            let urlsPixabay = await buscarCartasMisturadasPixabay(15);
            let aprovadasPixabay = await julgarCartas(urlsPixabay.slice(0, 40));
            urlsFinais = aprovadasPixabay.length > 0 ? aprovadasPixabay : urlsPixabay.slice(0, 15);
        }
        
        // Processa as cartas aprovadas pelo Proxy e adiciona à mesa
        if (urlsFinais.length > 0) {
            urlsFinais.forEach(url => {
                memoriaCartasGlobais.add(url);
                // Converte a rota original do Pinterest para a rota secreta do nosso servidor
                const urlSegura = `/proxy?url=${encodeURIComponent(url)}`;
                sala.bau.push(urlSegura);
            });
            sala.bau = embaralharArray(sala.bau);
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
            let urlsAnalisar = urlsPinterest.length > 5 ? urlsPinterest.slice(0, 30) : [];

            if (urlsAnalisar.length === 0) {
                let urlsPixabay = await buscarCartasMisturadasPixabay(10);
                if (urlsPixabay.length === 0) break;
                urlsAnalisar = urlsPixabay.slice(0, 30);
            }
            
            let aprovadas = await julgarCartas(urlsAnalisar);
            if (aprovadas.length > 0) {
                aprovadas.forEach(url => {
                    memoriaCartasGlobais.add(url);
                    const urlSegura = `/proxy?url=${encodeURIComponent(url)}`;
                    sala.bau.push(urlSegura);
                });
                sala.bau = embaralharArray(sala.bau);
                
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
