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

REGRAS DE REJEIÇÃO ABSOLUTA (Elimine imediatamente):
1. REJEITE QUALQUER IMAGEM QUE TENHA UM ROSTO HUMANO REALISTA. Mesmo que seja arte digital, se a pele, os olhos ou os traços parecerem fotografia, REJEITE.
2. REJEITE paisagens fotográficas do mundo real.
3. REJEITE fundos transparentes, brancos lisos, texturas planas ou imagens recortadas (PNG isolado).
4. REJEITE imagens com texto legível ou marcas d'água.

CRITÉRIOS DE APROVAÇÃO:
- Aceite APENAS pinturas clássicas, ilustrações surreais, cenários de fantasia, aquarela, ou arte estilo "livro de contos".
- A imagem deve preencher todo o quadro e parecer uma obra de arte pronta para contar uma história imaginativa.

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// MOTOR DO PINTEREST (Disfarçado de Navegador Real)
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
    
    // Sorteia 4 pastas para garantir variedade
    const pastasSorteadas = embaralharArray([...pastasDisponiveis]).slice(0, 4);
    
    let urls = [];
    for (let pasta of pastasSorteadas) {
        try {
            const url = `https://br.pinterest.com/${pasta}.rss`;
            
            // O SEGREDO 10.56: Headers que enganam a proteção do Pinterest
            const response = await axios.get(url, { 
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            const xml = response.data;
            
            const regex = /<img src="([^"]+)"/g;
            let match;
            while ((match = regex.exec(xml)) !== null) {
                let imgUrl = match[1];
                // Busca a melhor resolução possível do Pinterest
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
// GERENCIAMENTO DO BAÚ (Focado 100% no Pinterest)
// --------------------------------------------------------
async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    try {
        console.log(`[SALA ${codigo}] Puxando lotes do PINTEREST (Com disfarce de navegador)...`);
        
        // Exclusividade do Pinterest na primeira rodada
        let urlsPinterest = await buscarCartasPinterest();
        
        if (urlsPinterest.length > 0) {
            // Passa até 40 cartas pro Juiz IA analisar
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
            
            if (aprovadas.length > 0) {
                aprovadas.forEach(url => memoriaCartasGlobais.add(url));
                sala.bau.push(...embaralharArray(aprovadas));
                console.log(`[SALA ${codigo}] Sucesso! ${aprovadas.length} cartas do Pinterest aprovadas.`);
            } else {
                console.log(`[AVISO] Juiz rejeitou tudo na Sala ${codigo}. Aplicando fallback de segurança.`);
                const fallbackUrls = urlsPinterest.slice(0, 10);
                fallbackUrls.forEach(url => memoriaCartasGlobais.add(url));
                sala.bau.push(...fallbackUrls);
            }
        } else {
            console.error(`[ERRO CRÍTICO] O Pinterest não devolveu imagens. Verifique a conexão do Render.`);
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
            
            if (urlsPinterest.length === 0) break;
            
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 30));
            if (aprovadas.length > 0) {
                aprovadas.forEach(url => memoriaCartasGlobais.add(url));
                sala.bau.push(...embaralharArray(aprovadas));
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
