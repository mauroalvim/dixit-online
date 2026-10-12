const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

// Estilos visuais variados inspirados nas expansões do Dixit
const dixitStyles = [
    "whimsical watercolor painting, pastel and bright cheerful colors, fairytale illustration style",
    "classic oil painting, rich textures, surrealism, mysterious and poetic board game art",
    "minimalist artistic fantasy, soft warm lighting, dreamy and atmospheric concept art",
    "vibrant storybook illustration, highly detailed, magical realism, colorful and expressive",
    "vintage storybook art, quirky characters, bright neon accents over deep contrast",
    "gothic surrealism, dark fantasy illustration, glowing elements, intricate details",
    "impressionist vibrant painting, thick brushstrokes, dreamlike poetic atmosphere"
];

// Blocos modulares independentes para criar infinitas combinações únicas (Garante zero repetição)
const subjects = [
    "a tiny astronaut", "an origami crane", "a sleeping dragon", "a mechanical owl", 
    "a ghost wearing a yellow scarf", "an old lighthouse keeper", "a child made of glass",
    "a flying whale", "a fox with reading glasses", "a wandering pianist", "a cloud shaped like a cat",
    "a knight in rusted armor", "a gardener tending glowing flowers", "a porcelain ballerina"
];

const actionsOrObjects = [
    "painting the stars with a golden brush", "holding a jar full of captured echoes",
    "climbing a ladder made of musical notes", "riding a bicycle across moonbeams",
    "floating inside a giant soap bubble", "reading an infinite book", "catching falling comets with a net",
    "opening a door that reveals an ocean", "playing a flute made of icicles", "sewing patches of sky onto a coat"
];

const surrealSettings = [
    "inside an upside-down floating city", "surrounded by a forest of giant glowing mushrooms",
    "on top of a towering stack of vintage books", "beneath a purple desert of glass sand",
    "floating through the rings of Saturn", "inside a clockwork kingdom of ticking gears",
    "on a beach where the waves are made of liquid silver", "within a labyrinth of mirrors reflecting alternate realities"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            // Se o Gemini estiver ativo, pede um conceito totalmente livre e imprevisível
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a completely bizarre, poetic, and unique concept for a Dixit board game card in English (max 10 words). Focus on surrealism. Only the description.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
            // Se estiver em modo offline, combina aleatoriamente os blocos para garantir variedade infinita
            const sub = subjects[Math.floor(Math.random() * subjects.length)];
            const act = actionsOrObjects[Math.floor(Math.random() * actionsOrObjects.length)];
            const set = surrealSettings[Math.floor(Math.random() * surrealSettings.length)];
            imagePrompt = `${sub} ${act} ${set}`;
        }
    } catch (error) {
        const sub = subjects[Math.floor(Math.random() * subjects.length)];
        const act = actionsOrObjects[Math.floor(Math.random() * actionsOrObjects.length)];
        const set = surrealSettings[Math.floor(Math.random() * surrealSettings.length)];
        imagePrompt = `${sub} ${act} ${set}`;
    }

    // Sorteia um estilo artístico único
    const randomStyle = dixitStyles[Math.floor(Math.random() * dixitStyles.length)];
    
    // Semente altamente aleatória baseada no relógio e em números randómicos para evitar padrões
    const uniqueSeed = Math.floor(Math.random() * 99999999) + Date.now() % 1000;
    
    const finalPrompt = encodeURIComponent(`${imagePrompt}, ${randomStyle}, dixit board game masterpiece`);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=900&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
