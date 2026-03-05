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
  try {
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

    if (data.init_point) {
      // Redireciona o usuário para a página oficial do Mercado Pago
      window.location.href = data.init_point;
    } else {
      console.error("Link de pagamento não recebido:", data);
      alert("Houve um problema ao gerar o pagamento. Tente novamente.");
    }
  } catch (error) {
    console.error("Erro na comunicação com o Checkout:", error);
    alert("Erro de conexão. Verifique sua internet ou tente mais tarde.");
  }
};

/**
 * Solicita o cálculo de frete baseado no CEP e itens selecionados.
 * @param {string} cepDestino - CEP do cliente
 * @param {Array} itens - Array de produtos para cálculo de volume
 * @returns {Promise<Object>} - Retorna {valor, prazo, servico}
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
    return resultado; // Ex: { valor: 25.00, prazo: "5-8 dias úteis", servico: "PAC" }
  } catch (error) {
    console.error("Erro ao obter frete:", error);
    return {
      valor: 0,
      erro: true,
      mensagem: "Não foi possível calcular o frete agora.",
    };
  }
};