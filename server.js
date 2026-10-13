const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Cria pasta local temporária para guardar as cartas oficiais extraídas
const dirExpansoes = path.join(__dirname, 'public', 'expansoes');
if (!fs.existsSync(dirExpansoes)) fs.mkdirSync(dirExpansoes, { recursive: true });

app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const salas = {};

// A NOSSA PISCINA GERAL (Apenas Cartas 100% Oficiais dos ZIPs)
let bancoDeCartasGlobais = [];

// --------------------------------------------------------
// EXTRAÇÃO INTELIGENTE DE ZIPs EM BACKGROUND
// --------------------------------------------------------
async function baixarZipsEmBackground() {
    const urlsZips = [
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-Dixit-Quest.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/banque-images-dixit-mirrors.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-journey.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-daydreams.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-Harmonies.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-memories.zip",
        "https://cdn.svc.asmodee.net/production-libelludv2/uploads/2026/08/Banque-images-origins.zip"
    ];

    console.log("A extrair Expansões Asmodee em background...");

    // Baralha a ordem dos ZIPs para que o arranque seja imprevisível se o servidor for reiniciado
    const zipsMisturados = embaralharArray([...urlsZips]);

    for (let url of zipsMisturados) {
        try {
            const response = await axios({ method: 'get', url, responseType: 'stream' });
            
            response.data.pipe(unzipper.Parse())
                .on('entry', function (entry) {
                    const fileName = entry.path;
                    const nomeUpper = fileName.toUpperCase();
                    
                    const isImage = nomeUpper.endsWith('.PNG') || nomeUpper.endsWith('.JPG') || nomeUpper.endsWith('.JPEG');
                    
                    // FILTRO ESTRITO E CIRÚRGICO: Apenas arquivos que contenham _1_, _2_, _10_, etc. (ex: _1_)
                    const isCard = /_\d+_/.test(nomeUpper);
                    
                    // Mantemos a lista negra apenas como dupla garantia de segurança
                    const isNotTrash = !nomeUpper.includes('MACOSX') && 
                                       !nomeUpper.includes('WALLPAPER') && 
                                       !nomeUpper.includes('BOX') && 
                                       !nomeUpper.includes('BOITE') && 
                                       !nomeUpper.includes('RULE') && 
                                       !nomeUpper.includes('REGLE') && 
                                       !nomeUpper.includes('COVER') && 
                                       !nomeUpper.includes('MOCKUP') && 
                                       !nomeUpper.includes('3D') && 
                                       !nomeUpper.includes('PRESENTATION') && 
                                       !nomeUpper.includes('VISUAL');

                    if (entry.type === 'File' && isImage && isCard && isNotTrash) {
                        const nomeArquivo = path.basename(fileName);
                        const caminhoDestino = path.join(dirExpansoes, nomeArquivo);
                        
                        if (!fs.existsSync(caminhoDestino)) {
                            entry.pipe(fs.createWriteStream(caminhoDestino));
                        } else {
                            entry.autodrain();
                        }
                        
                        const urlLocal = `/expansoes/${encodeURIComponent(nomeArquivo)}`;
                        if (!bancoDeCartasGlobais.includes(urlLocal)) {
                            bancoDeCartasGlobais.push(urlLocal);
                        }
                    } else {
                        entry.autodrain();
                    }
                });
        } catch (e) {
            console.log(`Aviso: Erro ao ler ZIP ${url}`);
        }
    }
    console.log("Mapeamento de cartas oficiais concluído! Apenas cartas puras foram extraídas.");
}
// Arranca a descompactação silenciosa assim que o servidor liga
baixarZipsEmBackground();

