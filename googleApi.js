const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline para o Gemini."); }
}

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
let pixabayCache = []; 

// FALLBACKS BLINDADOS: Obras de arte de domínio público (Wikimedia nunca bloqueia)
const magicalFallbacks = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/600px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg", // Van Gogh
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Henri_Rousseau_-_The_Dream_-_MoMA.jpg/600px-Henri_Rousseau_-_The_Dream_-_MoMA.jpg", // O Sonho (Surreal)
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/El_jard%C3%ADn_de_las_Delicias%2C_de_El_Bosco.jpg/600px-El_jard%C3%ADn_de_las_Delicias%2C_de_El_Bosco.jpg", // Bosch
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/The_Great_Wave_off_Kanagawa.jpg/600px-The_Great_Wave_off_Kanagawa.jpg" // A Grande Onda
];

async function fetchPixabayBatch() {
    if (!PIXABAY_KEY) {
        console.warn("AVISO: Chave do Pixabay ausente! Usando obras de arte clássicas.");
        return [];
    }
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=surreal+fantasy+dream&image_type=illustration&per_page=150&safesearch=true`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.hits && data.hits.length > 0) {
            return data.hits.map(hit => hit.largeImageURL);
        }
        return [];
    } catch (e) {
        console.error("Erro no Pixabay:", e);
        return [];
    }
}

async function judgeImage(imageUrl) {
    if (!genAI) return true; 

    try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString("base64");

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Juiz mais equilibrado (aprova mais ilustrações)
        const prompt = "Você é um curador de arte para o jogo Dixit. Analise esta imagem. O jogo precisa de ilustrações, pinturas ou arte que sejam criativas, imaginativas ou oníricas. Se a imagem for claramente uma fotografia comum do dia a dia (ex: foto de uma rua real, foto de uma pessoa real num ambiente real), responda NAO. Se for uma ilustração, pintura, desenho digital ou paisagem surreal, responda SIM. Responda APENAS com a palavra SIM ou NAO.";

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);

        const answer = result.response.text().trim().toUpperCase();
        console.log(`[Juiz IA] Veredito: ${answer}`);
        
        return answer.includes("SIM") || answer.includes("YES");
    } catch (error) {
        console.error("[Juiz IA] Erro ao avaliar, aprovando por garantia.");
        return true; // Se a IA falhar a análise, aprova para não esvaziar o Baú
    }
}

async function getValidatedCard() {
    if (pixabayCache.length === 0) {
        console.log("[Pixabay] A buscar imagens...");
        pixabayCache = await fetchPixabayBatch();
        pixabayCache = pixabayCache.sort(() => Math.random() - 0.5); 
    }

    while (pixabayCache.length > 0) {
        const candidateUrl = pixabayCache.pop();
        const isApproved = await judgeImage(candidateUrl);
        
        if (isApproved) {
            return candidateUrl; 
        } else {
            console.log(`[Juiz IA] Foto rejeitada.`);
        }
    }
    
    // Fallback de Obras de Arte Clássicas
    const randomIndex = Math.floor(Math.random() * magicalFallbacks.length);
    return magicalFallbacks[randomIndex];
}

module.exports = { generateSurrealImage: getValidatedCard };
