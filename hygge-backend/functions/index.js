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
const blingClientId = defineString("BLING_CLIENT_ID");
const blingClientSecret = defineString("BLING_CLIENT_SECRET");
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

// Inicializa o cliente do Mercado Pago usando .value()
const mpClient = new MercadoPagoConfig({
  accessToken: mpKeyParam.value(),
});

/**
 * 1. FUNÇÃO: Criar Preferência (Checkout Mercado Pago)
 * Agora ela grava o rascunho no Firestore para garantir que o Webhook funcione.
 */
exports.criarPreferencia = onRequest({cors: true}, async (req, res) => {
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

    // Regra de Ouro 1: docId = usuarioId do front
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

    // Regra de Ouro 2: external_reference = docId
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
      auto_return: "approved",
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
exports.calcularFrete = onRequest({cors: true}, async (req, res) => {
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
      })),
      services: "1,2,17" 
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
        const paymentId = String(paymentDetails.id);

        // Busca explícita do rascunho pelo external_reference (ID do draft)
        let draftData = null;
        if (uid) {
          try {
            const draftSnap = await db.collection("orders_draft").doc(String(uid)).get();
            draftData = draftSnap.exists ? (draftSnap.data() || {}) : null;
            if (!draftData) {
              logger.warn("orders_draft não encontrado para pagamento aprovado.", {uid, paymentId});
            }
          } catch (err) {
            logger.warn("Falha ao buscar orders_draft por external_reference.", {
              uid: String(uid),
              paymentId,
              detalhes: err?.message || String(err),
            });
          }
        }
        
        // Tenta capturar o e-mail de várias fontes do Mercado Pago
        let payerEmail = paymentDetails?.payer?.email ||
                         paymentDetails?.additional_info?.payer?.email ||
                         paymentDetails?.payer?.payer_email ||
                         null;

        // Fallback de e-mail: força uso do e-mail do rascunho se o MP não enviar
        if (!payerEmail && draftData) {
          const fromDraft = draftData?.email || draftData?.cliente?.email || null;
          const clean = String(fromDraft || "").trim();
          if (clean) payerEmail = clean;
        }

        const items = paymentDetails?.additional_info?.items || [];
        const total = paymentDetails?.transaction_amount ?? 0;

        // Finaliza no Firestore e tenta recuperar e-mail do draft se payerEmail for nulo
        const finalized = await finalizeOrderInFirestore({
          paymentId,
          userId: uid || "guest",
          paymentDetails,
          paymentItems: items,
          paymentTotal: total,
          payerEmail,
        });

        const emailFinal = String(payerEmail || finalized?.email || "").trim() || null;

        // Só tenta enviar e-mail se existir um destinatário
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
                email: emailFinal,
                orderNumber: paymentId,
                items,
                total,
                trackingUrl: "https://hyggegames.com.br/perfil",
              });
              await markerRef.set({ orderEmailState: "sent" }, {merge: true});
            }
          } catch (e) {
            logger.error("Erro ao processar fila de e-mail:", e.message);
          }
        } else {
          logger.warn(`Pagamento ${paymentId} aprovado, mas nenhum e-mail encontrado para envio.`);
        }

        // SEMPRE tenta enviar para o Bling, mesmo se o e-mail falhar
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
 * 4a. Bling OAuth2 — Gerenciador de Tokens (auto-refresh)
 */
async function obterTokenBling() {
  const tokenDoc = db.collection("configuracoes").doc("bling_tokens");
  const snap = await tokenDoc.get();

  if (!snap.exists) {
    throw new Error("Tokens do Bling não encontrados.");
  }

  const dados = snap.data();
  const agora = Date.now();
  const expiraEm = dados.expires_at?.toMillis?.() ?? dados.expires_at ?? 0;

  if (dados.access_token && agora < expiraEm - 60000) {
    return dados.access_token;
  }

  if (!dados.refresh_token) {
    throw new Error("Refresh token do Bling ausente.");
  }

  const credentials = Buffer.from(
    `${blingClientId.value()}:${blingClientSecret.value()}`,
  ).toString("base64");

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", dados.refresh_token);

  const resp = await axios.post(
    "https://www.bling.com.br/Api/v3/oauth/token",
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
    },
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
 * 4b. Bling OAuth2 — Callback (troca code por tokens)
 */
exports.callbackBling = onRequest({cors: true}, async (req, res) => {
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
      "https://www.bling.com.br/Api/v3/oauth/token",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${credentials}`,
        },
      },
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

    // 1. Pega dados do rascunho (onde já temos nome/e-mail/endereço)
    const uid = String(dadosPagamento?.external_reference || "").trim();
    let draftData = {};
    if (uid) {
      try {
        const draftDoc = await db.collection("orders_draft").doc(uid).get();
        draftData = draftDoc.exists ? (draftDoc.data() || {}) : {};
      } catch (e) {
        logger.warn("Não foi possível ler orders_draft para o Bling.", {uid, detalhes: e?.message || String(e)});
      }
    }

    // 2. Define variáveis de busca (Prioridade MÁXIMA para o Rascunho)
    const emailContato = String(draftData?.email || draftData?.cliente?.email || dadosPagamento?.payer?.email || "").trim();
    const cpfOriginal = draftData?.cpf || dadosPagamento?.payer?.identification?.number || "";
    const cpfLimpo = String(cpfOriginal).replace(/\D/g, "").trim();

    const nomeCompleto = String(draftData?.nome || draftData?.cliente?.nome || "Cliente Hygge").trim();
    const addrDraft = draftData?.dadosEntrega || {};

    let idDoContato = null;

    // 2a. Tenta localizar primeiro por E-MAIL
    if (emailContato) {
      try {
        const buscaEmail = await axios.get(
          `https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(emailContato)}`,
          {headers},
        );
        if (buscaEmail.data?.data?.length > 0) {
          idDoContato = buscaEmail.data.data[0].id;
        }
      } catch (e) {
        logger.warn("Busca por e-mail falhou no Bling.", {detalhes: e?.response?.data || e?.message});
      }
    }

    // 2b. Se não achou por e-mail e tem CPF, tenta por documento (incluindo inativos via criterio=1)
    if (!idDoContato && cpfLimpo) {
      try {
        const buscaDoc = await axios.get(
          `https://www.bling.com.br/Api/v3/contatos?numeroDocumento=${encodeURIComponent(cpfLimpo)}`,
          {headers},
        );
        let lista = Array.isArray(buscaDoc.data?.data) ? buscaDoc.data.data : [];
        if (lista.length === 0) {
          const buscaGeral = await axios.get(
            "https://www.bling.com.br/Api/v3/contatos?criterio=1",
            {headers},
          );
          const geral = Array.isArray(buscaGeral.data?.data) ? buscaGeral.data.data : [];
          lista = geral.filter((c) => String(c?.numeroDocumento || "").replace(/\D/g, "") === cpfLimpo);
        }

        if (lista.length > 0) {
          idDoContato = lista[0].id;
        }
      } catch (e) {
        logger.warn("Busca por CPF falhou no Bling.", {detalhes: e?.response?.data || e?.message});
      }
    }

