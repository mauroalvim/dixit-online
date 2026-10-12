const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline para o Gemini."); }
}

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
let pixabayCache = []; 

// O NOVO PLANO DE EMERGÊNCIA (Apenas Ilustrações Mágicas, ZERO Fotos)
const magicalFallbacks = [
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcm0zMDktYWV3LTAxM18xLmpwZw.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdi01MzYtbWFjcm92ZWN0b3ItMDcxXzEuanBn.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdjQxNC1tYWNyby0yMWEuanBn.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdjQxNC1tYWNyby0zMC5qcGc.jpg",
    "https://images.rawpixel.com/image_800/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdjk0NC1iZy0wMS1hLmpwZw.jpg"
];

async function fetchPixabayBatch() {
    if (!PIXABAY_KEY) {
        console.warn("AVISO: Chave do Pixabay ausente! Usando o Baú Mágico de Emergência.");
        return [];
    }
    // Pesquisa focada exclusivamente em pinturas, ilustrações e arte digital (sem fotos)
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=surreal+fantasy+dream&image_type=illustration&category=backgrounds&per_page=150&safesearch=true`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.hits.map(hit => hit.largeImageURL);
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
        
        // JUIZ IMPLACÁVEL: Instruções ultra-estritas
        const prompt = "Você é um juiz de arte muito rigoroso para o jogo Dixit. Analise esta imagem. O jogo exige APENAS ilustrações, pinturas ou arte digital que sejam surreais, mágicas e oníricas. REGRAS DE REJEIÇÃO: Se a imagem for uma fotografia real, se tiver pessoas reais, paisagens do mundo real, possuir texto, ou for monótona, você DEVE rejeitar imediatamente. Responda APENAS com a palavra SIM (se for arte surreal aprovada) ou NAO (se for foto ou inadequada).";

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);

        const answer = result.response.text().trim().toUpperCase();
        console.log(`[Juiz IA] Veredito para a carta: ${answer}`);
        
        return answer.includes("SIM") || answer.includes("YES");
    } catch (error) {
        console.error("[Juiz IA] Erro ao avaliar, rejeitando por precaução.");
        return false;
    }
}

async function getValidatedCard() {
    if (pixabayCache.length === 0) {
        console.log("[Pixabay] A buscar novo lote de ilustrações...");
        pixabayCache = await fetchPixabayBatch();
        pixabayCache = pixabayCache.sort(() => Math.random() - 0.5); 
    }

    while (pixabayCache.length > 0) {
        const candidateUrl = pixabayCache.pop();
        const isApproved = await judgeImage(candidateUrl);
        
        if (isApproved) {
            return candidateUrl; 
        } else {
            console.log(`[Juiz IA] IMAGEM REJEITADA! Não é Dixit. Buscando próxima...`);
        }
    }
    
    // Se o Pixabay falhar ou o Juiz rejeitar tudo, usamos as nossas ilustrações mágicas de garantia (ZERO FOTOS)
    const randomIndex = Math.floor(Math.random() * magicalFallbacks.length);
    return magicalFallbacks[randomIndex];
}

module.exports = { generateSurrealImage: getValidatedCard };
