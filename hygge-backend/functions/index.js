const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {MercadoPagoConfig, Preference, Payment} = require("mercadopago");
const axios = require("axios");
const {generateEmailTemplate} = require("./emailTemplates.cjs");

/**
 * SECRETS (Google Cloud Secret Manager)
 * Para configurar no deploy: firebase functions:secrets:set NOME_DO_SECRET
 * Para desenvolvimento local: crie hygge-backend/functions/.secret.local
 */
const mpKeyParam = defineSecret("MP_KEY");
const blingClientId = defineSecret("BLING_CLIENT_ID");
const blingClientSecret = defineSecret("BLING_CLIENT_SECRET");
const melhorEnvioToken = defineSecret("MELHOR_ENVIO_TOKEN");
const mpWebhookSecret = defineSecret("MP_WEBHOOK_SECRET");

/**
 * ORIGENS PERMITIDAS (CORS)
 */
const ALLOWED_ORIGINS = [
  "https://hyggegames.com.br",
  "https://e-commerce-hygge.web.app",
  "https://e-commerce-hygge.firebaseapp.com",
];

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Mercado Pago.
 * Referência: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
function verificarAssinaturaMP(req, secret) {
  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];

  if (!xSignature || !xRequestId) return false;

  const parts = {};
  xSignature.split(",").forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) return;
    parts[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
  });

  if (!parts.ts || !parts.v1) return false;

  const dataId = req.body?.data?.id;
  if (!dataId) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(parts.v1, "hex");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

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
    buttonLink: trackingUrl || "https://hyggegames.com.br/perfil",
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

/**
 * 1. FUNÇÃO: Criar Preferência (Checkout Mercado Pago)
 */
exports.criarPreferencia = onRequest({cors: ALLOWED_ORIGINS, secrets: [mpKeyParam]}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }

  try {
    const {itens, usuarioId, frete, cliente, dadosEntrega} = req.body;

    if (!usuarioId) {
      res.status(400).json({error: "usuarioId é obrigatório"});
      return;
    }

    const docId = String(usuarioId);
    const draftRef = admin.firestore().collection("orders_draft").doc(docId);

    await draftRef.set({
      userId: docId,
      cpf: cliente?.cpf || null,
      cliente: {
        ...cliente,
        cpf: cliente?.cpf || null,
      },
      email: cliente?.email || null,
      nome: cliente?.nome || "Cliente",
      telefone: cliente?.telefone || null,
      produtos: itens,
      subtotal: itens.reduce((acc, i) => acc + (Number(i.preco) * Number(i.quantidade)), 0),
      frete: Number(frete || 0),
      total: itens.reduce((acc, i) => acc + (Number(i.preco) * Number(i.quantidade)), 0) + Number(frete || 0),
      dadosEntrega: {
        endereco: dadosEntrega?.endereco || null,
        numero: dadosEntrega?.numero || null,
        complemento: dadosEntrega?.complemento || "",
        cidade: dadosEntrega?.cidade || null,
        estado: dadosEntrega?.estado || null,
        cep: dadosEntrega?.cep || null
      },
      status_pagamento: "pending",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const mpClient = new MercadoPagoConfig({ accessToken: mpKeyParam.value() });
    const preference = new Preference(mpClient);

    const mpItems = itens.map((item) => ({
      id: String(item.id),
      title: String(item.nome),
      unit_price: Number(item.preco),
      quantity: Number(item.quantidade),
      currency_id: "BRL",
    }));

    if (Number(frete) > 0) {
      mpItems.push({
        id: "FRETE",
        title: "Custo de Entrega",
        unit_price: Number(frete),
        quantity: 1,
        currency_id: "BRL",
      });
    }

    const body = {
      items: mpItems,
      back_urls: {
        success: "https://hyggegames.com.br/obrigado",
        failure: "https://hyggegames.com.br/carrinho",
        pending: "https://hyggegames.com.br/pendente",
      },
      auto_return: "all",
      external_reference: docId,
      payment_methods: { installments: 12 },
    };

    const response = await preference.create({body});
    res.json({id: response.id, init_point: response.init_point});

  } catch (error) {
    logger.error("Erro ao criar preferência:", error);
    res.status(500).json({error: "Erro interno ao gerar pagamento"});
  }
});

