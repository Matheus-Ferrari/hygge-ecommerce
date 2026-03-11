/**
 * checkoutService.js
 * Centraliza as chamadas para as Cloud Functions da Hygge Games.
 */

// URLs oficiais geradas no deploy do Firebase em us-central1
const API_BASE_URL = "https://us-central1-e-commerce-hygge.cloudfunctions.net";

/**
 * Envia os itens do carrinho para gerar o link de pagamento no Mercado Pago.
 * @param {Array} itens - Lista de objetos [{id, nome, preco, quantidade}]
 * @param {string} usuarioId - O UID do usuário vindo do Firebase Auth
 */
export const iniciarPagamentoMP = async (itens, usuarioId) => {
  const response = await fetch(`${API_BASE_URL}/criarPreferencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      itens: itens,
      usuarioId: usuarioId,
    }),
  });

  if (!response.ok) {
    throw new Error("Erro ao processar o checkout no servidor.");
  }

  const data = await response.json();
  return data;
};

/**
 * Solicita o cálculo de frete baseado no CEP e itens selecionados.
 * @param {string} cepDestino - CEP do cliente
 * @param {Array} itens - Array de produtos para cálculo de volume
 * @returns {Promise<Array|Object>} - Retorna uma lista de opções [{id, nome, valor, prazo}]
 *                                  ou {erro:true, mensagem:string} em caso de falha.
 */
export const obterCalculoFrete = async (cepDestino, itens) => {
  try {
    const response = await fetch(`${API_BASE_URL}/calcularFrete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cepDestino: cepDestino,
        itens: itens,
      }),
    });

    if (!response.ok) {
      throw new Error("Erro ao calcular frete.");
    }

    const resultado = await response.json();

    // Novo formato esperado: Array de opções
    if (Array.isArray(resultado)) return resultado;

    // Alguns backends embrulham em uma propriedade
    const nested = resultado?.opcoes || resultado?.options || resultado?.resultados;
    if (Array.isArray(nested)) return nested;

    // Compatibilidade com o formato antigo (objeto único)
    if (resultado && typeof resultado === 'object' && 'valor' in resultado) {
      return [
        {
          id: resultado?.id || resultado?.servico || 1,
          nome: resultado?.nome || (resultado?.servico ? `Correios ${resultado.servico}` : 'Frete'),
          valor: Number(resultado?.valor || 0),
          prazo: String(resultado?.prazo || ''),
        },
      ];
    }

    // Formato inesperado
    return {
      erro: true,
      mensagem: 'Resposta inválida do servidor de frete.',
    };
  } catch (error) {
    console.error("Erro ao obter frete:", error);
    return {
      valor: 0,
      erro: true,
      mensagem: "Não foi possível calcular o frete agora.",
    };
  }
};