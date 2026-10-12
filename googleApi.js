// googleApi.js
async function generateSurrealImage() {
    // URL simples e limpa, gerando uma imagem aleatória instantânea
    const uniqueSeed = Math.floor(Math.random() * 999999999);
    return `https://picsum.photos/600/1000?random=${uniqueSeed}`;
}

module.exports = { generateSurrealImage };
