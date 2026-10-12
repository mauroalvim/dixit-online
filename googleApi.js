const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

const dixitStyles = [
    "whimsical watercolor painting, pastel and bright cheerful colors, fairytale illustration style",
    "classic oil painting, rich textures, surrealism, mysterious and poetic board game art",
    "minimalist artistic fantasy, soft warm lighting, dreamy and atmospheric concept art",
    "vibrant storybook illustration, highly detailed, magical realism, colorful and expressive",
    "vintage storybook art, quirky characters, bright neon accents over deep contrast",
    "gothic surrealism, dark fantasy illustration, glowing elements, intricate details"
];

// Foco total em personagens centrais marcantes e expressivos
const centralCharacters = [
    "A close-up portrait of a mysterious clockmaker", "A whimsical wizard holding a glowing glass orb",
    "A lonely astronaut sitting on a crescent moon", "A curious fox wearing elegant Victorian clothing",
    "A magical child surrounded by floating origami birds", "An ancient tree spirit with a wise, kind face",
    "A theatrical jester juggling planets", "A graceful ballerina dancing on a floating cloud",
    "A friendly giant holding a tiny glowing village", "A detective cat with a magnifying glass examining a star"
];

const surrealActions = [
    "weaving threads of starlight into a blanket", "painting a door that opens into a vibrant galaxy",
    "listening to secrets whispered by a magical seashell", "releasing a flock of glowing butterflies from a vintage lantern",
    "balancing a fragile miniature world on the palm of their hand", "playing a haunting melody on a crystal flute"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a poetic, surreal concept for a Dixit card focusing on a prominent central character (max 10 words). Only the description.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
            const char = centralCharacters[Math.floor(Math.random() * centralCharacters.length)];
            const act = surrealActions[Math.floor(Math.random() * surrealActions.length)];
            imagePrompt = `${char} ${act}`;
        }
    } catch (error) {
        const char = centralCharacters[Math.floor(Math.random() * centralCharacters.length)];
        const act = surrealActions[Math.floor(Math.random() * surrealActions.length)];
        imagePrompt = `${char} ${act}`;
    }

    const randomStyle = dixitStyles[Math.floor(Math.random() * dixitStyles.length)];
    const uniqueSeed = Math.floor(Math.random() * 99999999) + Date.now() % 1000;
    
    // Pedimos explicitamente um plano centralizado ("centered composition, close-up") para afastar a logo das bordas
    const finalPrompt = encodeURIComponent(`${imagePrompt}, centered composition, close-up, ${randomStyle}, dixit board game masterpiece`);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
