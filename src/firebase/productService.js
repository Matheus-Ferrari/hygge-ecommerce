import { db } from "./firebaseConfig"; 
import { collection, getDocs } from "firebase/firestore";

export const getProducts = async () => {
  try {
    const productsCol = collection(db, "products"); 
    const productSnapshot = await getDocs(productsCol);
    
    const productList = productSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        nome: data.nome || "Produto sem nome",
        preco: data.preco || 0,
        // Se imagemCapa não existir, usa a primeira da galeria ou uma imagem padrão
        imagemCapa: data.imagemCapa || (data.galeria && data.galeria[0]) || "caminho/para/placeholder.png",
        // Garante que galeria sempre seja um array para não quebrar o código do parceiro
        galeria: data.galeria || [], 
        descricao: data.descricao || "",
        estoque: data.estoque || 0,
        categoria: data.categoria || "Geral"
      };
    });
    
    return productList;
  } catch (error) {
    console.error("Erro ao buscar produtos na Hygge Games:", error);
    return [];
  }
};