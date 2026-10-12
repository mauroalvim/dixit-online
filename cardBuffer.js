// cardBuffer.js
const { generateSurrealImage } = require('./googleApi');

const buffer = [];
const MAX_BUFFER_SIZE = 200;
const REFILL_THRESHOLD = 150;
let isGenerating = false;

// Função que roda em background para encher o buffer
async function refillBuffer() {
    // Evita múltiplas instâncias de geração rodando ao mesmo tempo
    if (isGenerating) return;
    isGenerating = true;

    console.log(`[Buffer] Iniciando reposição. Cartas atuais: ${buffer.length}`);

    while (buffer.length < MAX_BUFFER_SIZE) {
        const newCardUrl = await generateSurrealImage();
        
        if (newCardUrl) {
            buffer.push(newCardUrl);
            console.log(`[Buffer] Carta criada! Total no Baú: ${buffer.length}/${MAX_BUFFER_SIZE}`);
        } else {
            // Em caso de erro na API (limite de taxa, etc), espera 5 segundos antes de tentar de novo
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    isGenerating = false;
    console.log("[Buffer] Reposição concluída. Baú cheio.");
}

// Função acionada pelo servidor quando um jogador precisa de cartas
function drawCards(count) {
    const cardsDrawn = [];
    
    for (let i = 0; i < count; i++) {
        if (buffer.length > 0) {
            // Tira a primeira carta do array e entrega ao jogador
            cardsDrawn.push(buffer.shift());
        }
    }

    // Após sacar, verifica se o estoque caiu abaixo do limite seguro
    if (buffer.length < REFILL_THRESHOLD) {
        refillBuffer(); // Chama de forma assíncrona (sem await) para não travar o jogo
    }

    return cardsDrawn;
}

module.exports = { refillBuffer, drawCards, buffer };
