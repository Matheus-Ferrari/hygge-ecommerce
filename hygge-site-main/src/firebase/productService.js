import { db } from "./firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

/**
 * Busca todos os produtos da coleção 'products' no Firestore.
 * * CAMPOS DISPONÍVEIS NO OBJETO RETORNADO:
 * - id: String (ID automático do Firebase)
 * - nome: String (ex: "Xadrez Viking")
 * - preco: Number (ex: 49.9)
 * - descricao: String (Texto detalhado sobre o jogo)
 * - estoque: Number (Quantidade disponível)
 * - categoria: String (ex: "tabuleiro")
 * - imagemUrl: String (Link da imagem no Storage)
 */
export const getProducts = async () => {
  try {
    // Referência para a coleção que você criou no console
    const productsCol = collection(db, "products"); 
    
    // Busca os documentos (fotos, preços, descrições)
    const productSnapshot = await getDocs(productsCol);
    
    // Mapeia os dados para um formato que o front-end entenda facilmente
    const productList = productSnapshot.docs.map(doc => ({
      id: doc.id,         // O ID gerado pelo Firebase (ex: zsV46yz...)
      ...doc.data()       // Espalha os campos: nome, preco, estoque, etc.
    }));
    
    return productList;
  } catch (error) {
    console.error("Erro ao buscar produtos na Hygge Games:", error);
    return [];
  }
};