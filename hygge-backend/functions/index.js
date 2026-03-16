const {onRequest} = require("firebase-functions/v2/https");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {MercadoPagoConfig, Preference, Payment} = require("mercadopago");
const axios = require("axios");
const {generateEmailTemplate} = require("./emailTemplates.cjs");

/**
 * CONFIGURAÇÃO DE PARÂMETROS DE AMBIENTE
 */
const mpKeyParam = defineString("MP_KEY", {default: "TESTE"});
const blingKeyParam = defineString("BLING_KEY", {default: "TESTE"});
const melhorEnvioToken = defineString("MELHOR_ENVIO_TOKEN", {default: "TESTE"});

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO E E-MAIL ---

function formatBRL(value) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOrderItemsTable(items) {
  const rows = (Array.isArray(items) ? items : []).map((item) => {
    const nome = escapeHtml(item?.nome || item?.title || "Produto");
    const qtd = Number(item?.quantidade ?? item?.quantity ?? 1);
    const preco = Number(item?.preco ?? item?.unit_price ?? 0);
    return `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #e2dcd6; font-family: Inter, Arial, sans-serif; font-size:14px; line-height:20px; color:#222;">${nome}</td>
        <td align="center" style="padding:10px 12px; border-bottom:1px solid #e2dcd6; font-family: Inter, Arial, sans-serif; font-size:14px; line-height:20px; color:#222; white-space:nowrap;">${qtd}</td>
        <td align="right" style="padding:10px 12px; border-bottom:1px solid #e2dcd6; font-family: Inter, Arial, sans-serif; font-size:14px; line-height:20px; color:#222; white-space:nowrap;">${formatBRL(preco)}</td>
      </tr>`;
  });

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border:1px solid #e2dcd6; border-radius:14px; overflow:hidden; background:#ffffff;">
      <tr>
        <td style="padding:10px 12px; background:#f4f1ed; font-family: Inter, Arial, sans-serif; font-size:13px; line-height:18px; color:#111; font-weight:700;">Produto</td>
        <td align="center" style="padding:10px 12px; background:#f4f1ed; font-family: Inter, Arial, sans-serif; font-size:13px; line-height:18px; color:#111; font-weight:700; white-space:nowrap;">Qtd</td>
        <td align="right" style="padding:10px 12px; background:#f4f1ed; font-family: Inter, Arial, sans-serif; font-size:13px; line-height:18px; color:#111; font-weight:700; white-space:nowrap;">Preço</td>
      </tr>
      ${rows.join("\n")}
    </table>`;
}

/**
 * Enfileira e-mail de confirmação de pedido na coleção "mail".
 */
async function sendOrderConfirmationEmail({
  email,
  orderNumber,
  items,
  total,
  trackingUrl,
} = {}) {
  if (!email) return;

  const safeOrderNumber = escapeHtml(orderNumber || "-");
  const contentHtml = `
    <div style="font-family: Inter, Arial, sans-serif; color:#222;">
      <div style="margin:0 0 10px 0; font-size:14px; line-height:20px; color:#6e6e6e; text-align:center;">
        Pedido: <strong style="color:#111;">${safeOrderNumber}</strong>
      </div>
      ${renderOrderItemsTable(items)}
      <div style="height:14px; line-height:14px;">&nbsp;</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
        <tr>
          <td style="font-family: Inter, Arial, sans-serif; font-size:14px; line-height:20px; color:#111; font-weight:700;">Total</td>
          <td align="right" style="font-family: Inter, Arial, sans-serif; font-size:14px; line-height:20px; color:#111; font-weight:700; white-space:nowrap;">${formatBRL(total)}</td>
        </tr>
      </table>
    </div>`;

  const html = generateEmailTemplate({
    title: "Pedido confirmado 🎲",
    message: "Agradecemos por comprar na Hygge Games. Seu pedido foi recebido e está sendo preparado.",
    buttonText: "Acompanhar pedido",
    buttonLink: trackingUrl || "https://e-commerce-hygge.firebaseapp.com/perfil.html",
    footerText: "Hygge Games • Obrigado por comprar com a gente.",
    contentHtml,
  });

  await db.collection("mail").add({
    to: email,
    message: {
      subject: "Pedido confirmado 🎲",
      html,
    },
  });
}

function normalizeItemsForMatch(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => ({
      id: String(item?.id ?? ""),
      quantity: Number(item?.quantity ?? item?.quantidade ?? 0),
      unit_price: Number(item?.unit_price ?? item?.preco ?? 0),
    }))
    .filter((x) => x.id && Number.isFinite(x.quantity) && x.quantity > 0);
}

function scoreDraftAgainstPayment(draft, paymentTotal, paymentItems) {
  const draftTotal = Number(draft?.total ?? draft?.valor_total ?? 0);
  const totalDiff = Math.abs(draftTotal - Number(paymentTotal || 0));

  const draftItems = normalizeItemsForMatch(draft?.produtos || draft?.itens);
  const payItems = normalizeItemsForMatch(paymentItems);

  const draftMap = new Map(draftItems.map((i) => [i.id, i.quantity]));
  const payMap = new Map(payItems.map((i) => [i.id, i.quantity]));

  let mismatch = 0;
  const allIds = new Set([...draftMap.keys(), ...payMap.keys()]);
  for (const id of allIds) {
    const a = draftMap.get(id) || 0;
    const b = payMap.get(id) || 0;
    mismatch += Math.abs(a - b);
  }

  return totalDiff * 1000 + mismatch;
}

async function findBestDraftForPayment({userId, paymentTotal, paymentItems}) {
  if (!userId) return null;

  try {
    const snap = await db
      .collection("orders_draft")
      .where("userId", "==", userId)
      .limit(20)
      .get();

    if (snap.empty) return null;

    let best = null;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const score = scoreDraftAgainstPayment(data, paymentTotal, paymentItems);
      if (!best || score < best.score) {
        best = {id: doc.id, ref: doc.ref, data, score};
      }
    });

    if (best && best.score > 5000) return null;
    return best;
  } catch (err) {
    logger.error("Falha ao buscar orders_draft para finalizar pedido:", err);
    return null;
  }
}

function mapItensFromDraftOrPayment(draft, paymentItems) {
  const draftProdutos = Array.isArray(draft?.produtos) ? draft.produtos : null;
  if (draftProdutos && draftProdutos.length) {
    return draftProdutos.map((p) => ({
      id_produto: String(p?.id ?? ""),
      nome: String(p?.nome ?? "Produto"),
      preco_unitario: Number(p?.preco ?? 0),
      quantidade: Number(p?.quantidade ?? 1),
    }));
  }

  const items = Array.isArray(paymentItems) ? paymentItems : [];
  return items.map((i) => ({
    id_produto: String(i?.id ?? ""),
    nome: String(i?.title ?? "Produto"),
    preco_unitario: Number(i?.unit_price ?? 0),
    quantidade: Number(i?.quantity ?? 1),
  }));
}

async function finalizeOrderInFirestore({
  paymentId,
  userId,
  paymentDetails,
  paymentItems,
  paymentTotal,
  payerEmail,
}) {
  if (!paymentId) return;
  const orderRef = db.collection("orders").doc(String(paymentId));

  const bestDraft = await findBestDraftForPayment({
    userId,
    paymentTotal,
    paymentItems,
  });

  const metodo =
    paymentDetails?.payment_method_id ||
    paymentDetails?.payment_type_id ||
    paymentDetails?.payment_method?.id ||
    null;

  const effectiveEmail = bestDraft?.data?.email || payerEmail || null;

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists) return;

    const draft = bestDraft?.data || null;

    tx.set(orderRef, {
      userId: userId || "guest",
      mercadopago_id: String(paymentId),
      status_pagamento: "approved",
      metodo_pagamento: metodo,
      valor_total: Number(paymentTotal || 0),
      data_pedido: admin.firestore.FieldValue.serverTimestamp(),
      itens: mapItensFromDraftOrPayment(draft, paymentItems),
      cliente: {
        nome: draft?.nome || null,
        email: effectiveEmail,
        telefone: draft?.telefone || null,
      },
      entrega: {
        endereco: draft?.endereco || null,
        numero: draft?.numero || null,
        complemento: draft?.complemento || null,
        cidade: draft?.cidade || null,
        estado: draft?.estado || null,
        cep: draft?.cep || null,
        metodoEntrega: draft?.metodoEntrega || null,
      },
      valores: {
        subtotal: Number(draft?.subtotal ?? 0),
        frete: Number(draft?.frete ?? 0),
        cupom: draft?.cupom ?? null,
        total: Number(paymentTotal || 0),
      },
    });
  });

  if (bestDraft?.ref) {
    try {
      await bestDraft.ref.set(
        {
          status_pagamento: "approved",
          mercadopago_id: String(paymentId),
          finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
          finalizedOrderId: String(paymentId),
        },
        {merge: true},
      );
    } catch (err) {
      logger.error("Falha ao marcar orders_draft como finalizado:", err);
    }
  }

  return {email: effectiveEmail, draftId: bestDraft?.id || null};
}

admin.initializeApp();
const db = admin.firestore();

// Inicializa o cliente do Mercado Pago usando .value()
const mpClient = new MercadoPagoConfig({
  accessToken: mpKeyParam.value(),
});

/**
 * 1. FUNÇÃO: Criar Preferência (Checkout Mercado Pago)
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
        success: "https://e-commerce-hygge.firebaseapp.com/obrigado.html",
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
 * 2. FUNÇÃO: Cálculo de Frete (MELHOR ENVIO)
 */
exports.calcularFrete = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");
  
  try {
    const {cepDestino, itens} = req.body;
    
    // Monta os dados para o Melhor Envio com base nos itens do carrinho
    const payload = {
      from: {postal_code: "06790030"}, // CEP de Origem da Hygge Games
      to: {postal_code: cepDestino.replace(/\D/g, "")},
      products: itens.map((item) => ({
        id: item.id,
        width: 15,
        height: 6,
        length: 15,
        weight: 0.35, // Peso estimado por jogo
        insurance_value: Number(item.preco),
        quantity: item.quantidade,
      })),
      services: "1,2,17" // 1=PAC, 2=SEDEX, 17=Total Express Standard
    };

    const response = await axios.post(
      "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
      payload,
      {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${melhorEnvioToken.value()}`,
          "User-Agent": "HyggeGames (contato@hyggegames.com.br)",
        },
      }
    );

    // IDs Melhor Envio: 1=Correios PAC, 2=Correios SEDEX, 3=Jadlog .Package, 11=Total Express
    // Filtra apenas os serviços disponíveis e com preço válido
    const opcoes = response.data
      .filter((s) => s.price != null && !s.error)
      .map((s) => ({
        id: s.id,
        nome: s.name,
        valor: Number(s.price),
        prazo: s.delivery_range?.max ? `${s.delivery_range.max} dias úteis` : '',
      }))
      .sort((a, b) => a.valor - b.valor);

    res.json(opcoes);
  } catch (error) {
    logger.error("Erro no cálculo de frete Melhor Envio:", error.message);
    res.status(500).json({error: "Erro ao calcular frete oficial"});
  }
});


