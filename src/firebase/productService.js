import { db } from "./firebaseConfig"; 
import { collection, getDocs } from "firebase/firestore";

export const getProducts = async () => {
  try {
    const productsCol = collection(db, "products"); 
    const productSnapshot = await getDocs(productsCol);
    
    const productList = productSnapshot.docs.map(doc => {
      const data = doc.data();

      const descricaoCompleta =
        data.descricaoCompleta ??
        data.descricao_completa ??
        data.fullDescription ??
        data.descricaoLonga ??
        data.descricao_longa ??
        [];

      return {
        id: doc.id,
        nome: data.nome || "Produto sem nome",
        preco: 119,
        imagemCapa: data.imagemCapa || "",
        imagemUrl: data.imagemCapa || "",
        galeria: Array.isArray(data.galeria) ? data.galeria : [],
        descricao: data.descricao || "",
        descricaoCurta: data.descricaoCurta || data.descricao_curta || "",
        descricaoCompleta,
        estoque: data.estoque || 0,
        categoria: data.categoria || "Geral",
        especificacoesJogo: data.especificacoesJogo || data.especificacoes_jogo || data.gameSpecs || null,
        especificacoesTecnicas: data.especificacoesTecnicas || data.especificacoes_tecnicas || data.techSpecs || null,
      };
    });
    
    return productList;
  } catch (error) {
    console.error("Erro ao buscar produtos na Hygge Games:", error);
    return [];
  }
};