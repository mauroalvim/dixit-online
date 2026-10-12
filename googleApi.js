// googleApi.js - VERSÃO DE TESTE DE CARREGAMENTO (10.29)
// Ignoramos a IA por completo para validar se a aplicação consegue carregar imagens externas.

const fallbackImages = [
    "https://fastly.picsum.photos/id/1015/600/1000.jpg?hmac=X-dEDQYJ0O9bVnU7J99vLd5aI1WnZ31hO7_W4W-9B0k",
    "https://fastly.picsum.photos/id/1016/600/1000.jpg?hmac=7_Q-wU9rYwX-2eXkZ36s_s8l8H_m6g0a1vI6X_Vv9E",
    "https://fastly.picsum.photos/id/1025/600/1000.jpg?hmac=L-vD1D8D2bWp-19N-u2p5_P5yM9w4B_k4eD1h6oR7k0",
    "https://fastly.picsum.photos/id/1035/600/1000.jpg?hmac=y3E_sB4aB4s5L_T4j-0L8Y9eF5K-u9E_yH_s9bK9h4",
    "https://fastly.picsum.photos/id/1040/600/1000.jpg?hmac=T9b6jG9mN-v_B-oV4fC-W-xY_8xP2aM-H_1G0R-Z8a",
    "https://fastly.picsum.photos/id/1045/600/1000.jpg?hmac=H-v1a9V2R-o_M_P4H-yL-aF-G-D4C_9hO_s9B9K4",
    "https://fastly.picsum.photos/id/1050/600/1000.jpg?hmac=E_xP8C-hV_o-L4T_D-kY_0F9B-M-s1D9H_6R-v4V_2a",
    "https://fastly.picsum.photos/id/1055/600/1000.jpg?hmac=P-v4a-V-yM_1H_O-sC-G_D_4F-kL-9B-Y-hR_1xP-2h",
    "https://fastly.picsum.photos/id/1060/600/1000.jpg?hmac=M-o-V-yM_1H_O-sC-G_D_4F-kL-9B-Y-hR_1xP-2h"
];

async function generateSurrealImage() {
    // Escolhe uma imagem da lista acima aleatoriamente
    const randomIndex = Math.floor(Math.random() * fallbackImages.length);
    const imageUrl = fallbackImages[randomIndex];
    
    // Adicionamos um timestamp inútil apenas para forçar o navegador a não usar cache antigo
    return `${imageUrl}&refresh=${Date.now()}`;
}

module.exports = { generateSurrealImage };
