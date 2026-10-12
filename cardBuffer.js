const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 50; // Baixámos para 50 para poupar memória do servidor gratuito
const REFILL_THRESHOLD = 30;
let isGenerating = false;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function refillBuffer() {
    if (isGenerating) return;
    isGenerating = true;

    console.log(`[Buffer] Iniciando curadoria de cartas. Cartas no Baú: ${buffer.length}`);

    while (buffer.length < MAX_BUFFER_SIZE) {
        try {
            // Pede ao Juiz IA uma carta validada
            const newCardUrl = await generateSurrealImage();
            
            if (newCardUrl) {
                buffer.push(newCardUrl);
                console.log(`[Buffer] Carta APROVADA guardada! Total: ${buffer.length}/${MAX_BUFFER_SIZE}`);
            }
            
            // Pausa pequena de 2 segundos para não sobrecarregar as APIs
            await delay(2000); 

        } catch (error) {
            console.log(`[Buffer] Erro de rede. Pausa de segurança...`);
            await delay(5000);
        }
    }

    isGenerating = false;
    console.log("[Buffer] Reposição concluída. Baú cheio de obras-primas.");
}

function drawCards(count) {
    const cardsDrawn = [];
    
    for (let i = 0; i < count; i++) {
        if (buffer.length > 0) {
            cardsDrawn.push(buffer.shift());
        } else {
            const uniqueSeed = Math.floor(Math.random() * 999999999);
            cardsDrawn.push(`https://picsum.photos/600/1000?random=emergencia${uniqueSeed}`);
        }
    }

    if (buffer.length < REFILL_THRESHOLD && !isGenerating) {
        refillBuffer();
    }

    return cardsDrawn;
}

module.exports = { refillBuffer, drawCards, buffer };
