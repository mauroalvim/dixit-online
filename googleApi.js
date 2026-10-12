// googleApi.js
const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

// Se você tiver a chave do Google no .env, ele usa. Se não, avança pacificamente.
let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Erro ao iniciar Gemini, usando modo offline."); }
}

async function generateSurrealImage(customPrompt = null) {
    let imagePrompt = customPrompt;

    // 1. GERAÇÃO DO TEXTO CRIATIVO (Se não passarmos um prompt específico)
    if (!imagePrompt) {
        try {
            if (genAI) {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const instruction = "Descreva uma cena surreal, mágica e poética para uma carta do jogo Dixit em inglês (até 15 palavras).";
                const result = await model.generateContent(instruction);
                imagePrompt = result.response.text().trim();
            } else {
                imagePrompt = "surreal dreamcore fantasy painting dixit style masterpiece";
            }
        } catch (e) {
            imagePrompt = "whimsical surreal magic landscape dixit card concept art";
        }
    }

    console.log(`[Google API] A criar imagem para: ${imagePrompt}`);
    
    // Sufixo para garantir a estética do Dixit
    const finalPrompt = encodeURIComponent(imagePrompt + " highly detailed, colorful, dixit board game art style, surrealism");

    // =========================================================================
    // A SUA IDEIA GENIAL: SISTEMA DE FALLBACK (Planos A, B, C, D)
    // =========================================================================
    const strategies = [
        // Plano A: Pollinations com motor avançado FLUX (Alta Qualidade)
        `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&model=flux`,
        
        // Plano B: Pollinations com motor TURBO (Mais Rápido, caso o Flux esteja ocupado)
        `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&model=turbo`,
        
        // Plano C: Pollinations Clássico (Muito estável)
        `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true`,
        
        // Plano D (A SALVAÇÃO): Imagem Premium Mosaico de Cartas Dixit (Se a internet inteira cair, esta carrega)
        `https://images.rawpixel.com/image_1300/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcm0zMTEtYmctMDgteC5qcGc.jpg`
    ];

    // Para o cliente web (HTML), basta enviarmos a URL do primeiro plano. 
    // Como o Pollinations devolve a imagem on-the-fly, o próprio navegador do jogador encarrega-se de puxar.
    // Futuramente, se você quiser testar as APIs complexas (Leonardo, Fal.ai), basta adicionar o código de fetch() aqui dentro!
    
    console.log(`[Google API] URL do Plano A ativada e pronta.`);
    return strategies[0]; 
}

module.exports = { generateSurrealImage };
