const {onRequest} = require("firebase-functions/v2/https");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {MercadoPagoConfig, Preference, Payment} = require("mercadopago");
const axios = require("axios");

admin.initializeApp();

/**
 * CONFIGURAÇÃO DE PARÂMETROS DE AMBIENTE
 * O Firebase vai procurar por essas chaves no ambiente.
 */
const mpKeyParam = defineString("MP_KEY", {default: "TESTE"});
const blingKeyParam = defineString("BLING_KEY", {default: "TESTE"});

// Inicializa o cliente do Mercado Pago usando .value()
const mpClient = new MercadoPagoConfig({
  accessToken: mpKeyParam.value(),
});

/**
 * 1. FUNÇÃO: Criar Preferência (Checkout)
 */
exports.criarPreferencia = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }

  try {
    const {itens, usuarioId} = req.body;
    const preference = new Preference(mpClient);

    const body = {
      items: itens.map((item) => ({
        id: item.id,
        title: item.nome,
        unit_price: Number(item.preco),
        quantity: Number(item.quantidade),
        currency_id: "BRL",
      })),
      back_urls: {
        success: "https://e-commerce-hygge.firebaseapp.com/perfil.html",
        failure: "https://e-commerce-hygge.firebaseapp.com/carrinho.html",
        pending: "https://e-commerce-hygge.firebaseapp.com/pendente.html",
      },
      auto_return: "approved",
      external_reference: usuarioId,
    };

    const response = await preference.create({body});
    res.json({id: response.id, init_point: response.init_point});
  } catch (error) {
    logger.error("Erro ao criar preferência no Mercado Pago:", error);
    res.status(500).json({error: "Erro ao gerar pagamento"});
  }
});

/**
 * 2. FUNÇÃO: Cálculo de Frete
 */
exports.calcularFrete = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }

  try {
    const {cepDestino, itens} = req.body;
    logger.info(`Calculando frete para o destino: ${cepDestino}`);

    const qte = itens.reduce((acc, item) => acc + item.quantidade, 0);
    const valorFrete = 15.00 + (qte * 2);

    res.json({
      valor: valorFrete,
      prazo: "5-8 dias úteis",
      servico: "PAC",
    });
  } catch (error) {
    logger.error("Erro no cálculo de frete:", error);
    res.status(500).json({error: "Erro ao processar frete"});
  }
});

/**
 * 3. FUNÇÃO: Webhook de Notificação
 */
exports.notificacaoPagamento = onRequest({cors: true}, async (req, res) => {
  try {
    const {action, data} = req.body;

    if (action === "payment.created" || action === "payment.updated") {
      const payment = new Payment(mpClient);
      const paymentDetails = await payment.get({id: data.id});

      if (paymentDetails.status === "approved") {
        const uid = paymentDetails.external_reference;
        logger.info(`Pagamento aprovado para o UID: ${uid}`);
        await enviarParaBling(paymentDetails);
      }
    }
    res.status(200).send("OK");
  } catch (error) {
    logger.error("Erro no processamento do Webhook:", error);
    res.status(500).send("Erro de Notificação");
  }
});

/**
 * FUNÇÃO AUXILIAR: Enviar Pedido ao Bling
 * @param {object} dadosPagamento - Objeto de dados vindo do Mercado Pago.
 */
async function enviarParaBling(dadosPagamento) {
    const urlBling = "https://bling.com.br/Api/v2/pedido/json/";
  
    // Mapeia os itens do Mercado Pago para o formato do Bling
    // O MP chama de 'additional_info.items', o Bling espera 'item'
    const itensMapeados = dadosPagamento.additional_info.items.map((item) => ({
      item: {
        codigo: item.id,
        descricao: item.title,
        un: "un",
        qtde: item.quantity,
        vlr_unit: item.unit_price,
      },
    }));
  
    const pedidoBling = {
      numero: dadosPagamento.id,
      data: new Date().toLocaleDateString("pt-BR"),
      cliente: {nome: "Cliente Hygge Games"},
      itens: itensMapeados, // Agora a lista está preenchida!
    };
  
    try {
      const xmlData = encodeURIComponent(JSON.stringify(pedidoBling));
      const finalUrl = `${urlBling}&apikey=${blingKeyParam.value()}` +
                       `&xml=${xmlData}`;
      await axios.post(finalUrl);
      logger.info("Pedido registrado no Bling com sucesso.");
    } catch (err) {
      logger.error("Falha na integração com o Bling:", err.message);
    }
  }

// firebase functions:config:set hygge.mp_key="SEU_TOKEN_MP"
// firebase functions:config:set hygge.bling_key="SEU_TOKEN_BLING"
// firebase deploy --only functions



//Checkout: https://us-central1-e-commerce-hygge.cloudfunctions.net/criarPreferencia

//Frete: https://us-central1-e-commerce-hygge.cloudfunctions.net/calcularFrete

//Webhook (Para o Mercado Pago): https://us-central1-e-commerce-hygge.cloudfunctions.net/notificacaoPagamento