const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 50; 
const REFILL_THRESHOLD = 30;
let isGenerating = false;

const delay = ms => new Promise(res => setTimeout(res, ms));

// OBRAS DE ARTE GARANTIDAS PARA EMERGÊNCIAS
const magicalFallbacks = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/600px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Henri_Rousseau_-_The_Dream_-_MoMA.jpg/600px-Henri_Rousseau_-_The_Dream_-_MoMA.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/El_jard%C3%ADn_de_las_Delicias%2C_de_El_Bosco.jpg/600px-El_jard%C3%ADn_de_las_Delicias%2C_de_El_Bosco.jpg"
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
    console.log("[Buffer] Reposição concluída.");
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
