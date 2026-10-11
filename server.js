const express = require('express');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Configura o Gemini com a chave de API que você vai colocar no Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELO = process.env.GEMINI_MODELO || 'gemini-2.5-flash-image';

// Cria a pasta public/cartas caso não exista
const PASTA_CARTAS = path.join(__dirname, 'public', 'cartas');
if (!fs.existsSync(PASTA_CARTAS)) {
  fs.mkdirSync(PASTA_CARTAS, { recursive: true });
}

// Estilo base do Dixit
const ESTILO_DIXIT = 'surreal dreamlike illustration, whimsical fairy-tale storybook art, soft muted pastel palette, hand-painted texture, magical melancholic atmosphere, vertical card composition, no text, no letters, no watermark';

// Rota da API para gerar a carta
app.get('/api/gerar-carta', async (req, res) => {
  // Pega a cena digitada pelo usuário ou usa uma padrão
  const cena = req.query.cena || 'a magical forest with glowing mushrooms';
  const prompt = `${cena}, ${ESTILO_DIXIT}`;

  try {
    const response = await ai.models.generateContent({
      model: MODELO,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '2:3' },
      },
    });

    // Procura a imagem na resposta do Google
    const part = response.candidates[0].content.parts.find(p => p.inlineData);
    
    if (part) {
      // Cria um nome de arquivo único baseado na data/hora
      const nomeArquivo = `carta-${Date.now()}.png`;
      const arquivo = path.join(PASTA_CARTAS, nomeArquivo);
      
      // Salva a imagem na pasta
      fs.writeFileSync(arquivo, Buffer.from(part.inlineData.data, 'base64'));
      
      // Retorna o link da imagem para o HTML
      res.json({ sucesso: true, url: `/cartas/${nomeArquivo}` });
    } else {
      res.status(500).json({ sucesso: false, erro: 'A resposta não continha imagem.' });
    }
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// Serve os arquivos estáticos (HTML, CSS, Imagens)
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
