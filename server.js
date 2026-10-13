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
// PROXY DO PINTEREST
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
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        res.status(404).send('Imagem indisponível');
    }
});

async function buscarCartasPinterest() {
    const pastasDisponiveis = [
        "ligiaausten/dixit", "corujinhaliteraria/dixit", "jessicabraghiroli/dixit-cards",
        "karenkristenn/cartas-dixit", "jojolyne/dixit", "renatabueno/dixit-cartas",
        "marcelomourar/dixit", "nathaliabrag/dixit-art"
    ];
    const pastasSorteadas = embaralharArray([...pastasDisponiveis]).slice(0, 4);
    let urls = [];
    
    for (let pasta of pastasSorteadas) {
        try {
            const urlOriginal = `https://br.pinterest.com/${pasta}.rss`;
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(urlOriginal)}`;
            const response = await axios.get(proxyUrl, { timeout: 8000 });
            if (!response.data.items) continue;
            for (let item of response.data.items) {
                const match = /<img src="([^"]+)"/.exec(item.description);
                if (match) {
                    let imgUrl = match[1].replace(/\/\d+x\//, '/736x/'); 
                    if (!memoriaCartasGlobais.has(imgUrl)) urls.push(imgUrl);
                }
            }
        } catch (e) {}
    }
    return embaralharArray(urls);
}

async function buscarCartasMisturadasPixabay(quantidade = 5) {
    try {
        const temas = ["surreal", "dream", "fantasy landscape", "whimsical", "concept art"];
        const promessas = temas.map(async (tema) => {
            const page = Math.floor(Math.random() * 10) + 1; 
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(tema + " painting")}&image_type=illustration&orientation=vertical&per_page=${quantidade}&page=${page}&safesearch=true`;
            try {
                const res = await axios.get(url, { timeout: 5000 });
                return res.data.hits.map(h => h.largeImageURL);
            } catch (e) { return []; }
        });
        const arrays = await Promise.all(promessas);
        return embaralharArray(arrays.flat().filter(url => !memoriaCartasGlobais.has(url)));
    } catch (e) { return []; }
}