// --------------------------------------------------------
// PROXY INTELIGENTE (URLs locais e Pixabay)
// --------------------------------------------------------
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL missing');

    if (targetUrl.startsWith('/expansoes/')) {
        const fileName = targetUrl.split('/').pop();
        const localPath = path.join(dirExpansoes, decodeURIComponent(fileName));
        if (fs.existsSync(localPath)) return res.sendFile(localPath);
        else return res.status(404).send('Não encontrado no servidor');
    }

    try {
        const response = await axios.get(targetUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        res.status(404).send('Imagem indisponível');
    }
});

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// BÓIA DE SALVAÇÃO (Pixabay + IA)
// --------------------------------------------------------
async function buscarCartasStellaPixabay(quantidade = 10) {
    try {
        const temas = ["ethereal fantasy art", "surreal cosmic illustration", "whimsical starlight painting", "dreamscape watercolor"];
        const promessas = temas.map(async (tema) => {
            const page = Math.floor(Math.random() * 5) + 1; 
            const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(tema)}&image_type=illustration&orientation=vertical&per_page=${quantidade}&page=${page}&safesearch=true`;
            try {
                const res = await axios.get(url, { timeout: 5000 });
                return res.data.hits.map(h => h.largeImageURL);
            } catch (e) { return []; }
        });
        const arrays = await Promise.all(promessas);
        return arrays.flat();
    } catch (e) { return []; }
}

async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const promptJuizIA = `Você é um curador de arte para Dixit. Retorne UM ARRAY JSON com URLs APROVADAS. Rejeite fotorrealismo e vetores brancos. Aceite arte fantasia. URLs:\n${JSON.stringify(urls)}`;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(promptJuizIA);
        const match = result.response.text().match(/\[.*\]/s);
        return match ? JSON.parse(match[0]) : []; 
    } catch (e) { return []; }
}

// --------------------------------------------------------
// PREENCHIMENTO DA SALA (100% ALEATÓRIO, 0% REPETIÇÃO)
// --------------------------------------------------------
async function preencherBauSala(codigo) {
    const sala = salas[codigo];
    if (!sala || sala.preenchendo) return;
    sala.preenchendo = true;

    try {
        // Se o servidor acabou de ligar, aguarda uns milissegundos até que os ZIPs extraiam as primeiras cartas
        let tentativas = 0;
        while (bancoDeCartasGlobais.length < 80 && tentativas < 20) { // Tenta por max 5 segundos
            await new Promise(r => setTimeout(r, 250));
            tentativas++;
        }

        if (sala.bau.length < 80 && bancoDeCartasGlobais.length > 0) {
            // Sorteia da piscina global
            let poolGlobal = embaralharArray([...bancoDeCartasGlobais]);
            
            for (let url of poolGlobal) {
                if (!sala.cartasUsadas.has(url)) {
                    sala.bau.push(url);
                    sala.cartasUsadas.add(url);
                }
                if (sala.bau.length >= 80) break; 
            }
        }

        // Se por milagre esgotarmos as cartas da Asmodee, usa o Pixabay
        if (sala.bau.length < 20) {
            let urlsStella = await buscarCartasStellaPixabay(15);
            let aprovadas = await julgarCartas(urlsStella);
            aprovadas.forEach(url => {
                if (!sala.cartasUsadas.has(url)) {
                    sala.bau.push(url);
                    sala.cartasUsadas.add(url);
                }
            });
        }
        
        sala.bau = embaralharArray(sala.bau);
        io.to(codigo).emit('atualizarSala', sala);

    } catch (err) {
        console.error(err);
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
        sala.jogadores.forEach(j => { if (j.id !== narradorId) j.pontos += 2; });
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
        let codFinal = codigo || Math.floor(1000 + Math.random() * 9000).toString(); 
        
        if (salas[codFinal]) {
            socket.emit('erro', 'Esta sala já existe! Tente outro código.');
            return;
        }
        
        salas[codFinal] = {
            codigo: codFinal,
            jogadores: [], bau: [], mesa: [], narradorIndex: 0, estado: 'aguardando', 
            preenchendo: false, cartaNarradorUrl: null, pontosVitoria: parseInt(pontosVitoria) || 30,
            cartasUsadas: new Set() 
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
        if (!sala) return socket.emit('erro', 'Sala não encontrada!');
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
            sala.estado = alguemGanhou ? 'fim_jogo' : 'resultado';
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

        if(sala.bau.length < 30) preencherBauSala(codigo);
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
