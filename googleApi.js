const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline para o Gemini."); }
}

const styles = [
    "childrens book illustration, vibrant pastel watercolors",
    "bright colorful cartoon fantasy, cute magical storybook style",
    "magical papercraft art style, colorful creative world",
    "vibrant digital illustration, cute fantasy creatures, cheerful colors"
];

const fallbackSubjects = [
    "a clumsy baby dragon", "a friendly giant turtle", 
    "a tiny hedgehog carrying a lantern", "a cheerful astronaut", 
    "a fluffy cloud shaped like a whale", "a wise old tree spirit"
];

async function generateSurrealImage() {
    let rawText = "";

    try {
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const instruction = "Invent a playful and cute surreal concept for a board game card. Child-friendly, magical. Max 6 words. ONLY the description, no punctuation.";
            const result = await model.generateContent(instruction);
            rawText = result.response.text();
        }
    } catch (error) {
        console.error("Erro no Gemini, usando lista local.");
    }

    if (!rawText || rawText.length < 3) {
        rawText = fallbackSubjects[Math.floor(Math.random() * fallbackSubjects.length)];
    }

    // SANITIZAÇÃO ABSOLUTA: Remove TUDO o que não for letra, número ou espaço
    const cleanText = rawText.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    const uniqueSeed = Math.floor(Math.random() * 99999999) + Date.now();
    
    const combinedPrompt = `${cleanText} ${randomStyle}`;
    const finalPrompt = encodeURIComponent(combinedPrompt);

    return `https://image.pollinations.ai/prompt/${finalPrompt}?width=600&height=1000&nologo=true&seed=${uniqueSeed}`;
}

module.exports = { generateSurrealImage };
