// googleApi.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Inicializa o Gemini para gerar os prompts criativos
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function generateSurrealImage() {
    try {
        // 1. Pedir ao Gemini para criar um prompt onírico/surreal
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const instruction = "Descreva uma cena surreal, poética e abstrata para uma carta do jogo Dixit em até 15 palavras. Apenas a descrição, sem aspas.";
        
        const result = await model.generateContent(instruction);
        const imagePrompt = result.response.text().trim();
        console.log(`[Google API] Prompt gerado: ${imagePrompt}`);

        // 2. Chamar a API de Imagem (Google Imagen / Vertex AI)
        // Substitua este bloco pelo endpoint exato da sua API de imagem do Google
        const imageUrl = await fetchGoogleImagenAPI(imagePrompt);
        
        return imageUrl;
    } catch (error) {
        console.error("[Google API] Erro na geração:", error);
        return null;
    }
}

// Função para acionar a API de geração de imagem (Exemplo base)
async function fetchGoogleImagenAPI(prompt) {
    /* 
    Exemplo de integração real com Axios:
    const response = await axios.post('SUA_URL_DA_API_DE_IMAGEM_AQUI', {
        prompt: prompt,
        // outras configurações da API de imagem
    }, { headers: { 'Authorization': `Bearer ${process.env.GOOGLE_API_KEY}` } });
    return response.data.imageUrl; // ajuste conforme o retorno da sua API
    */

    // Mock temporário para você testar a lógica do buffer imediatamente:
    const mockId = Math.floor(Math.random() * 10000);
    return `https://picsum.photos/seed/${mockId}/400/600`; 
}

module.exports = { generateSurrealImage };
