const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 100; // Reduzido para não esgotar a RAM da máquina (Render gratuito)
const REFILL_THRESHOLD = 70;
let isGenerating = false;

// Função utilitária para criar pausas (sleep)
const delay = ms => new Promise(res => setTimeout(res, ms));

async function refillBuffer() {
    if (isGenerating) return;
    isGenerating = true;

    console.log(`[Buffer] Iniciando repousição lenta. Cartas atuais: ${buffer.length}`);

    while (buffer.length < MAX_BUFFER_SIZE) {
        try {
            const newCardUrl = await generateSurrealImage();
            
            if (newCardUrl) {
                buffer.push(newCardUrl);
                console.log(`[Buffer] Carta encriptada no Baú! Total: ${buffer.length}/${MAX_BUFFER_SIZE}`);
            }
            
            // O SEGREDO DO ANTI-BLOQUEIO: Espera 3.5 segundos entre CADA pedido à IA.
            // Para o jogador é transparente, mas para a Pollinations parece tráfego normal.
            await delay(3500);

        } catch (error) {
            console.warn(`[Buffer] Falha ao gerar carta. A pausar por 10s para evitar bloqueio.`);
            await delay(10000); // Pausa longa se a rede falhar
        }
    }

    isGenerating = false;
    console.log("[Buffer] Reposição concluída. Baú cheio.");
}

function drawCards(count) {
    const cardsDrawn = [];
    
    for (let i = 0; i < count; i++) {
        if (buffer.length > 0) {
            cardsDrawn.push(buffer.shift());
        } else {
            // Plano Z de emergência (caso extremo em que o Baú secou completamente)
            // Usa o gerador diretamente de forma síncrona
            console.error("[CRÍTICO] Baú vazio! A devolver um link dinâmico de emergência.");
            cardsDrawn.push(`https://image.pollinations.ai/prompt/a%20magical%20dream%20illustration%20masterpiece?width=600&height=1000&nologo=true&seed=${Math.floor(Math.random()*999999)}`);
        }
    }

    // Aciona a fábrica em segundo plano
    if (buffer.length < REFILL_THRESHOLD && !isGenerating) {
        refillBuffer();
    }

    return cardsDrawn;
}

module.exports = { refillBuffer, drawCards, buffer };
