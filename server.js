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

// DECK DE EMERGÊNCIA (Imagens lindas e garantidas para que o jogo nunca trave com lixo)
const cartasDeEmergencia = [
    "https://cdn.pixabay.com/photo/2022/11/07/19/12/fantasy-7576976_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/06/18/04/57/crimson-8071231_1280.jpg",
    "https://cdn.pixabay.com/photo/2021/09/13/08/19/fantasy-6620584_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/11/09/19/36/landscape-8378170_1280.jpg",
    "https://cdn.pixabay.com/photo/2020/05/26/20/39/bird-5224783_1280.jpg",
    "https://cdn.pixabay.com/photo/2021/11/21/21/14/nature-6815142_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/12/28/19/22/ai-generated-8474776_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/08/11/04/51/ai-generated-8182766_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/10/24/00/40/ai-generated-8337180_1280.jpg",
    "https://cdn.pixabay.com/photo/2023/07/13/18/34/ai-generated-8125488_1280.jpg"
];

const promptJuizIA = `Você é um curador de arte rigoroso para um jogo de tabuleiro (estilo Dixit). 
Analise a lista de URLs e retorne UM ARRAY JSON com as URLs APROVADAS.

REJEIÇÃO IMEDIATA (Se tiver isto, rejeite):
1. Mulheres fotorrealistas, lobos reais, pessoas reais, ou fotografias a preto e branco.
2. Fundos totalmente brancos, transparentes ou imagens recortadas (o cenário tem de preencher a imagem toda).
3. Textos, letras ou padrões de papel de parede.

APROVAÇÃO:
- Aceite APENAS pinturas, ilustrações abstratas, aquarela, cenários surreais e arte de fantasia.

Responda APENAS com o JSON. Exemplo: ["url1", "url2"]`;

function embaralharArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --------------------------------------------------------
// MOTOR DO PINTEREST (SCRAPER DIRETO DE HTML - INFALÍVEL)
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
    
    const pastasSorteadas = embaralharArray([...pastasDisponiveis]).slice(0, 3);
    let urls = [];
    
    for (let pasta of pastasSorteadas) {
        try {
            // Lemos a página web real, sem RSS!
            const url = `https://br.pinterest.com/${pasta}/`;
            
            const response = await axios.get(url, { 
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            const html = response.data; 
            // Expressão regular para extrair links diretos de imagens do código da página
            const regex = /https:\/\/i\.pinimg\.com\/736x\/[^"'\s]+\.jpg/g;
            let matches = html.match(regex);
            
            if (matches) {
                matches.forEach(imgUrl => {
                    if (!memoriaCartasGlobais.has(imgUrl)) {
                        urls.push(imgUrl);
                    }
                });
            }
        } catch (e) {
            console.error(`Erro ao varrer Pinterest (${pasta}):`, e.message);
        }
    }
    // Remove duplicados absolutos
    return embaralharArray([...new Set(urls)]);
}

// --------------------------------------------------------
// MOTOR DO PIXABAY (Apenas para último recurso)
// --------------------------------------------------------
async function buscarCartasMisturadasPixabay() {
    try {
        const temasBusca = ["surreal art", "fantasy illustration", "dreamscape painting", "whimsical illustration"];
        const tema = temasBusca[Math.floor(Math.random() * temasBusca.length)];
        const randomPage = Math.floor(Math.random() * 10) + 1; 
        
        const query = encodeURIComponent(tema);
        const url = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${query}&image_type=illustration&orientation=vertical&per_page=20&page=${randomPage}&safesearch=true`;
        
        const res = await axios.get(url, { timeout: 5000 });
        const todasUrls = res.data.hits.map(hit => hit.largeImageURL);
        return todasUrls.filter(url => !memoriaCartasGlobais.has(url));
    } catch (error) {
        return [];
    }
}

// --------------------------------------------------------
// JUIZ IA (Com bloqueio de lixo)
// --------------------------------------------------------
async function julgarCartas(urls) {
    if(!urls || urls.length === 0) return [];
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${promptJuizIA}\n\nURLs:\n${JSON.stringify(urls)}`);
        const text = result.response.text();
        const jsonMatch = text.match(/\[.*\]/s);
        
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return []; // Se a IA se confundir, devolve VAZIO. Nunca devolve imagens sem julgamento.
    } catch (error) {
        console.error("Erro no Juiz IA:", error.message);
        return []; 
    }
}

// --------------------------------------------------------
// GERENCIAMENTO DO BAÚ (BLINDADO)
// --------------------------------------------------------
async function preencherBauRapidoInicial(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    sala.preenchendo = true;
    let urlsFinal = [];
    
    try {
        console.log(`[SALA ${codigo}] A extrair cartas do PINTEREST...`);
        let urlsPinterest = await buscarCartasPinterest();
        
        // 1. TENTA O PINTEREST
        if (urlsPinterest.length > 0) {
            let aprovadas = await julgarCartas(urlsPinterest.slice(0, 40));
            if (aprovadas.length > 0) urlsFinal = aprovadas;
        }
        
        // 2. SE PINTEREST FALHAR (Ou a IA rejeitar tudo), TENTA PIXABAY
        if (urlsFinal.length === 0) {
            console.log(`[SALA ${codigo}] Recorrendo ao Pixabay...`);
            let urlsPixabay = await buscarCartasMisturadasPixabay();
            let aprovadasPixabay = await julgarCartas(urlsPixabay.slice(0, 40));
            if (aprovadasPixabay.length > 0) urlsFinal = aprovadasPixabay;
        }
        
        // 3. SE TUDO FALHAR: DECK DE EMERGÊNCIA (O jogo nunca encrava, e nunca recebe lixo)
        if (urlsFinal.length === 0) {
            console.log(`[SALA ${codigo}] Injetando Deck de Emergência Seguro.`);
            urlsFinal = embaralharArray([...cartasDeEmergencia]);
        }
        
        // Coloca no baú
        urlsFinal.forEach(url => memoriaCartasGlobais.add(url));
        sala.bau.push(...embaralharArray(urlsFinal));
        
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
                let urlsPixabay = await buscarCartasMisturadasPixabay();
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
