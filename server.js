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

const promptJuizIA = `Você é um curador de arte rigoroso para um jogo de tabuleiro estilo Dixit / Stella: Dixit Universe. 
Analise a lista de URLs de imagens e retorne UM ARRAY JSON com as URLs APROVADAS.

REGRAS DE REJEIÇÃO ABSOLUTA (Elimine imediatamente se tiver):
1. FOTORREALISMO: Rejeite rostos humanos reais, pessoas ou fotografias.
2. LIXO VETORIAL: Rejeite fundos totalmente brancos, transparentes, ou objetos isolados.
3. PADRÕES: Rejeite texturas repetitivas ou letras.

CRITÉRIOS DE APROVAÇÃO:
- Aceite ilustrações, pinturas, aquarela, cenários surreais, constelações e arte fantasia onírica (estilo Stella).

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// PROXY UNIVERSAL DE IMAGENS
// --------------------------------------------------------
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL missing');
    try {
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        res.status(404).send('Imagem indisponível');
    }
});

// --------------------------------------------------------
// GERAÇÃO DAS 98 CARTAS DO REPOSITÓRIO GITHUB DO DIXIT
// --------------------------------------------------------
function obterCartasGitHubDixit() {
    let urls = [];
    // O repositório tem de card_00001.jpg a card_00098.jpg
    for (let i = 1; i <= 98; i++) {
        let numeroFormatado = String(i).padStart(5, '0');
        let url = `https://raw.githubusercontent.com/aarongaither/dixitOnline/master/assets/cards/card_${numeroFormatado}.jpg`;
        urls.push(url);
    }
    return embaralharArray(urls);
}

