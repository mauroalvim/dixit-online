const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

// Estilos visuais altamente diversificados inspirados no Dixit
const dixitStyles = [
    "whimsical watercolor painting, pastel and bright cheerful colors, fairytale illustration style",
    "classic oil painting, rich textures, surrealism, mysterious and poetic board game art",
    "minimalist artistic fantasy, soft warm lighting, dreamy and atmospheric concept art",
    "vibrant storybook illustration, highly detailed, magical realism, colorful and expressive",
    "vintage storybook art, quirky characters, bright neon accents over deep contrast",
    "gothic surrealism, dark fantasy illustration, glowing elements, intricate details"
];

// ENQUADRAMENTOS E CENÁRIOS VARIADOS (Adeus aos retratos repetidos de pessoas de frente!)
const diverseConcepts = [
    "A tiny paper boat sailing across an ocean made of glowing musical sheets",
    "An antique pocket watch floating in mid-air, opening up to reveal a miniature forest",
    "A giant sleepy whale with a cozy little village built upon its back",
    "A lonely red umbrella walking itself along a misty cobblestone bridge",
    "A magnificent tree whose leaves are glowing glass lanterns lighting up the night",
    "A vintage locomotive flying through rings of Saturn made of colorful ribbons",
    "A mischievous fox wearing a top hat whispering secrets to an ancient stone owl",
    "An endless staircase spiraling up into a sky filled with pastel-colored planets",
    "A grand piano abandoned in a quiet meadow, sprouting wildflowers from its keys",
    "A glowing key resting on a cloud, unlocking a door floating in the open sky",
    "A silhouetted traveler standing before a giant mirror reflecting a completely different magical world",
    "A school of luminous fish swimming through the branches of an underwater autumn tree"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a poetic, highly imaginative concept for a Dixit card focusing on objects, landscapes, or surreal animals (no simple front-facing portraits). Max 12 words. Only the description.";
            const result = model.generateContent(instruction);
            imagePrompt = (await result).response.text().trim();
        } else {
            imagePrompt = diverseConcepts[Math.floor(Math.random() * diverseConcepts.length)];
        }
    } catch (error) {
        imagePrompt = diverseConcepts[Math.floor(Math.random() * diverseConcepts.length)];
    }

    const randomStyle = dixitStyles[Math.floor(Math.random() * dixitStyles.length)];
    const uniqueSeed = Math.floor(Math.random() * 99999999) + Date.now() % 1000;
    
    // Adicionamos comandos para afastar o assunto das bordas e garantir planos abertos/panorâmicos
    const finalPrompt = encodeURIComponent(`${imagePrompt}, wide angle shot, cinematic composition, surrealism, ${randomStyle}, dixit board game art`);

    // URL com nologo explícito e proporção ajustada para afastar qualquer rodapé da área visível
    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=500&height=800&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
