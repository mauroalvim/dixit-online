const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

// Estilos variados baseados nas expansões oficiais do Dixit para garantir diversidade extrema
const dixitStyles = [
    "whimsical watercolor painting, pastel and bright cheerful colors, fairytale illustration style",
    "classic oil painting, rich textures, surrealism, mysterious and poetic board game art",
    "minimalist artistic fantasy, soft warm lighting, dreamy and atmospheric concept art",
    "vibrant storybook illustration, highly detailed, magical realism, colorful and expressive",
    "vintage storybook art, quirky characters, bright neon accents over deep contrast"
];

const creativeThemes = [
    "a tiny paper boat sailing across a sea of glowing buttons",
    "an elephant with butterfly wings reading a book under a mushroom lamp",
    "a staircase leading up into a sky full of floating luminous jellyfish",
    "a musician playing a cello made of tree branches and autumn leaves",
    "a castle built on the back of a sleeping giant turtle in the clouds",
    "a window looking out from a cozy room straight into a galaxy of stars",
    "a clockmaker adjusting the gears inside a giant glowing full moon",
    "a fox wearing a top hat whispering secrets to an ancient stone statue",
    "a train travelling on tracks made of winding rainbow ribbons",
    "an artist painting doors that actually open into different surreal worlds"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a completely unique, highly imaginative, and abstract concept for a Dixit board game card in English (max 12 words). Only the description.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
            imagePrompt = creativeThemes[Math.floor(Math.random() * creativeThemes.length)];
        }
    } catch (error) {
        imagePrompt = creativeThemes[Math.floor(Math.random() * creativeThemes.length)];
    }

    // Sorteia um estilo artístico diferente para cada carta (Estilo expansões do Dixit)
    const randomStyle = dixitStyles[Math.floor(Math.random() * dixitStyles.length)];
    
    // Semente única para forçar a IA a criar algo totalmente novo
    const uniqueSeed = Math.floor(Math.random() * 9999999);
    
    const finalPrompt = encodeURIComponent(`${imagePrompt}, ${randomStyle}, masterwork card art`);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