// 3. Se ainda não tem ID, cria um novo contato COM ENDEREÇO
if (!idDoContato) {
  const payloadContato = {
    nome: nomeCompleto,
    tipo: "F",
    endereco: {
      geral: {
        endereco: addrDraft?.endereco || "Endereço não informado",
        numero: String(addrDraft?.numero || "S/N"),
        bairro: addrDraft?.complemento || "Centro", // O Bling EXIGE bairro
        municipio: addrDraft?.cidade || "Cidade",
        uf: addrDraft?.estado || "SP",
        cep: addrDraft?.cep || "00000000"
      }
    }
  };
  if (emailContato) payloadContato.email = emailContato;
  if (cpfLimpo) payloadContato.numeroDocumento = cpfLimpo;

  try {
    const contatoResp = await axios.post("https://www.bling.com.br/Api/v3/contatos", payloadContato, {headers});
    idDoContato = contatoResp.data?.data?.id || null;
  } catch (errC) {
    // Fallback duplicidade omitido por brevidade (mantenha o seu catch atual aqui se quiser)
    throw errC;
  }
}

    await sleep(800);

    // 4. Mapear itens e endereço
    const produtosSnap = await db.collection("products").get();
    const produtosMap = {};
    produtosSnap.forEach((doc) => { produtosMap[doc.id] = doc.data(); });

    const itensMapeados = (dadosPagamento.additional_info?.items || [])
      .filter((item) => item?.id !== "FRETE")
      .map((item) => {
        const produtoInfo = produtosMap[String(item?.id ?? "")];
        const skuReal = produtoInfo?.SKU || produtoInfo?.sku || item?.id;
        return {
          produto: { codigo: String(skuReal) },
          quantidade: Number(item?.quantity ?? 1),
          valor: Number(item?.unit_price ?? 0),
          unidade: "UN"
        };
      });

    const hoje = new Date().toISOString().split("T")[0];
    const addrPay = dadosPagamento.additional_info?.shipment?.receiver_address || {};

    const pedidoBling = {
      contato: { id: idDoContato },
      data: hoje,
      itens: itensMapeados,
      transporte: {
        endereco: addrDraft?.endereco || addrPay?.street_name || "",
        numero: String(addrDraft?.numero || addrPay?.street_number || ""),
        cep: addrDraft?.cep || addrPay?.zip_code || "",
        cidade: addrDraft?.cidade || addrPay?.city_name || "",
        uf: addrDraft?.estado || addrPay?.state_name || ""
      },
      observacoes: `Site Hygge - MP ID: ${dadosPagamento.id}`
    };

    await axios.post("https://www.bling.com.br/Api/v3/pedidos/vendas", pedidoBling, { headers });
    logger.info("Venda registrada no Bling.");

  } catch (err) {
    logger.error("Falha Bling:", err.response?.data || err.message);
  }
}

/**
 * 5. FUNÇÃO: Solicitar redefinição de senha
 */
exports.solicitarRedefinicaoSenha = onRequest({cors: true}, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

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
    if (!email) {
      res.status(400).json({error: "E-mail é obrigatório"});
      return;
    }

    let link;
    try {
      const actionCodeSettings = {
        url: "https://hyggegames.com.br/reset-password",
        handleCodeInApp: true,
      };
      link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    } catch (err) {
      res.status(200).json({ok: true});
      return;
    }

    let resetLink = "https://hyggegames.com.br/reset-password";
    try {
      const urlObj = new URL(link);
      const oobCode = urlObj.searchParams.get("oobCode");
      if (oobCode) {
        resetLink = `${resetLink}?oobCode=${encodeURIComponent(oobCode)}`;
      }
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
      message: {
        subject: "Redefinir senha - Hygge Games",
        html,
      },
    });

    res.status(200).json({ok: true});
  } catch (error) {
    res.status(500).json({error: "Erro"});
  }
});



// firebase deploy --only functions

//Checkout: https://us-central1-e-commerce-hygge.cloudfunctions.net/criarPreferencia
//Frete:    https://us-central1-e-commerce-hygge.cloudfunctions.net/calcularFrete
//Webhook:  https://us-central1-e-commerce-hygge.cloudfunctions.net/notificacaoPagamento