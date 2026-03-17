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
 */
exports.criarPreferencia = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido");
    return;
  }

  try {
    // 1. Agora extraímos o frete do corpo da requisição
    const {itens, usuarioId, frete} = req.body;
    const preference = new Preference(mpClient);

    // 2. Mapeia os itens do carrinho normalmente
    const mpItems = itens.map((item) => ({
      id: String(item.id),
      title: String(item.nome),
      unit_price: Number(item.preco),
      quantity: Number(item.quantidade),
      currency_id: "BRL",
    }));

    // 3. Se houver valor de frete, adiciona como um item extra na conta
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
      external_reference: usuarioId,
      // Permite pagamento como visitante (sem exigir conta MP)
      payment_methods: {
        excluded_payment_types: [],
        excluded_payment_methods: [],
        installments: 12,
      },
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
              trackingUrl: "https://hyggegames.com.br/perfil",
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
 * 4a. Bling OAuth2 — Gerenciador de Tokens (auto-refresh)
 */
async function obterTokenBling() {
  const tokenDoc = db.collection("configuracoes").doc("bling_tokens");
  const snap = await tokenDoc.get();

  if (!snap.exists) {
    throw new Error("Tokens do Bling não encontrados. Autorize primeiro via /callbackBling.");
  }

  const dados = snap.data();
  const agora = Date.now();
  // Renova se faltar menos de 60 s para expirar
  const expiraEm = dados.expires_at?.toMillis?.() ?? dados.expires_at ?? 0;

  if (dados.access_token && agora < expiraEm - 60000) {
    return dados.access_token;
  }

  // Token expirado — usa refresh_token para obter um novo
  if (!dados.refresh_token) {
    throw new Error("Refresh token do Bling ausente. Reautorize via /callbackBling.");
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

  logger.info("Token do Bling renovado com sucesso.");
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

    res.status(200).send("<h1>Bling autorizado com sucesso!</h1><p>Agora o sistema pode enviar pedidos.</p>");
  } catch (error) {
    res.status(500).json({erro: error.message, detalhes: error.response?.data});
  }
});

/**
 * 4c. Bling Auxiliar — Enviar pedido (API v3)
 */
async function enviarParaBling(dadosPagamento) {
  try {
    const token = await obterTokenBling();
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Passo 1: Buscar ou criar contato no Bling
    const cpfCnpj = dadosPagamento.payer?.identification?.number;
    const primeiroNome = dadosPagamento.payer?.first_name || "";
    const ultimoNome = dadosPagamento.payer?.last_name || "";
    const nomeContato = primeiroNome
      ? `${primeiroNome} ${ultimoNome}`.trim()
      : "Cliente E-commerce Hygge";

    let idDoContato = null;

    if (cpfCnpj) {
      try {
        const buscaResp = await axios.get(
          `https://www.bling.com.br/Api/v3/contatos?numeroDocumento=${cpfCnpj}`,
          {headers},
        );
        if (buscaResp.data?.data?.length > 0) {
          idDoContato = buscaResp.data.data[0].id;
          logger.info(`Contato encontrado no Bling. ID: ${idDoContato}`);
        }
      } catch (err) {
        logger.warn("Busca de contato no Bling falhou:", err.response?.data || err.message);
      }
    }

    if (!idDoContato) {
      const tipoPessoa = (cpfCnpj && cpfCnpj.length > 11) ? "J" : "F";
      const payloadContato = {
        nome: nomeContato,
        tipo: tipoPessoa,
        situacao: "A",
      };

      if (cpfCnpj) {
        payloadContato.numeroDocumento = cpfCnpj;
      }

      const criarResp = await axios.post(
        "https://www.bling.com.br/Api/v3/contatos",
        payloadContato,
        {headers},
      );
      idDoContato = criarResp.data?.data?.id;
      logger.info(`Contato criado no Bling. ID: ${idDoContato}`);
    }

    // Passo 2: Montar e enviar o pedido
    const hoje = new Date().toISOString().split("T")[0];
    const addr = dadosPagamento.additional_info?.shipment?.receiver_address;

    const pedidoBling = {
      contato: {id: idDoContato},
      data: hoje,
      dataSaida: hoje,
      itens: dadosPagamento.additional_info.items.map((item) => ({
        codigo: String(item.id),
        descricao: String(item.title),
        quantidade: Number(item.quantity),
        valor: Number(item.unit_price),
        unidade: "UN",
      })),
      transporte: {
        endereco: addr?.street_name || "",
        numero: String(addr?.street_number || ""),
        complemento: addr?.apartment || "",
        bairro: "",
        cep: addr?.zip_code || "",
        cidade: addr?.city_name || "",
        uf: addr?.state_name || "",
      },
      observacoes: `Pedido originado no Site - MP ID: ${dadosPagamento.id}`,
    };

    await axios.post("https://www.bling.com.br/Api/v3/pedidos/vendas", pedidoBling, {headers});
    logger.info(`Pedido ${dadosPagamento.id} registrado no Bling v3 com sucesso.`);
  } catch (err) {
    logger.error("Falha na integração com o Bling v3:", err.response?.data || err.message);
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
        url: "https://hyggegames.com.br/reset-password",
        handleCodeInApp: true,
      };
      link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    } catch (err) {
      // Não revela se o usuário existe ou não.
      logger.error("Erro ao gerar link de redefinição de senha:", err);
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

// firebase deploy --only functions

//Checkout: https://us-central1-e-commerce-hygge.cloudfunctions.net/criarPreferencia
//Frete:    https://us-central1-e-commerce-hygge.cloudfunctions.net/calcularFrete
//Webhook:  https://us-central1-e-commerce-hygge.cloudfunctions.net/notificacaoPagamento