async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${promptJuizIA}\n\nURLs:\n${JSON.stringify(urls)}`);
        const match = result.response.text().match(/\[.*\]/s);
        return match ? JSON.parse(match[0]) : []; 
    } catch (e) { return []; }
}

async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    sala.preenchendo = true;
    try {
        let urlsPinterest = await buscarCartasPinterest();
        let urlsFinais = [];
        
        if (urlsPinterest.length > 0) {
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
            urlsFinais = aprovadas.length > 0 ? aprovadas : urlsPinterest.slice(0, 15);
        } else {
            let urlsPixabay = await buscarCartasMisturadasPixabay(15);
            let aprovadasPixabay = await julgarCartas(urlsPixabay.slice(0, 40));
            urlsFinais = aprovadasPixabay.length > 0 ? aprovadasPixabay : urlsPixabay.slice(0, 15);
        }
        
        if (urlsFinais.length > 0) {
            urlsFinais.forEach(url => {
                memoriaCartasGlobais.add(url);
                sala.bau.push(`/proxy?url=${encodeURIComponent(url)}`);
            });
            sala.bau = embaralharArray(sala.bau);
        }
        io.to(codigo).emit('atualizarSala', sala);
    } catch (err) {
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
                    sala.bau.push(`/proxy?url=${encodeURIComponent(url)}`);
                });
                sala.bau = embaralharArray(sala.bau);
            }
        }
    } catch (err) {
    } finally {
        sala.preenchendo = false;
    }
}

// --------------------------------------------------------
// LÓGICA E REGRAS DIXIT (MÁQUINA DE ESTADOS)
// --------------------------------------------------------
function calcularPontosDixit(sala) {
    const cartaNarrador = sala.mesa.find(c => c.cartaUrl === sala.cartaNarradorUrl);
    if (!cartaNarrador) return;

    const acertos = cartaNarrador.votos.length;
    const totalJogadores = sala.jogadores.length;
    const narradorId = sala.jogadores[sala.narradorIndex].id;

    // Regra 1: Se todos acertam ou ninguém acerta, narrador ganha 0, os outros ganham 2.
    if (acertos === 0 || acertos === totalJogadores - 1) {
        sala.jogadores.forEach(j => {
            if (j.id !== narradorId) j.pontos += 2;
        });
    } else {
        // Regra 2: Narrador ganha 3, quem acertou ganha 3.
        const narrador = sala.jogadores.find(j => j.id === narradorId);
        narrador.pontos += 3;
        cartaNarrador.votos.forEach(votoId => {
            const jogadorCerto = sala.jogadores.find(j => j.id === votoId);
            if (jogadorCerto) jogadorCerto.pontos += 3;
        });
    }

    // Regra 3: Pontos bónus (1 ponto por cada voto na carta falsa do jogador)
    sala.mesa.forEach(c => {
        if (c.cartaUrl !== sala.cartaNarradorUrl) {
            const dono = sala.jogadores.find(j => j.id === c.jogadorId);
            if (dono) dono.pontos += c.votos.length;
        }
    });
}

io.on('connection', (socket) => {
    socket.on('entrarSala', ({ nome, codigo }) => {
        if (!salas[codigo]) {
            salas[codigo] = {
                jogadores: [], bau: [], mesa: [], narradorIndex: 0, 
                estado: 'aguardando', preenchendo: false, cartaNarradorUrl: null
            };
            preencherBauRapidoInicial(codigo); 
        }
        const sala = salas[codigo];
        sala.jogadores.push({ id: socket.id, nome, mao: [], pontos: 0 });
        socket.join(codigo);
        io.to(codigo).emit('atualizarSala', sala);
    });

    socket.on('iniciarPartida', (codigo) => {
        const sala = salas[codigo];
        if(sala && sala.jogadores.length >= 2) {
            // Fase 1: Só o narrador joga
            sala.estado = 'escolha_narrador';
            io.to(codigo).emit('atualizarSala', sala);
        }
    });

    socket.on('jogarCarta', ({ codigo, cartaUrl }) => {
        const sala = salas[codigo];
        if(!sala) return;
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        const isNarrador = sala.jogadores[sala.narradorIndex].id === socket.id;

        if (sala.estado === 'escolha_narrador' && isNarrador) {
            jogador.mao = jogador.mao.filter(c => c !== cartaUrl);
            sala.mesa.push({ jogadorId: socket.id, cartaUrl, votos: [] });
            sala.cartaNarradorUrl = cartaUrl;
            
            // Fase 2: O resto dos jogadores joga agora
            sala.estado = 'escolha_jogadores';
            io.to(codigo).emit('atualizarSala', sala);
            return;
        }

        if (sala.estado === 'escolha_jogadores' && !isNarrador) {
            const jaJogou = sala.mesa.some(c => c.jogadorId === socket.id);
            if (jaJogou) return;

            jogador.mao = jogador.mao.filter(c => c !== cartaUrl);
            sala.mesa.push({ jogadorId: socket.id, cartaUrl, votos: [] });

            // Se todos jogaram, vai para votação e embaralha as cartas!
            if (sala.mesa.length === sala.jogadores.length) {
                sala.estado = 'votacao';
                sala.mesa = embaralharArray(sala.mesa);
            }
            io.to(codigo).emit('atualizarSala', sala);
        }
    });

    socket.on('votarCarta', ({ codigo, cartaUrl }) => {
        const sala = salas[codigo];
        if(!sala || sala.estado !== 'votacao') return;
        
        const isNarrador = sala.jogadores[sala.narradorIndex].id === socket.id;
        if (isNarrador) return; // Narrador não vota

        const cartaAlvo = sala.mesa.find(c => c.cartaUrl === cartaUrl);
        if (!cartaAlvo) return;
        if (cartaAlvo.jogadorId === socket.id) return; // Não pode votar na própria

        const jaVotou = sala.mesa.some(c => c.votos.includes(socket.id));
        if (jaVotou) return;

        cartaAlvo.votos.push(socket.id);

        // Se todos os não-narradores votaram, calcula e vai para resultados
        const totalVotos = sala.mesa.reduce((acc, c) => acc + c.votos.length, 0);
        if (totalVotos === sala.jogadores.length - 1) {
            calcularPontosDixit(sala);
            sala.estado = 'resultado';
        }
        
        io.to(codigo).emit('atualizarSala', sala);
    });

    socket.on('proximaRodada', (codigo) => {
        const sala = salas[codigo];
        if(!sala || sala.estado !== 'resultado') return;

        sala.estado = 'escolha_narrador';
        sala.mesa = [];
        sala.cartaNarradorUrl = null;
        sala.narradorIndex = (sala.narradorIndex + 1) % sala.jogadores.length;

        // Distribui até 5 cartas novamente
        sala.jogadores.forEach(j => {
            while (j.mao.length < 5 && sala.bau.length > 0) {
                j.mao.push(sala.bau.shift());
            }
        });

        if(sala.bau.length < 50) preencherBauLento(codigo);
        io.to(codigo).emit('atualizarSala', sala);
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
server.listen(PORT, () => { console.log(`Rodando na porta ${PORT}`); });
