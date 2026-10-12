const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline ativo para o Gemini."); }
}

const imaginativeStyles = [
    "childrens book illustration, vibrant pastel watercolors, heartwarming aesthetic",
    "bright colorful cartoon fantasy, cute magical storybook style, soft friendly lighting",
    "magical papercraft and origami art style, colorful layers, creative world",
    "bright whimsical ink and watercolor painting, dreamy pastel tones",
    "vibrant digital illustration, cute fantasy creatures, cheerful colors"
];

const subjects = [
    "a clumsy baby dragon", "a friendly giant turtle", 
    "a tiny hedgehog carrying a lantern", "a cheerful astronaut", 
    "a squirrel wearing a tiny hat", "a glowing star child",
    "a fluffy cloud shaped like a whale", "a steampunk mechanical owl",
    "a porcelain marionette dancing", "a wise old tree spirit"
];

const actions = [
    "painting a giant rainbow", "catching floating bubbles",
    "climbing a ladder of candy", "sleeping inside a glowing tulip",
    "releasing fireflies", "sailing a river of sparkling lemonade",
    "balancing colorful planets", "reading a pop up book"
];

const settings = [
    "in a magical forest", "surrounded by giant singing mushrooms",
    "on a hill with glowing grass", "beneath a bright pastel sky",
    "inside a cozy candy scented attic", "on a giant floating marshmallow"
];

async function generateSurrealImage() {
    let imagePrompt = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a playful and cute surreal concept for a board game card. Child-friendly, magical. Max 10 words. ONLY the description, no quotes, no formatting.";
            const result = await model.generateContent(instruction);
            let text = result.response.text();
            
            // SANITIZAÇÃO RIGOROSA: Remove aspas, asteriscos, quebras de linha que quebram a URL
            imagePrompt = text.replace(/[^a-zA-Z0-9\s,]/g, '').replace(/\s+/g, ' ').trim();
        }
    } catch (error) {
        console.error("Erro no Gemini, usando fallback local.");
    }

    // Se o Gemini falhar ou retornar vazio, usa a lista local
    if (!imagePrompt || imagePrompt.length < 5) {
        const sub = subjects[Math.floor(Math.random() * subjects.length)];
        const act = actions[Math.floor(Math.random() * actions.length)];
        const set = settings[Math.floor(Math.random() * settings.length)];
        imagePrompt = `${sub} ${act} ${set}`;
    }

    const randomStyle = imaginativeStyles[Math.floor(Math.random() * imaginativeStyles.length)];
    const uniqueSeed = Math.floor(Math.random() * 999999999) + Date.now();
    
    // Monta a URL limpa e segura
    const rawPrompt = `${imagePrompt}, ${randomStyle}, board game masterpiece art`;
    const finalPrompt = encodeURIComponent(rawPrompt);

    const imageUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=1000&nologo=true&seed=${uniqueSeed}`;
    
    return imageUrl;
}

module.exports = { generateSurrealImage };
