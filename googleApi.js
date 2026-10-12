const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

// Estilos artísticos muito mais lúdicos, infantis e mágicos (Menos sombrios, mais coloridos)
const imaginativeStyles = [
    "charming children's book illustration, vibrant pastel watercolors, whimsical and heartwarming aesthetic",
    "bright colorful cartoon fantasy, cute magical storybook style, soft friendly lighting, joyful atmosphere",
    "magical papercraft and origami art style, colorful layers, creative storybook world",
    "bright whimsical ink and watercolor painting, dreamy pastel tones, playful fairy-tale aesthetic",
    "vibrant digital children's illustration, cute fantasy creatures, cheerful and bright colors",
    "retro 1970s whimsical fairy-tale art, warm golden sunlight, nostalgic and joyful storybook vibe",
    "soft claymation style fantasy, cute rounded shapes, warm cozy lighting, magical atmosphere"
];

// Listas massivas e variadas para garantir zero repetição (Animais diversos, objetos mágicos, cenários amplos)
const subjects = [
    "a clumsy baby dragon learning to fly", "a friendly giant turtle with a garden on its shell", 
    "a tiny hedgehog carrying a glowing lantern", "a cheerful astronaut floating among colorful balloons", 
    "a squirrel wearing a tiny baker's hat", "a glowing star-child riding a paper boat",
    "a fluffy cloud shaped like a smiling whale", "a steampunk mechanical owl", "a curious raccoon wearing glasses",
    "a porcelain marionette dancing on a music box", "a wise old tree spirit with glowing moss eyebrows", "a paper origami phoenix",
    "a family of bears having a picnic on a giant lily pad", "a magical chameleon changing colors into rainbows"
];

const actions = [
    "painting a giant rainbow across the sky", "catching floating bubbles filled with tiny galaxies",
    "climbing a ladder made of colorful candy canes", "sleeping soundly inside a giant glowing tulip",
    "releasing fireflies that turn into musical notes", "sailing a river of sparkling lemonade",
    "balancing colorful planets on a wooden spoon", "reading a pop-up book that comes alive",
    "sewing patches of golden sunlight onto a quilt", "whispering secrets to a friendly mirror",
    "blowing bubbles that contain miniature forests", "building a castle out of wooden toy blocks"
];

const settings = [
    "inside an upside-down treehouse village in a magical forest", "surrounded by giant singing mushrooms and fireflies",
    "on a hill where grass glows in soft neon blues and pinks", "beneath a bright pastel sky with two smiling suns",
    "inside a cozy candy-scented attic filled with old toys", "on top of a giant floating marshmallow island",
    "within a secret garden of crystal flowers and butterflies", "floating gently through a pastel-colored dreamland"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a poetic, playful and cute surreal concept for an Imagination board game card. Child-friendly, magical, whimsical. Max 10 words. Only the description.";
            const result = await model.generateContent(instruction);
            imagePrompt = result.response.text().trim();
        } else {
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
    // Semente ultra aleatória combinando Math.random, timestamp e um fator estocástico extra
    const uniqueSeed = Math.floor(Math.random() * 999999999) + Date.now() + Math.floor(Math.random() * 50000);
    
    const finalPrompt = encodeURIComponent(`${imagePrompt}, dynamic framing, ${randomStyle}, board game masterpiece art`);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=1000&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
