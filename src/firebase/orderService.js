import { db } from "./firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * CAMPOS REGISTRADOS NO PEDIDO (Firestore):
 * - userId: String (UID do cliente que comprou)
 * - data_pedido: Timestamp (Gerado pelo servidor)
 * - valor_total: Number (Soma total da compra)
 * - status_pagamento: String (ex: "approved", "pending")
 * - metodo_pagamento: String (ex: "credit_card", "pix")
 * - mercadopago_id: String (ID oficial da transação no MP)
 * * ESTRUTURA DO ARRAY 'itens':
 * - id_produto: String (ID do documento em 'products')
 * - nome: String (Nome do jogo no momento da compra)
 * - preco_unitario: Number (Preço praticado na venda)
 * - quantidade: Number (Qtd comprada)
 */

export const createOrder = async (orderData) => {
  try {
    const ordersCol = collection(db, "orders");

    // Adiciona o documento com ID automático
    const docRef = await addDoc(ordersCol, {
      userId: orderData.userId,
      mercadopago_id: orderData.mercadopagoId,
      status_pagamento: orderData.status || "pending",
      metodo_pagamento: orderData.metodo,
      valor_total: orderData.total,
      data_pedido: serverTimestamp(), // Usa o horário do servidor do Google
      itens: orderData.itens.map(item => ({
        id_produto: item.id,
        nome: item.nome,
        preco_unitario: item.preco,
        quantidade: item.quantidade
      }))
    });

    return { success: true, orderId: docRef.id };
  } catch (error) {
    console.error("Erro ao registrar pedido na Hygge Games:", error);
    return { success: false, error: error.message };
  }
};