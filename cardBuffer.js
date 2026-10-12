const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 50; 
const REFILL_THRESHOLD = 30;
let isGenerating = false;

const delay = ms => new Promise(res => setTimeout(res, ms));

// O NOVO PLANO DE EMERGÊNCIA DO BAÚ (ZERO FOTOS)
const magicalFallbacks = [
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcm0zMDktYWV3LTAxM18xLmpwZw.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdi01MzYtbWFjcm92ZWN0b3ItMDcxXzEuanBn.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdjQxNC1tYWNyby0yMWEuanBn.jpg"
];

async function refillBuffer() {
    if (isGenerating) return;
    isGenerating = true;

    console.log(`[Buffer] Iniciando curadoria de cartas. Cartas no Baú: ${buffer.length}`);

    while (buffer.length < MAX_BUFFER_SIZE) {
        try {
            const newCardUrl = await generateSurrealImage();
            
            if (newCardUrl) {
                buffer.push(newCardUrl);
                console.log(`[Buffer] Carta APROVADA guardada! Total: ${buffer.length}/${MAX_BUFFER_SIZE}`);
            }
            
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
            const randomIndex = Math.floor(Math.random() * magicalFallbacks.length);
            cardsDrawn.push(magicalFallbacks[randomIndex]);
        }
    }

    if (buffer.length < REFILL_THRESHOLD && !isGenerating) {
        refillBuffer();
    }

    return cardsDrawn;
}

module.exports = { refillBuffer, drawCards, buffer };
