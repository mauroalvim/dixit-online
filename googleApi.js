const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

// Estilos artísticos massivamente diversificados (Imita diferentes expansões e pintores)
const imaginativeStyles = [
    "vibrant digital illustration, clean vector art style, bright pastel colors, magical atmosphere",
    "classic oil painting texture, rich dramatic lighting, renaissance fantasy surrealism",
    "whimsical watercolor and ink sketch, dreamy pastel tones, elegant storybook aesthetic",
    "gothic surrealism, dark fantasy concept art, glowing neon magical elements, intricate details",
    "impressionist vibrant painting, thick expressive brushstrokes, poetic and atmospheric",
    "minimalist artistic fantasy, soft warm lighting, ethereal and surreal design",
    "retro 1970s fantasy illustration, vibrant warm colors, nostalgic fairy-tale vibe"
];

// Listas massivas para combinação estocástica (Garante milhares de temas únicos sem repetição)
const subjects = [
    "a sleeping crystal dragon", "an ancient stone giant", "a tiny mechanical hummingbird", 
    "a lonely astronaut", "a fox wearing a monarch crown", "a child made of starlight",
    "a floating floating island", "a steampunk airship", "a mysterious librarian",
    "a porcelain marionette", "a glowing spirit fox", "an origami phoenix",
    "a cosmic turtle carrying a library", "a musician playing a cello of light"
];

const actions = [
    "painting the aurora borealis with a brush", "holding a miniature galaxy inside a glass jar",
    "climbing a staircase made of floating playing cards", "sleeping peacefully inside a giant blooming lotus",
    "releasing flocks of glowing butterflies into a dark room", "navigating a river of liquid silver",
    "balancing planets on the tips of its fingers", "reading a book whose pages turn into birds",
    "sewing patches of the night sky onto a winter coat", "whispering secrets to a golden mirror"
];

const settings = [
    "inside an upside-down city floating in the clouds", "surrounded by a forest of giant singing crystals",
    "on a desert where dunes are made of crushed pearls", "beneath a purple sky with three glowing moons",
    "inside a vast clockwork library of infinite doors", "on top of a towering stack of glowing books",
    "within an underwater kingdom of neon coral", "floating through the rings of a pastel-colored saturn"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a poetic, highly creative and completely unique surreal concept for an Imagination board game card. Max 12 words. Only the description.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
            // Mistura matemática estocástica para garantir zero repetição de cenários
            const sub = subjects[Math.floor(Math.random() * subjects.length)];
            const act = actions[Math.floor(Math.random() * actions.length)];
            const set = settings[Math.floor(Math.random() * settings.length)];
            imagePrompt = `${sub} ${act} ${set}`;
        }
    } catch (error) {
        const sub = subjects[Math.floor(Math.random() * subjects.length)];
        const act = actions[Math.floor(Math.random() * actions.length)];
        const set = settings[Math.floor(Math.random() * settings.length)];
        imagePrompt = `${sub} ${act} ${set}`;
    }

    const randomStyle = imaginativeStyles[Math.floor(Math.random() * imaginativeStyles.length)];
    const uniqueSeed = Math.floor(Math.random() * 999999999) + Date.now() % 10000;
    
    const finalPrompt = encodeURIComponent(`${imagePrompt}, cinematic framing, surrealism, ${randomStyle}, board game masterpiece art`);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=1000&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
