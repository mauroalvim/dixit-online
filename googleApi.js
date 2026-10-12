const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    try { genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }); } 
    catch (e) { console.log("Modo offline para o Gemini."); }
}

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
let pixabayCache = []; // Guarda as URLs para não pedir à API do Pixabay toda a hora

// 1. Busca um lote de imagens de fantasia/surrealismo no Pixabay
async function fetchPixabayBatch() {
    if (!PIXABAY_KEY) {
        console.warn("AVISO: Chave do Pixabay não encontrada!");
        return [];
    }
    // Pesquisa focada no lúdico, onírico e ilustrações
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=surreal+dream+fantasy+magic&image_type=illustration&per_page=200&safesearch=true`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.hits.map(hit => hit.largeImageURL);
    } catch (e) {
        console.error("Erro ao buscar no Pixabay:", e);
        return [];
    }
}

// 2. O Juiz: O Gemini olha para a imagem e decide
async function judgeImage(imageUrl) {
    if (!genAI) return true; // Se não houver Gemini, aprova por padrão

    try {
        // Baixa a imagem para a memória do servidor
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString("base64");

        // Pede ao Gemini para analisar a imagem
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "Você é um juiz de arte rigoroso para um jogo de tabuleiro estilo Dixit. Analise esta imagem. Ela é uma ilustração lúdica, surreal, onírica, mágica, sem textos e faz sentido para o jogo? Responda APENAS com a palavra SIM ou NAO.";

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);

        const answer = result.response.text().trim().toUpperCase();
        console.log(`[Juiz IA] Veredito: ${answer}`);
        
        // Só aprova se a IA disser explicitamente SIM
        return answer.includes("SIM") || answer.includes("YES");

    } catch (error) {
        console.error("[Juiz IA] Erro ao avaliar. Rejeitando por precaução.");
        return false;
    }
}

// 3. Função principal que entrega uma carta garantida e validada
async function getValidatedCard() {
    // Se o cache estiver vazio, vai buscar mais ao Pixabay
    if (pixabayCache.length === 0) {
        console.log("[Pixabay] A procurar novas imagens candidatas...");
        pixabayCache = await fetchPixabayBatch();
        pixabayCache = pixabayCache.sort(() => Math.random() - 0.5); // Embaralha
    }

    // Se continuar vazio (ex: sem API Key), fallback de emergência
    if (pixabayCache.length === 0) {
        return `https://picsum.photos/600/1000?random=${Math.floor(Math.random()*9999)}`;
    }

    // Tira uma imagem do cache e submete a julgamento
    while (pixabayCache.length > 0) {
        const candidateUrl = pixabayCache.pop();
        console.log(`[Juiz IA] A analisar candidato...`);
        
        const isApproved = await judgeImage(candidateUrl);
        
        if (isApproved) {
            return candidateUrl; // Aprovada! Segue para o Baú.
        } else {
            console.log(`[Juiz IA] Descartada! Não encaixa no perfil Dixit.`);
        }
    }
    
    return null;
}

// Mantemos o mesmo nome exportado para não quebrar o seu código
module.exports = { generateSurrealImage: getValidatedCard };