/**
 * 3. FUNÇÃO: Webhook de Notificação Mercado Pago
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

        const paymentId = String(paymentDetails.id);
        const payerEmail =
          paymentDetails?.payer?.email ||
          paymentDetails?.additional_info?.payer?.email ||
          paymentDetails?.payer?.payer_email ||
          null;

        const items = paymentDetails?.additional_info?.items || [];
        const total =
          paymentDetails?.transaction_amount ??
          items.reduce(
            (acc, item) => acc + Number(item?.unit_price || 0) * Number(item?.quantity || 0),
            0,
          );

        const finalized = await finalizeOrderInFirestore({
          paymentId,
          userId: uid || "guest",
          paymentDetails,
          paymentItems: items,
          paymentTotal: total,
          payerEmail,
        });

        const emailTo = payerEmail || finalized?.email || null;

        const markerRef = db.collection("mp_payment_processed").doc(paymentId);
        const shouldSendEmail = await db.runTransaction(async (tx) => {
          const snap = await tx.get(markerRef);
          const state = snap.exists ? snap.get("orderEmailState") : null;
          if (state === "sent" || state === "processing") return false;

          tx.set(
            markerRef,
            {
              orderEmailState: "processing",
              orderEmailPaymentId: paymentId,
              orderEmailUid: uid || null,
              orderEmailTo: emailTo,
              orderEmailStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {merge: true},
          );
          return true;
        });

        if (shouldSendEmail) {
          try {
            await sendOrderConfirmationEmail({
              email: emailTo,
              orderNumber: paymentId,
              items,
              total,
              trackingUrl: "https://e-commerce-hygge.firebaseapp.com/perfil.html",
            });

            await markerRef.set(
              {
                orderEmailState: "sent",
                orderEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              {merge: true},
            );
          } catch (err) {
            await markerRef.set(
              {
                orderEmailState: "error",
                orderEmailErrorAt: admin.firestore.FieldValue.serverTimestamp(),
                orderEmailErrorMessage: err?.message || String(err),
              },
              {merge: true},
            );
            throw err;
          }
        }
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
 * 4. Bling Auxiliar
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
 * 5. FUNÇÃO: Solicitar redefinição de senha
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

    const html = generateEmailTemplate({
      title: "Recuperação de senha",
      message: "Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para continuar.",
      buttonText: "Redefinir senha",
      buttonLink: resetLink,
      footerText: "Hygge Games • Se você não solicitou, ignore este e-mail.",
    });

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