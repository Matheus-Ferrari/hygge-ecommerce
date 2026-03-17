import { db } from './firebaseConfig.js';
import { collection, getDocs } from 'firebase/firestore';

function normalizar(str) {
  return String(str || '').trim().normalize('NFC').toLowerCase();
}

/**
 * Busca um cupom pelo nome na coleção `cupons` do Firestore.
 * Compara normalizando acentos e caixa para evitar problemas de encoding.
 */
async function buscarCupomPorNome(nome) {
  const nomeNorm = normalizar(nome);
  if (!nomeNorm) return null;

  try {
    const snapshot = await getDocs(collection(db, 'cupons'));
    if (snapshot.empty) return null;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (normalizar(data.nome) === nomeNorm) {
        return data;
      }
    }
    return null;
  } catch (err) {
    console.error('Erro ao buscar cupom no Firestore:', err);
    return null;
  }
}

/**
 * Verifica se o cupom possui a categoria "Frete Grátis" no array `tipo`.
 */
function cupomTemFreteGratis(cupomData) {
  if (!cupomData || !Array.isArray(cupomData.tipo)) return false;
  return cupomData.tipo.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const cat = normalizar(item.categoria);
    return cat === normalizar('Frete Grátis');
  });
}

/**
 * Valida um código de cupom digitado pelo usuário.
 *
 * Retorna um objeto com o resultado:
 *   { valido: true,  tipo: 'frete_gratis', mensagem: '...' }
 *   { valido: false, tipo: null,           mensagem: '...' }
 */
export async function validarCupom(codigo) {
  const nome = String(codigo || '').trim();
  if (!nome) {
    return { valido: false, tipo: null, mensagem: 'Informe um código para aplicar.' };
  }

  const cupomData = await buscarCupomPorNome(nome);

  if (!cupomData) {
    return { valido: false, tipo: null, mensagem: 'Cupom inválido.' };
  }

  if (cupomTemFreteGratis(cupomData)) {
    return { valido: true, tipo: 'frete_gratis', mensagem: 'Cupom aplicado: frete grátis!' };
  }

  // Cupom existe mas não tem categoria suportada neste momento
  return { valido: false, tipo: null, mensagem: 'Este cupom não é válido para frete grátis.' };
}

/**
 * Aplica o benefício do cupom ao resumo do pedido.
 * Recebe os valores originais e retorna os valores ajustados.
 */
export function aplicarBeneficioCupom({ subtotal, frete, cupomResultado }) {
  const sub = Number(subtotal) || 0;
  let freteAjustado = Math.max(0, Number(frete) || 0);

  if (cupomResultado?.valido && cupomResultado.tipo === 'frete_gratis') {
    freteAjustado = 0;
  }

  const total = Math.max(0, sub + freteAjustado);
  return { subtotal: sub, frete: freteAjustado, total };
}
