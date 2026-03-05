const {onRequest} = require("firebase-functions/v2/https");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {MercadoPagoConfig, Preference, Payment} = require("mercadopago");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

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

/**
 * 4. FUNÇÃO: Solicitar redefinição de senha
 * Gera um link de redefinição via Firebase Auth Admin SDK
 * e cria um documento na coleção "mail" com o template de e-mail.
 */
exports.solicitarRedefinicaoSenha = onRequest({cors: true}, async (req, res) => {
  // Cabeçalhos básicos de CORS para permitir chamadas do localhost e Hosting
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  // Responde rapidamente às requisições de preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }

  try {
    const {email} = req.body || {};
    if (!email || typeof email !== "string") {
      res.status(400).json({error: "E-mail é obrigatório"});
      return;
    }

    let link;
    try {
      const actionCodeSettings = {
        url: "https://e-commerce-hygge.firebaseapp.com/reset-password.html",
        handleCodeInApp: true,
      };
      link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    } catch (err) {
      // Não revela se o usuário existe ou não.
      logger.error("Erro ao gerar link de redefinição de senha:", err);
      res.status(200).json({ok: true});
      return;
    }

    let resetLink = "https://e-commerce-hygge.firebaseapp.com/reset-password.html";
    try {
      const urlObj = new URL(link);
      const oobCode = urlObj.searchParams.get("oobCode");
      if (oobCode) {
        resetLink = `${resetLink}?oobCode=${encodeURIComponent(oobCode)}`;
      }
    } catch (err) {
      logger.error("Não foi possível extrair o oobCode do link de redefinição:", err);
    }

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #FF7A00;">Redefinir senha da sua conta Hygge Games</h2>
        <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
        <p>Clique no botão abaixo para criar uma nova senha:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#00966C;color:#fff;text-decoration:none;border-radius:999px;font-weight:bold;">Redefinir senha</a>
        </p>
        <p>Se você não fez esse pedido, pode ignorar este e-mail.</p>
        <br>
        <p>Um abraço caloroso,<br><strong>Equipe Hygge Games</strong></p>
      </div>
    `;

    await db.collection("mail").add({
      to: email,
      message: {
        subject: "Redefinir senha da sua conta Hygge Games",
        html,
      },
    });

    res.status(200).json({ok: true});
  } catch (error) {
    logger.error("Erro ao enfileirar e-mail de redefinição de senha:", error);
    res.status(500).json({error: "Erro ao solicitar redefinição de senha"});
  }
});

// firebase functions:config:set hygge.mp_key="SEU_TOKEN_MP"
// firebase functions:config:set hygge.bling_key="SEU_TOKEN_BLING"
// firebase deploy --only functions



//Checkout: https://us-central1-e-commerce-hygge.cloudfunctions.net/criarPreferencia

//Frete: https://us-central1-e-commerce-hygge.cloudfunctions.net/calcularFrete

//Webhook (Para o Mercado Pago): https://us-central1-e-commerce-hygge.cloudfunctions.net/notificacaoPagamento