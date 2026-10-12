// cardBuffer.js
const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 100;
const REFILL_THRESHOLD = 70;
let isGenerating = false;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function refillBuffer() {
    if (isGenerating) return;
    isGenerating = true;

    console.log(`[Buffer] Iniciando reposição... Cartas atuais: ${buffer.length}`);

    while (buffer.length < MAX_BUFFER_SIZE) {
        try {
            const newCardUrl = await generateSurrealImage();
            if (newCardUrl) {
                buffer.push(newCardUrl);
            }
            // Atraso de apenas 500ms para testes rápidos
            await delay(500);
        } catch (error) {
            await delay(2000);
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
            // FALLBACK DE EMERGÊNCIA - AGORA USA O PICSUM
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
