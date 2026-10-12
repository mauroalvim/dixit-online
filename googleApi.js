// googleApi.js
const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Crie uma descrição curta, surreal, mágica e abstrata para uma carta do jogo Dixit em inglês (máximo 12 palavras). Apenas a descrição.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
            // Lista de ideias aleatórias caso o Gemini não esteja ativo
            const fallbacks = [
                "a giant whale swimming through a starry sky",
                "a lonely traveler holding an umbrella made of clouds",
                "a surreal clock melting over a floating crystal island",
                "an ancient library where books turn into glowing butterflies",
                "a mysterious hooded figure looking at a door in the middle of an ocean"
            ];
            imagePrompt = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
    } catch (error) {
        imagePrompt = "surreal dreamcore fantasy painting dixit style";
    }

    // O SEGREDO PARA AS CARTAS NÃO REPETIREM: 
    // Adicionamos um número aleatório (Math.random) no final da URL para forçar a IA a criar uma imagem nova e única para cada carta!
    const uniqueSeed = Math.floor(Math.random() * 999999);
    const finalPrompt = encodeURIComponent(imagePrompt + ", vibrant colors, high detail, dixit board game art style");

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
