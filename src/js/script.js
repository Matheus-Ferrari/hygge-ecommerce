// 1. Importa a função de teste que você criou
import { getProducts } from '../firebase/productService';

async function testarConexaoFirebase() {
    console.log("🔍 Iniciando teste de conexão com o Firebase...");

    try {
        // 2. Tenta buscar os produtos no seu Firestore
        const produtos = await getProducts();

        if (produtos.length > 0) {
            console.log("✅ Sucesso! Firebase conectado.");
            console.log("📦 Produtos encontrados no banco:", produtos);
            
            // Exemplo de como acessar os campos que você configurou
            produtos.forEach(p => {
                console.log(`- Jogo: ${p.nome} | Preço: R$ ${p.preco} | ID: ${p.id}`);
            });
        } else {
            console.warn("⚠️ Conectado, mas a coleção 'products' parece estar vazia.");
        }
    } catch (error) {
        console.error("❌ Erro crítico na conexão:");
        console.error(error);
        alert("Erro ao conectar com o Firebase. Verifique o console (F12).");
    }
}

// Executa o teste assim que a página carregar
testarConexaoFirebase();

// Header transparente/verde ao rolar
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (!header) return;
    if (window.scrollY > 10) {
        header.classList.add('solid');
    } else {
        header.classList.remove('solid');
    }
});