/**
 * 2. FUNÇÃO: Cálculo de Frete (MELHOR ENVIO)
 */
exports.calcularFrete = onRequest({cors: ALLOWED_ORIGINS, secrets: [melhorEnvioToken]}, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");
  
  try {
    const {cepDestino, itens} = req.body;
    
    const payload = {
      from: {postal_code: "06790030"}, 
      to: {postal_code: cepDestino.replace(/\D/g, "")},
      products: itens.map((item) => ({
        id: item.id,
        width: 15,
        height: 6,
        length: 15,
        weight: 0.35, 
        insurance_value: Number(item.preco),
        quantity: item.quantidade,
      }))
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

    const opcoes = response.data
      .filter((s) => {
        if (s.price == null || s.error) return false;
        const nomeEmpresa = String(s.company?.name || "").toLowerCase();
        if (nomeEmpresa.includes("total express")) return true;
        return false;
      })
      .map((s) => {
        const nomeEmpresaOriginal = s.company?.name || "";
        let nomeExibicao = s.name;
        if (nomeEmpresaOriginal.toLowerCase().includes("total express")) {
          nomeExibicao = `Total Express - ${s.name}`;
        }
        return {
          id: s.id,
          nome: nomeExibicao,
          valor: Number(s.price),
          prazo: s.delivery_range?.max ? `${s.delivery_range.max} dias úteis` : '',
        };
      })
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
exports.notificacaoPagamento = onRequest(
  {cors: true, secrets: [mpKeyParam, mpWebhookSecret, blingClientId, blingClientSecret]},
  async (req, res) => {
  try {
    const webhookSec = mpWebhookSecret.value();
    if (webhookSec && !verificarAssinaturaMP(req, webhookSec)) {
      logger.warn("[Webhook] Assinatura inválida rejeitada.", {ip: req.ip});
      return res.status(403).send("Forbidden");
    }

    const {action, data} = req.body;
    logger.info("[Webhook] Notificação recebida.", {action, paymentDataId: data?.id});

    if (action === "payment.created" || action === "payment.updated") {
      const clientMP = new MercadoPagoConfig({accessToken: mpKeyParam.value()});
      const payment = new Payment(clientMP);
      const paymentDetails = await payment.get({id: data.id});

      if (paymentDetails.status === "approved") {
        const uid = paymentDetails.external_reference;
        const paymentId = String(paymentDetails.id);

        const webhookMarkerRef = db.collection("mp_payment_processed").doc(paymentId);
        const isFirstTime = await db.runTransaction(async (tx) => {
          const snap = await tx.get(webhookMarkerRef);
          if (snap.exists && snap.get("processedForBling")) return false;
          tx.set(webhookMarkerRef, { processedForBling: true }, {merge: true});
          return true;
        });

        if (!isFirstTime) {
          logger.info(`[Webhook] Pagamento ${paymentId} já processado. Ignorando duplicata.`);
          return res.status(200).send("OK");
        }

        logger.info("[Webhook] Pagamento aprovado.", {
          uid, paymentId, externalReference: uid,
          paymentMethod: paymentDetails?.payment_method_id,
          paymentType: paymentDetails?.payment_type_id,
        });

        let draftData = null;
        if (uid) {
          try {
            const draftSnap = await db.collection("orders_draft").doc(String(uid)).get();
            draftData = draftSnap.exists ? (draftSnap.data() || {}) : null;
          } catch (err) {
            logger.warn("[Webhook] Falha ao buscar orders_draft.", { uid: String(uid) });
          }
        }

        if (uid) {
          try {
            await db.collection("orders_draft").doc(String(uid)).set({
              status_pagamento: "approved",
              mercadopago_id: paymentId,
              payment_id: paymentId,
              external_reference: String(uid),
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, {merge: true});
          } catch (errDraft) {}
        }

        const emailCru = draftData?.email || draftData?.cliente?.email || paymentDetails?.payer?.email || paymentDetails?.additional_info?.payer?.email || "";
        const payerEmail = String(emailCru).trim();
        const items = paymentDetails?.additional_info?.items || [];
        const total = paymentDetails?.transaction_amount ?? 0;

        const finalized = await finalizeOrderInFirestore({
          paymentId, userId: uid || "guest", paymentDetails, paymentItems: items, paymentTotal: total, payerEmail,
        });

        const emailFinal = String(payerEmail || finalized?.email || "").trim() || null;

        if (emailFinal && emailFinal.includes('@')) {
          try {
            const markerRef = db.collection("mp_payment_processed").doc(paymentId);
            const shouldSendEmail = await db.runTransaction(async (tx) => {
              const snap = await tx.get(markerRef);
              if (snap.exists && (snap.get("orderEmailState") === "sent" || snap.get("orderEmailState") === "processing")) return false;
              tx.set(markerRef, { orderEmailState: "processing", orderEmailTo: emailFinal }, {merge: true});
              return true;
            });

            if (shouldSendEmail) {
              await sendOrderConfirmationEmail({
                email: emailFinal, orderNumber: paymentId, items, total,
                trackingUrl: "https://hyggegames.com.br/perfil",
              });
              await markerRef.set({ orderEmailState: "sent" }, {merge: true});
            }
          } catch (e) {
            logger.error("Erro ao processar fila de e-mail:", e.message);
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
 * Gera NF-e vinculada ao pedido de venda e envia para a Sefaz
 * 1. POST /pedidos/vendas/{idPedidoVenda}/gerar-nfe  → cria a NF vinculada
 * 2. POST /nfe/{idNotaFiscal}/enviar                 → envia para a Sefaz
 */
async function gerarNotaFiscalBling(idDoPedidoBling) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const token = await obterTokenBling();
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 1. Gera a NF vinculada ao pedido
    const urlGerar = `https://api.bling.com.br/Api/v3/pedidos/vendas/${idDoPedidoBling}/gerar-nfe`;
    logger.info(`Gerando NF-e para pedido ${idDoPedidoBling} via ${urlGerar}`);

    const nfResp = await axios.post(urlGerar, {}, { headers });

    // Log completo da resposta para identificar a estrutura
    logger.info(`Resposta gerar-nfe:`, JSON.stringify(nfResp.data));

    // Tenta extrair o ID da NF de vários caminhos possíveis
    const idNF = nfResp.data?.data?.id
      || nfResp.data?.data?.idNotaFiscal
      || nfResp.data?.data?.nfe?.id
      || (Array.isArray(nfResp.data?.data) && nfResp.data.data[0]?.id)
      || nfResp.data?.id;

    if (!idNF) {
      logger.warn("ID da NF não encontrado na resposta. Tentando buscar NF pelo pedido...");

      // Fallback: busca a NF mais recente vinculada ao pedido
      await sleep(2000);
      const pedidoResp = await axios.get(
        `https://api.bling.com.br/Api/v3/pedidos/vendas/${idDoPedidoBling}`,
        { headers }
      );
      logger.info(`Dados do pedido:`, JSON.stringify(pedidoResp.data?.data?.notaFiscal || pedidoResp.data?.data?.nfe || "nenhuma NF encontrada"));

      const idNFFallback = pedidoResp.data?.data?.notaFiscal?.id
        || pedidoResp.data?.data?.nfe?.id
        || null;

      if (!idNFFallback) {
        throw new Error("NF gerada mas não foi possível obter o ID para enviar à Sefaz.");
      }

      logger.info(`✅ NF ${idNFFallback} encontrada via GET pedido. Enviando para a Sefaz...`);
      await sleep(1000);
      const urlEnviar = `https://api.bling.com.br/Api/v3/nfe/${idNFFallback}/enviar`;
      await axios.post(urlEnviar, {}, { headers });
      logger.info(`✅ NF ${idNFFallback} enviada para a Sefaz com sucesso!`);
      return idNFFallback;
    }

    logger.info(`✅ NF ${idNF} gerada e vinculada ao pedido ${idDoPedidoBling}`);

    // 2. Aguarda o Bling processar a NF antes de enviar
    await sleep(2000);

    // 3. Envia a NF para a Sefaz
    const urlEnviar = `https://api.bling.com.br/Api/v3/nfe/${idNF}/enviar`;
    logger.info(`Enviando NF ${idNF} para a Sefaz via ${urlEnviar}`);

    await axios.post(urlEnviar, {}, { headers });
    logger.info(`✅ NF ${idNF} enviada para a Sefaz com sucesso!`);

    return idNF;

  } catch (error) {
    logger.error(
      `Falha ao gerar/enviar NF para pedido ${idDoPedidoBling}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * 4a. Bling OAuth2 — Gerenciador de Tokens (auto-refresh)
 */
async function obterTokenBling() {
  const tokenDoc = db.collection("configuracoes").doc("bling_tokens");
  const snap = await tokenDoc.get();

  if (!snap.exists) throw new Error("Tokens do Bling não encontrados.");

  const dados = snap.data();
  const agora = Date.now();
  const expiraEm = dados.expires_at?.toMillis?.() ?? dados.expires_at ?? 0;

  if (dados.access_token && agora < expiraEm - 60000) return dados.access_token;
  if (!dados.refresh_token) throw new Error("Refresh token do Bling ausente.");

  const credentials = Buffer.from(
    `${blingClientId.value()}:${blingClientSecret.value()}`,
  ).toString("base64");

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", dados.refresh_token);

  const resp = await axios.post(
    "https://api.bling.com.br/Api/v3/oauth/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${credentials}` } },
  );

  const novosDados = resp.data;
  const novaExpiracao = Date.now() + (novosDados.expires_in ?? 21600) * 1000;

  await tokenDoc.set({
    access_token: novosDados.access_token,
    refresh_token: novosDados.refresh_token,
    expires_in: novosDados.expires_in,
    expires_at: new Date(novaExpiracao),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return novosDados.access_token;
}

/**
 * 4b. Bling OAuth2 — Callback
 */
exports.callbackBling = onRequest({cors: true, secrets: [blingClientId, blingClientSecret]}, async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Código ausente.");

    const credentials = Buffer.from(
      `${blingClientId.value()}:${blingClientSecret.value()}`,
    ).toString("base64");

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);

    const resp = await axios.post(
      "https://api.bling.com.br/Api/v3/oauth/token",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${credentials}` } },
    );

    const dados = resp.data;
    const expiraEm = Date.now() + (dados.expires_in || 21600) * 1000;

    await db.collection("configuracoes").doc("bling_tokens").set({
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      expires_at: new Date(expiraEm),
      expires_in: dados.expires_in,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("<h1>Bling autorizado com sucesso!</h1>");
  } catch (error) {
    res.status(500).json({erro: error.message});
  }
});

/**
 * Envia o pedido para o Bling V3 com resiliência
 */
async function enviarParaBling(dadosPagamento) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); 
  
  try {
    const token = await obterTokenBling();
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const uid = String(dadosPagamento?.external_reference || "").trim();
    let draftData = {};
    if (uid) {
      try {
        const draftDoc = await db.collection("orders_draft").doc(uid).get();
        draftData = draftDoc.exists ? (draftDoc.data() || {}) : {};
      } catch (e) {
        logger.warn("Não foi possível ler orders_draft para o Bling.");
      }
    }

    const mapaPagamentos = {
      'pix': 3416203, 'credit_card': 3416237, 'bolbradesco': 3359455, 'pec': 3416203
    };
    const mpMetodo = dadosPagamento.payment_method_id; 
    const idFormaBling = mapaPagamentos[mpMetodo] || 3416203;

    const emailContato = String(draftData?.email || draftData?.cliente?.email || dadosPagamento?.payer?.email || "").trim();
    const cpfOriginal = draftData?.cpf || dadosPagamento?.payer?.identification?.number || "";
    const cpfLimpo = String(cpfOriginal).replace(/\D/g, "").trim();

    const nomeCompleto = String(draftData?.nome || draftData?.cliente?.nome || "Cliente Hygge").trim();
    const addrDraft = draftData?.dadosEntrega || {};

    let idDoContato = null;

    if (emailContato) {
      try {
        const buscaEmail = await axios.get(`https://api.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(emailContato)}`, {headers});
        if (buscaEmail.data?.data?.length > 0) idDoContato = buscaEmail.data.data[0].id;
      } catch (e) {}
      await sleep(400);
    }

    if (!idDoContato && cpfLimpo) {
      try {
        const buscaDoc = await axios.get(`https://api.bling.com.br/Api/v3/contatos?numeroDocumento=${encodeURIComponent(cpfLimpo)}`, {headers});
        await sleep(400);
        let lista = Array.isArray(buscaDoc.data?.data) ? buscaDoc.data.data : [];
        if (lista.length === 0) {
          const buscaGeral = await axios.get("https://api.bling.com.br/Api/v3/contatos?criterio=1", {headers});
          await sleep(400);
          const geral = Array.isArray(buscaGeral.data?.data) ? buscaGeral.data.data : [];
          lista = geral.filter((c) => String(c?.numeroDocumento || "").replace(/\D/g, "") === cpfLimpo);
        }
        if (lista.length > 0) idDoContato = lista[0].id;
      } catch (e) {}
    }

    if (!idDoContato) {
      const payloadContato = {
        nome: nomeCompleto, tipo: "F", situacao: "A",
        endereco: {
          geral: {
            endereco: addrDraft?.endereco || "Endereço não informado",
            numero: String(addrDraft?.numero || "S/N"),
            bairro: addrDraft?.complemento || "Centro", 
            municipio: addrDraft?.cidade || "Cidade",
            uf: addrDraft?.estado || "SP",
            cep: addrDraft?.cep || "00000000"
          }
        }
      };
      if (emailContato) payloadContato.email = emailContato;
      if (cpfLimpo) payloadContato.numeroDocumento = cpfLimpo;

      try {
        const contatoResp = await axios.post("https://api.bling.com.br/Api/v3/contatos", payloadContato, {headers});
        idDoContato = contatoResp.data?.data?.id || null;
      } catch (errC) {
        throw errC;
      }
      await sleep(400);
    }

    // Garante que o contato existente tenha CPF (necessário para NF)
    if (idDoContato && cpfLimpo) {
      try {
        await axios.put(
          `https://api.bling.com.br/Api/v3/contatos/${idDoContato}`,
          { numeroDocumento: cpfLimpo },
          { headers }
        );
        logger.info("CPF atualizado no contato Bling.", { idDoContato, cpfLimpo });
      } catch (e) {
        logger.warn("Não foi possível atualizar CPF do contato no Bling.", { idDoContato, cpfLimpo });
      }
      await sleep(400);
    }

    await sleep(800);

    const produtosSnap = await db.collection("products").get();
    const produtosMap = {};
    const produtosPorNome = {};
    produtosSnap.forEach((doc) => { 
      const data = doc.data();
      produtosMap[doc.id] = data; 
      if (data.nome) produtosPorNome[String(data.nome).trim()] = data;
    });

    const itensMapeados = [];
    const listaItens = dadosPagamento.additional_info?.items || [];

    for (const item of listaItens) {
      if (item?.id === "FRETE") continue;

      const idVindoDoMp = String(item?.id ?? "");
      const nomeVindoDoMp = String(item?.title ?? "").trim();
      
      const produtoInfo = produtosMap[idVindoDoMp] || produtosPorNome[nomeVindoDoMp];
      const skuReal = produtoInfo?.SKU || produtoInfo?.sku || idVindoDoMp;

      let idInternoBling = null;

      try {
        const buscaProd = await axios.get(`https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(skuReal)}`, {headers});
        if (buscaProd.data?.data?.length > 0) idInternoBling = buscaProd.data.data[0].id;
        await sleep(350); 
      } catch (errProd) {}

      const objItem = {
        codigo: String(skuReal),
        descricao: String(nomeVindoDoMp || produtoInfo?.nome || "Produto").trim(),
        quantidade: Number(item?.quantity ?? 1),
        valor: Number(item?.unit_price ?? 0),
        unidade: "UN"
      };

      if (idInternoBling) objItem.produto = { id: idInternoBling };
      itensMapeados.push(objItem);
    }

    const hoje = new Date().toISOString().split("T")[0];
    const addrPay = dadosPagamento.additional_info?.shipment?.receiver_address || {};
    const nomeDoFrete = String(draftData?.metodoEntrega || draftData?.dadosEntrega?.metodoEntrega || draftData?.freteMetodo || "Transportadora");

    const pedidoBling = {
      contato: { id: idDoContato },
      loja: { id: 205984154 }, 
      situacao: { id: 9 },
      data: hoje,
      itens: itensMapeados,
      transporte: {
        fretePorConta: 0, 
        frete: Number(draftData?.frete ?? 0),
        quantidadeVolumes: 1, 
        contato: { nome: nomeDoFrete },
        volumes: [{ servico: nomeDoFrete }],
        endereco: addrDraft?.endereco || addrPay?.street_name || "",
        numero: String(addrDraft?.numero || addrPay?.street_number || ""),
        cep: addrDraft?.cep || addrPay?.zip_code || "",
        cidade: addrDraft?.cidade || addrPay?.city_name || "",
        uf: addrDraft?.estado || addrPay?.state_name || ""
      },
      parcelas: [{
        dataVencimento: hoje,
        valor: Number(dadosPagamento.transaction_amount || draftData?.total || 0),
        formaPagamento: { id: idFormaBling } 
      }],
      observacoes: `Site Hygge - MP ID: ${dadosPagamento.id}`
    };

    logger.info("Payload enviado ao Bling:", JSON.stringify(pedidoBling));

    const vendaResp = await axios.post("https://api.bling.com.br/Api/v3/pedidos/vendas", pedidoBling, { headers });
    const idPedidoBling = vendaResp.data?.data?.id;
    logger.info(`✅ Venda ${idPedidoBling} criada como "Em aberto".`);

    await sleep(2000);
    
    try {
      await gerarNotaFiscalBling(idPedidoBling);
      logger.info(`✅ Fluxo completo: Pedido ${idPedidoBling} criado e NF gerada com sucesso!`);
    } catch (nfError) {
      logger.error(`⚠️ Pedido ${idPedidoBling} criado, mas falhou ao gerar NF:`, nfError.response?.data || nfError.message);
    }

  } catch (err) {
    logger.error("Falha Bling. Payload error:", err.response?.data || err.message);
  }
}

/**
 * 5. FUNÇÃO: Solicitar redefinição de senha
 */
exports.solicitarRedefinicaoSenha = onRequest({cors: ALLOWED_ORIGINS}, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("Método não permitido"); return; }

  try {
    const {email} = req.body || {};
    if (!email) { res.status(400).json({error: "E-mail é obrigatório"}); return; }

    let link;
    try {
      link = await admin.auth().generatePasswordResetLink(email, {
        url: "https://hyggegames.com.br/reset-password", handleCodeInApp: true,
      });
    } catch (err) { res.status(200).json({ok: true}); return; }

    let resetLink = "https://hyggegames.com.br/reset-password";
    try {
      const urlObj = new URL(link);
      const oobCode = urlObj.searchParams.get("oobCode");
      if (oobCode) resetLink = `${resetLink}?oobCode=${encodeURIComponent(oobCode)}`;
    } catch (err) { }

    const html = generateEmailTemplate({
      title: "Recuperação de senha",
      message: "Clique abaixo para redefinir sua senha.",
      buttonText: "Redefinir senha",
      buttonLink: resetLink,
      footerText: "Hygge Games",
    });

    await db.collection("mail").add({
      to: email,
      message: { subject: "Redefinir senha - Hygge Games", html },
    });

    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({error: "Erro"});
  }
});

/**
 * 6. FUNÇÃO: Consultar Status do Pedido
 */
exports.consultarStatusPedido = onRequest({cors: ALLOWED_ORIGINS}, async (req, res) => {
  try {
    const externalReference = req.query.external_reference || req.body?.external_reference || null;
    const paymentId = req.query.payment_id || req.body?.payment_id || null;

    if (!externalReference && !paymentId) {
      return res.status(400).json({error: "Informe external_reference ou payment_id."});
    }

    if (paymentId) {
      try {
        const orderSnap = await db.collection("orders").doc(String(paymentId)).get();
        if (orderSnap.exists) {
          const d = orderSnap.data() || {};
          return res.json({
            found: true, source: "orders", orderId: orderSnap.id,
            paymentId: d.mercadopago_id || paymentId,
            externalReference: d.external_reference || externalReference,
            status: d.status_pagamento || "approved", approved: true,
            total: d.valor_total ?? d.valores?.total ?? null,
            itens: d.itens || null, cliente: d.cliente || null,
          });
        }
      } catch (e) {}
    }

    if (externalReference) {
      try {
        const draftSnap = await db.collection("orders_draft").doc(String(externalReference)).get();
        if (draftSnap.exists) {
          const d = draftSnap.data() || {};
          const approved = d.status_pagamento === "approved";
          return res.json({
            found: true, source: "orders_draft", orderId: draftSnap.id,
            paymentId: d.mercadopago_id || d.payment_id || paymentId,
            externalReference, status: d.status_pagamento || "pending", approved,
            total: d.total ?? null, itens: d.produtos || null,
            cliente: d.cliente || {nome: d.nome || null, email: d.email || null},
          });
        }
      } catch (e) {}
    }

    if (paymentId) {
      try {
        const draftByMpSnap = await db.collection("orders_draft")
          .where("mercadopago_id", "==", String(paymentId)).limit(1).get();
        if (!draftByMpSnap.empty) {
          const doc = draftByMpSnap.docs[0];
          const d = doc.data() || {};
          const approved = d.status_pagamento === "approved";
          return res.json({
            found: true, source: "orders_draft_by_payment_id", orderId: doc.id,
            paymentId, externalReference: d.external_reference || externalReference,
            status: d.status_pagamento || "pending", approved,
            total: d.total ?? null, itens: d.produtos || null,
            cliente: d.cliente || {nome: d.nome || null, email: d.email || null},
          });
        }
      } catch (e) {}
    }

    return res.json({
      found: false, source: null, orderId: null,
      paymentId, externalReference, status: "not_found", approved: false,
    });
  } catch (error) {
    logger.error("[consultarStatusPedido] Erro:", error);
    res.status(500).json({error: "Erro interno ao consultar status do pedido"});
  }
});

// firebase deploy --only functions

//Checkout:     https://us-central1-e-commerce-hygge.cloudfunctions.net/criarPreferencia
//Frete:        https://us-central1-e-commerce-hygge.cloudfunctions.net/calcularFrete
//Webhook:      https://us-central1-e-commerce-hygge.cloudfunctions.net/notificacaoPagamento
//StatusPedido: https://us-central1-e-commerce-hygge.cloudfunctions.net/consultarStatusPedido