// --------------------------------------------------------
// BUSCA NO PIXABAY COM TEMÁTICA STELLA / DIXIT UNIVERSE
// --------------------------------------------------------
async function buscarCartasStellaPixabay(quantidade = 10) {
    try {
        const temasStella = ["astral watercolor", "ethereal fantasy art", "constellation dreamscape", "surreal cosmic illustration", "whimsical starlight painting"];
        const promessas = temasStella.map(async (tema) => {
            const page = Math.floor(Math.random() * 5) + 1; 
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(tema)}&image_type=illustration&orientation=vertical&per_page=${quantidade}&page=${page}&safesearch=true`;
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

// --------------------------------------------------------
// ALIMENTAÇÃO DO BAÚ DA SALA (GitHub + Stella via Juiz IA)
// --------------------------------------------------------
async function preencherBauSala(codigo) {
    const sala = salas[codigo];
    if (!sala || sala.preenchendo) return;
    sala.preenchendo = true;

    try {
        // 1. Se o baú estiver vazio, carrega primeiro as cartas seguras do GitHub
        if (sala.bau.length === 0) {
            let cartasGitHub = obterCartasGitHubDixit();
            // Passa as do GitHub pelo Juiz IA também para garantir padrão irrepreensível
            let aprovadasGitHub = await julgarCartas(cartasGitHub.slice(0, 30));
            
            // Se a IA aprovar (ou como garantia caso queira agilizar), adiciona ao baú
            let selecaoInicial = aprovadasGitHub.length > 0 ? aprovadasGitHub : cartasGitHub.slice(0, 30);
            
            selecaoInicial.forEach(url => {
                memoriaCartasGlobais.add(url);
                sala.bau.push(url);
            });
            sala.bau = embaralharArray(sala.bau);
            io.to(codigo).emit('atualizarSala', sala);
        }

        // 2. Continuação em segundo plano: Busca expansões estilo Stella no Pixabay avaliadas pelo Juiz IA
        while (sala.bau.length < 150) {
            let urlsStella = await buscarCartasStellaPixabay(15);
            if (urlsStella.length === 0) break;
            
            let aprovadasStella = await julgarCartas(urlsStella);
            if (aprovadasStella.length > 0) {
                aprovadasStella.forEach(url => {
                    if (!memoriaCartasGlobais.has(url)) {
                        memoriaCartasGlobais.add(url);
                        sala.bau.push(url);
                    }
                });
                sala.bau = embaralharArray(sala.bau);
            }
        }
    } catch (err) {
        console.error("Erro ao preencher baú:", err);
    } finally {
        sala.preenchendo = false;
    }
}

// --------------------------------------------------------
// REGRAS DE PONTUAÇÃO DIXIT
// --------------------------------------------------------
function calcularPontosDixit(sala) {
    const cartaNarrador = sala.mesa.find(c => c.cartaUrl === sala.cartaNarradorUrl);
    if (!cartaNarrador) return;

    const acertos = cartaNarrador.votos.length;
    const totalJogadores = sala.jogadores.length;
    const narradorId = sala.jogadores[sala.narradorIndex].id;

    if (acertos === 0 || acertos === totalJogadores - 1) {
        sala.jogadores.forEach(j => {
            if (j.id !== narradorId) j.pontos += 2;
        });
    } else {
        const narrador = sala.jogadores.find(j => j.id === narradorId);
        narrador.pontos += 3;
        cartaNarrador.votos.forEach(votoId => {
            const jogadorCerto = sala.jogadores.find(j => j.id === votoId);
            if (jogadorCerto) jogadorCerto.pontos += 3;
        });
    }

    sala.mesa.forEach(c => {
        if (c.cartaUrl !== sala.cartaNarradorUrl) {
            const dono = sala.jogadores.find(j => j.id === c.jogadorId);
            if (dono) dono.pontos += c.votos.length;
        }
    });
}

// --------------------------------------------------------
// SOCKET.IO EVENTOS
// --------------------------------------------------------
io.on('connection', (socket) => {
    
    socket.on('verificarSala', (codigo) => {
        socket.emit('salaExiste', !!salas[codigo]);
    });

    socket.on('criarSala', ({ nome, codigo, pontosVitoria }) => {
        let codFinal = codigo;
        if (!codFinal) {
            codFinal = Math.floor(1000 + Math.random() * 9000).toString(); 
        }
        
        if (salas[codFinal]) {
            socket.emit('erro', 'Esta sala já existe! Tente outro código.');
            return;
        }
        
        salas[codFinal] = {
            codigo: codFinal,
            jogadores: [], bau: [], mesa: [], narradorIndex: 0, estado: 'aguardando', 
            preenchendo: false, cartaNarradorUrl: null, pontosVitoria: parseInt(pontosVitoria) || 30
        };
        
        preencherBauSala(codFinal); 
        
        const sala = salas[codFinal];
        sala.jogadores.push({ id: socket.id, nome, mao: [], pontos: 0 });
        socket.join(codFinal);
        
        socket.emit('salaCriada', codFinal); 
        io.to(codFinal).emit('atualizarSala', sala);
    });

    socket.on('entrarSala', ({ nome, codigo }) => {
        const sala = salas[codigo];
        if (!sala) {
            socket.emit('erro', 'Sala não encontrada!');
            return;
        }
        sala.jogadores.push({ id: socket.id, nome, mao: [], pontos: 0 });
        socket.join(codigo);
        io.to(codigo).emit('atualizarSala', sala);
    });

    socket.on('iniciarPartida', (codigo) => {
        const sala = salas[codigo];
        if(sala && sala.jogadores.length >= 2) {
            sala.estado = 'escolha_narrador';
            sala.jogadores.forEach(j => {
                while (j.mao.length < 5 && sala.bau.length > 0) {
                    j.mao.push(sala.bau.shift());
                }
            });
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
            sala.estado = 'escolha_jogadores';
            io.to(codigo).emit('atualizarSala', sala);
            return;
        }

        if (sala.estado === 'escolha_jogadores' && !isNarrador) {
            const jaJogou = sala.mesa.some(c => c.jogadorId === socket.id);
            if (jaJogou) return;

            jogador.mao = jogador.mao.filter(c => c !== cartaUrl);
            sala.mesa.push({ jogadorId: socket.id, cartaUrl, votos: [] });

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
        if (isNarrador) return; 

        const cartaAlvo = sala.mesa.find(c => c.cartaUrl === cartaUrl);
        if (!cartaAlvo) return;
        if (cartaAlvo.jogadorId === socket.id) return; 

        const jaVotou = sala.mesa.some(c => c.votos.includes(socket.id));
        if (jaVotou) return;

        cartaAlvo.votos.push(socket.id);

        const totalVotos = sala.mesa.reduce((acc, c) => acc + c.votos.length, 0);
        if (totalVotos === sala.jogadores.length - 1) {
            calcularPontosDixit(sala);
            
            const alguemGanhou = sala.jogadores.some(j => j.pontos >= sala.pontosVitoria);
            if (alguemGanhou) {
                sala.estado = 'fim_jogo';
            } else {
                sala.estado = 'resultado';
            }
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

        sala.jogadores.forEach(j => {
            while (j.mao.length < 5 && sala.bau.length > 0) {
                j.mao.push(sala.bau.shift());
            }
        });

        if(sala.bau.length < 50) preencherBauSala(codigo);
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
