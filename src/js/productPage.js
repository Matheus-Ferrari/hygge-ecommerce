

// productPage.js - Página de detalhes do produto (Hygge Games)
// Requisitos desta etapa:
// - URL: /produto?id=slug-do-produto (ex: acertei-na-mosca)
// - Tentar Firebase (quando possível) e, se não encontrar, usar dados locais:
//   - Imagens e descrições existentes em /todos-os-jogos
// - Preço base fixo: R$ 119,00
// - Atualizar valor total conforme quantidade
// - Carrinho no localStorage:
//   cart = [{ id, nome, preco, quantidade, imagem }]

const BASE_PRICE = 119;

// Converte gs://bucket/path para a URL REST pública do Firebase Storage.
// Não faz nenhuma chamada de rede — a conversão é determinística e síncrona.
// Requer apenas que o arquivo seja legível publicamente nas regras do Storage.
const resolveStorageUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('gs://')) {
    // gs://bucket/some/path/file.png
    //   → https://firebasestorage.googleapis.com/v0/b/bucket/o/some%2Fpath%2Ffile.png?alt=media
    const withoutScheme = path.slice('gs://'.length); // 'bucket/some/path/file.png'
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex === -1) return null;
    const bucket = withoutScheme.slice(0, slashIndex);
    const filePath = withoutScheme.slice(slashIndex + 1);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
  }
  return null;
};

// Converte um array de caminhos (gs:// ou https://) em URLs renderizáveis,
// removendo itens inválidos e duplicados.
const resolveGalleryUrls = (list) => {
  if (!Array.isArray(list) || list.length === 0) return [];
  const unique = [];
  list.forEach((path) => {
    const url = resolveStorageUrl(path);
    if (url && !unique.includes(url)) unique.push(url);
  });
  return unique;
};

const OFFICIAL_PRODUCTS = {
  'acertei-na-mosca': {
    title: 'Jogo Acertei na Mosca? | Hygge Games',
    metaDescription:
      'Acertei na Mosca? é um jogo de curiosidades divertido e relaxante com mais de 400 perguntas. Compre agora por R$ 119,00.',
    h1: 'Acertei na Mosca?',
    shortDescription: 'O jogo de curiosidades divertido e relaxante em que o chute mais certeiro vence!',
    fullDescription: [
      'O jogo de curiosidades divertido e relaxante em que o chute mais certeiro vence!',
      'Quantos bigodes tem um gato? Quantos países existem na África? Em que ano foi tirada a primeira foto da Terra a partir do espaço?',
      'Acertei na mosca? possui mais de 400 perguntas originais e interessantes cujas respostas serão sempre números. Tudo bem se você não tiver a menor ideia sobre a resposta a uma pergunta. Para ganhar o ponto, basta que sua resposta seja a que mais se aproxime da resposta certa entre todos os participantes.',
      'Claro que se acertar na mosca com sua resposta, você ganhará pontos extras e ficará mais perto da vitória!',
      'Um jogo de perguntas e respostas bastante divertido que vai garantir muitas gargalhadas, debates acalorados e chutes desesperados e sem noção em seu próximo encontro ou jantar com os amigos e a família.',
      'Perfeito para uma noite relaxante na companhia de amigos e familiares. Acertei na mosca? é também uma excelente opção de presente.',
    ],
    gameSpecs: {
      Idade: '14+ anos',
      Jogadores: '2+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
  'vacilou-dancou': {
    title: 'Jogo Vacilou, Dançou! | Hygge Games',
    metaDescription:
      'Vacilou, Dançou! é um jogo de curiosidades com desafios de dança para dar uma segunda chance. Compre agora por R$ 119,00.',
    h1: 'Vacilou, Dançou!',
    shortDescription:
      'Vacilou, Dançou! é um jogo de curiosidades viciante e divertido que dá uma segunda chance ao participante que vai ter que remexer o esqueleto!',
    fullDescription: [
      'Onde fica localizado o coração dos camarões? Você manda bem na dança do robô?',
      'Vacilou, Dançou! é um jogo de curiosidades viciante e divertido que dá uma segunda chance ao participante que vai ter que remexer o esqueleto!',
      'Diferentemente dos jogos de perguntas e respostas convencionais, nem tudo está perdido quando você não souber responder a uma pergunta.',
      'Basta aumentar o som, retirar uma carta de desafio de dança e arrasar na performance para vencer!',
      'Prepare-se para muita diversão, passinhos raros, performances impressionantes e muitas gargalhadas!',
      'Seja você a fera dos jogos de curiosidades, o rei ou rainha das pistas de dança, ou um pouco dos dois – todo mundo tem chance de ganhar!',
      'Este jogo traz um mix fantástico de perguntas divertidas e desafios de dança que vão fazer você rolar de rir.',
      'O jogo perfeito para sua próxima reunião social com amigos ou com toda a família.',
      'Prepare-se para dançar e arrasar!',
    ],
    gameSpecs: {
      Idade: '14+ anos',
      Jogadores: '2+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
  'coisas-que-nao-ensinam-na-escola': {
    title: 'Jogo Coisas que não ensinam na escola | Hygge Games',
    metaDescription:
      'Coisas que não ensinam na escola™ é um jogo de curiosidades hilário e viciante com mais de 400 perguntas e respostas inusitadas. Compre por R$ 119,00.',
    h1: 'Coisas que não ensinam na escola™',
    shortDescription: 'Uma mistura louca de fatos curiosos, perguntas aleatórias e conhecimento totalmente inútil!',
    fullDescription: [
      'Por que a Mona Lisa não tem sobrancelhas? Em que ano foi inventado o xampu? Qual é o dia da semana mais comum para se fazer sexo?',
      'Coisas que não ensinam na escola™ definitivamente não é o seu jogo tradicional de curiosidades com perguntas chatas sobre quem escreveu as histórias de Sherlock Holmes ou onde os Jogos Olímpicos de 1996 foram realizados.',
      'Em vez disso, este é um jogo de curiosidades hilário e viciante com mais de 400 perguntas e respostas inusitadas e inesperadas!',
      'Coisas que não ensinam na escola™ é um ótimo jogo para quem nunca se cansa de curiosidades divertidas e conhecimento inútil.',
      'É o melhor jogo para reuniões sociais e perfeito para um jantar divertido com amigos e família.',
      'Muitas gargalhadas e discussões interessantes estarão garantidas!',
    ],
    gameSpecs: {
      Idade: '14+ anos',
      Jogadores: '2+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
  'eu-deveria-saber-isso': {
    title: 'Jogo Eu deveria saber isso! | Hygge Games',
    metaDescription:
      'Eu deveria saber isso!™ é um jogo de curiosidades com mais de 400 perguntas em que os pontos são subtraídos a cada resposta incorreta. Compre por R$ 119,00.',
    h1: 'Eu deveria saber isso!™',
    shortDescription: 'Teste seu conhecimento sobre curiosidades do mundo e descubra o quanto você realmente sabe!',
    fullDescription: [
      'Eu deveria saber isso!™ é um jogo de curiosidades muito divertido com mais de 400 perguntas sobre coisas que você deveria saber.',
      'Ao contrário dos formatos tradicionais de perguntas e respostas, você não ganha pontos ao responder as perguntas corretamente.',
      'Ao invés disso, os pontos são subtraídos a cada resposta incorreta!',
      'Prepare-se para ver o quanto você sabe sem o Google e a Wikipedia ao seu alcance!',
      'Este jogo dinâmico e hilário garante muitas gargalhadas, brancos e respostas ridículas!',
      'Uma coisa é certa: será apenas uma questão de tempo até você ouvir a si mesmo dizer… “Eita! Eu deveria saber isso!”',
      'Perfeito para a sua próxima reunião social ou jantar com amigos e família.',
    ],
    gameSpecs: {
      Idade: '14+ anos',
      Jogadores: '2+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
  'hygge-game': {
    title: 'Jogo Hygge Game: Cartas para Conversas | Hygge Games',
    metaDescription:
      'Reúna amigos e família com o Hygge Game. Mais de 300 perguntas para criar laços e momentos inesquecíveis. Compre agora por R$ 119,00.',
    h1: 'Hygge Game™',
    shortDescription: 'Ideal para noites relaxantes, jantares e reuniões sociais.',
    fullDescription: [
      'Hygge é uma palavra "escandinava" para aproveitar as coisas boas da vida, e não há nada mais hygge do que passar bons momentos com as pessoas que você ama.',
      'O Hygge Game™ tem como objetivo reunir as pessoas, incentivando amigos e familiares a compartilhar suas histórias e criar laços durante conversas sobre as coisas simples e também mais complexas da vida.',
      'O jogo tem mais de 300 perguntas instigantes, criadas para estimular conversas interessantes e criar a atmosfera perfeita para uma noite hygge.',
      'É perfeito para uma noite relaxante em casa, uma reunião ou jantar com amigos ou família. O Hygge Game também é uma ótima opção para presentear.',
      'Por que não se inspirar nos escandinavos e trazer um pouco mais de hygge para sua vida?',
    ],
    gameSpecs: {
      Idade: '14+ anos',
      Jogadores: '2+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
  'quem-na-roda': {
    title: 'Jogo Quem na Roda: Diversão entre Amigos | Hygge Games',
    metaDescription:
      'Descubra o que seus amigos realmente pensam de você com Quem na Roda. Mais de 300 perguntas engraçadas. Garanta o seu por R$ 119,00.',
    h1: 'Quem na roda...?',
    shortDescription: 'Descubra o que seus amigos realmente pensam de você.',
    fullDescription: [
      'Dinâmica do jogo: Aponte para quem melhor se encaixa na pergunta e divirta-se.',
      'O que vem no jogo: Mais de 300 perguntas inesperadas e pessoais.',
      'Diferencial: Revelações e situações hilárias que geram discussões divertidas entre amigos.',
    ],
    gameSpecs: {
      Idade: '17+ anos',
      Jogadores: '3+',
      'Duração': '20–30 minutos',
    },
    techSpecs: {
      'Quantidade de cartas': '110',
      Peso: '340 g',
      Largura: '145 mm',
      Comprimento: '145 mm',
      Altura: '55 mm',
      NCM: '4819.20.00',
    },
  },
};

const formatPrice = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getSlugFromUrl = () => new URLSearchParams(window.location.search).get('id');

const slugify = (text) => {
  const raw = (text || '').toString().trim();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let slug = normalized
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug === 'o-hygge-game') slug = 'hygge-game';
  return slug;
};

const setMessage = (text) => {
  const el = document.getElementById('product-message');
  if (el) el.textContent = text || '';
};

const setSeo = ({ title, metaDescription }) => {
  if (title) document.title = title;
  if (metaDescription) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', metaDescription);
  }
};

const safeText = (value) => (value == null ? '' : String(value));

const stripEspecificacoesFromText = (value) => {
  let text = safeText(value);
  if (!text) return '';

  // Remove tudo a partir de "Especificações:" (inclusive) — pode vir em uma linha ou com quebras.
  // Ex.: "... Especificações: 14+ anos | 2+ jogadores | 20–30 min."
  // Ex.: "...\nEspecificações:\n14+ anos | 2+ jogadores | 20-30 min."
  text = text.replace(/\s*especifica(?:ç|c)(?:o|õ)es\s*:\s*[\s\S]*$/i, '').trim();

  return text;
};

const normalizeDescricaoCompleta = (value) => {
  const stripSpecs = (text) => {
    let val = stripEspecificacoesFromText(text).trim();
    if (!val) return '';

    // Remove um parágrafo inteiro de especificações (caso venha sozinho).
    if (/^especifica(ç|c)\s*o?e?s\s*:\s*/i.test(val)) return '';

    // Remove trecho inline do tipo "Especificações: 14+ anos | 2+ jogadores | 20-30 min."
    val = val
      .replace(
        /\s*especifica(ç|c)\s*o?e?s\s*:\s*[^\n\r]*?(\d+\s*\+?\s*anos\s*\|\s*\d+\s*\+?\s*jogadores\s*\|\s*\d+\s*[–-]\s*\d+\s*min\.?[^\n\r]*)\s*/gi,
        ' '
      )
      .replace(/\s{2,}/g, ' ')
      .trim();

    return val;
  };

  if (Array.isArray(value)) {
    return value.map((p) => stripSpecs(p)).filter(Boolean);
  }

  const text = safeText(value).trim();
  if (!text) return [];

  // Divide por linhas em branco (parágrafos). Se não houver, mantém como 1 parágrafo.
  const parts = text
    .split(/\n\s*\n/g)
    .map((p) => stripSpecs(p.replace(/\n+/g, ' ')))
    .filter(Boolean);

  return parts.length ? parts : [text];
};

const LOCAL_IMAGE_BY_SLUG = {
  'acertei-na-mosca': 'acerteinamosca.png',
  'vacilou-dancou': 'vaciloudancou.png',
  'quem-na-roda': 'quemnaroda.png',
  'hygge-game': 'hyggegame.png',
  'coisas-que-nao-ensinam-na-escola': 'coisasquenaoensinam.png',
  // Compatibilidade com slug antigo (cards antigos).
  'coisas-que-nao-te-ensinam': 'coisasquenaoensinam.png',
  'eu-deveria-saber-isso': 'eudeveriasaberisso.png',
};

const getLocalImageBySlug = (slug) => {
  const file = LOCAL_IMAGE_BY_SLUG[slug] || `${String(slug || '').replace(/-/g, '')}.png`;
  return `src/img/${file}`;
};

const getGalleryImagesBySlug = (slug) => {
  const main = getLocalImageBySlug(slug);

  const extrasBySlug = {
    'quem-na-roda': [
      'src/img/Quemnaroda/quemnaroda1.jpg',
      'src/img/Quemnaroda/quemnaroda2.jpg',
      'src/img/Quemnaroda/quemnaroda4.jpg',
      'src/img/Quemnaroda/quemnarodacostas1.jpg',
      'src/img/jogos/quem-na-roda.png',
    ],
    'hygge-game': [
      'src/img/Hygge-game/hyggegame1.jpg',
      'src/img/Hygge-game/Hyggegames2.jpg',
      'src/img/Hygge-game/Hyggegame3.jpg',
      'src/img/Hygge-game/Hyggegame5.jpg',
      'src/img/Hygge-game/Hyggegamescostas.png',
      'src/img/jogos/hygge-game.png',
    ],
    'eu-deveria-saber-isso': [
      'src/img/eudeveriasaber/eudeveriasaberfrente.png',
      'src/img/eudeveriasaber/eudeveriasaberfrente2.png',
      'src/img/eudeveriasaber/eudeveriasaber1.png',
      'src/img/eudeveriasaber/eudeveriasaber2.png',
      'src/img/eudeveriasaber/eudeveriasaber3.png',
      'src/img/eudeveriasaber/eudeveriasaberissocostas.png',
      'src/img/jogos/eu-deveria-saber-isso.png',
    ],
    'coisas-que-nao-te-ensinam': [
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola1.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola2.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola3.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola4.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescolacostas.png',
      'src/img/jogos/coisas-que-nao-te-ensinam.png',
    ],
    'coisas-que-nao-ensinam-na-escola': [
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola1.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola2.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola3.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescola4.png',
      'src/img/coisasquenaoensinamnaescola/coisasquenaoensinamnaescolacostas.png',
      'src/img/jogos/coisas-que-nao-te-ensinam.png',
    ],
    'acertei-na-mosca': ['src/img/jogos/acertei-na-mosca.png'],
    'vacilou-dancou': ['src/img/jogos/vacilou-dancou.png'],
  };

  const extras = extrasBySlug[slug] || [];

  const unique = [];
  [main, ...extras].forEach((src) => {
    const val = safeText(src).trim();
    if (!val) return;
    if (unique.includes(val)) return;
    unique.push(val);
  });

  return unique;
};

const tryGetFirebaseProductBySlug = async (slug) => {
  try {
    // Import dinâmico para não quebrar quando a página é aberta via Live Server
    // (onde o browser não resolve "firebase/firestore" sem o Vite).
    const { getProducts } = await import('../firebase/productService.js');
    const products = await getProducts();
    return products.find((p) => slugify(p.nome) === slug) || null;
  } catch {
    return null;
  }
};

const fetchLocalCatalogFromTodosOsJogos = async () => {
  // Lê os cards locais já existentes (imagem/descrição) sem duplicar dados em JS.
  const res = await fetch('/todos-os-jogos', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar catálogo local.');
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = Array.from(doc.querySelectorAll('.produto-card'));

  const map = new Map();
  cards.forEach((card) => {
    const titleEl = card.querySelector('.product-card__title');
    const descEl = card.querySelector('.produto-desc');
    const imgEl = card.querySelector('img');

    const nome = safeText(titleEl?.textContent).trim();
    if (!nome) return;

    const slug = slugify(nome);
    const descricao = safeText(descEl?.textContent).trim();
    const imagemSrc = safeText(imgEl?.getAttribute('src')).trim();

    map.set(slug, {
      id: slug,
      nome,
      descricao,
      imagem: imagemSrc || getLocalImageBySlug(slug),
    });
  });

  return map;
};

const renderProduct = (product) => {
  const imageEl = document.getElementById('mainProductImage') || document.getElementById('product-image');
  const thumbnailsEl = document.getElementById('product-thumbnails');
  const nameEl = document.getElementById('product-name');
  const priceEl = document.getElementById('product-price');
  const shortDescEl = document.getElementById('product-short-description');
  const categoryEl = document.getElementById('product-category');
  const stockEl = document.getElementById('product-stock');
  const qtyEl = document.getElementById('quantity');
  const fullDescEl = document.getElementById('product-full-description');
  const toggleFullDescBtn = document.getElementById('toggle-full-description');
  const gameSpecsEl = document.getElementById('game-specs');
  const techSpecsEl = document.getElementById('product-tech-specs');

  const primary = safeText(product.imagem);
  const fallback1 = safeText(product.imagemFallback);
  const fallback2 = safeText(product.imagemFallback2);
  const images = Array.isArray(product.imagens) && product.imagens.length ? product.imagens : [primary];

  if (imageEl) {
    imageEl.src = images[0] || primary;
    imageEl.alt = safeText(product.nome);

    // Se não existir, tenta a imagem já usada no card local e, por último, a do Firebase.
    imageEl.onerror = () => {
      if (fallback1 && imageEl.src.indexOf(fallback1) === -1) {
        imageEl.src = fallback1;
        return;
      }
      if (fallback2 && imageEl.src.indexOf(fallback2) === -1) {
        imageEl.src = fallback2;
      }
    };
  }

  if (thumbnailsEl) {
    thumbnailsEl.innerHTML = '';

    const all = [];
    [...images, fallback1, fallback2].forEach((src) => {
      const val = safeText(src).trim();
      if (!val) return;
      if (all.includes(val)) return;
      all.push(val);
    });

    const setActive = (activeSrc) => {
      const thumbs = thumbnailsEl.querySelectorAll('img.thumbnail');
      thumbs.forEach((t) => {
        t.classList.toggle('is-active', t.getAttribute('data-src') === activeSrc);
      });
    };

    all.forEach((src, index) => {
      const thumb = document.createElement('img');
      thumb.className = `thumbnail${index === 0 ? ' is-active' : ''}`;
      thumb.src = src;
      thumb.alt = `Imagem ${index + 1} de ${safeText(product.nome)}`;
      thumb.loading = 'lazy';
      thumb.setAttribute('data-src', src);

      thumb.addEventListener('click', () => {
        if (!imageEl) return;
        imageEl.src = src;
        setActive(src);
      });

      thumb.onerror = () => {
        thumb.style.display = 'none';
      };

      thumbnailsEl.appendChild(thumb);
    });
  }
  if (nameEl) nameEl.textContent = safeText(product.nome);
  if (shortDescEl) {
    const desc = stripEspecificacoesFromText(product.descricaoCurta || product.descricao);
    shortDescEl.textContent = desc;
  }
  if (categoryEl) categoryEl.textContent = safeText(product.categoria || '—');

  if (stockEl) stockEl.textContent = 'Disponível';

  if (qtyEl) {
    qtyEl.textContent = '1';
    qtyEl.dataset.min = '1';
    qtyEl.dataset.max = '99';
  }

  // Preço inicial (quantidade = 1)
  if (priceEl) priceEl.textContent = formatPrice(BASE_PRICE);

  if (fullDescEl) {
    fullDescEl.innerHTML = '';
    const parts = normalizeDescricaoCompleta(product.descricaoCompleta);
    if (!parts.length) {
      const section = fullDescEl.closest('.product-section');
      if (section) section.style.display = 'none';
      if (toggleFullDescBtn) {
        toggleFullDescBtn.hidden = true;
        toggleFullDescBtn.setAttribute('aria-expanded', 'false');
      }
    } else {
      const section = fullDescEl.closest('.product-section');
      if (section) section.style.display = '';
      parts.forEach((p) => {
        const el = document.createElement('p');
        el.textContent = p;
        fullDescEl.appendChild(el);
      });

      if (toggleFullDescBtn) {
        // Estado padrão: colapsado (se precisar)
        toggleFullDescBtn.onclick = null;
        toggleFullDescBtn.hidden = true;
        toggleFullDescBtn.textContent = 'Ver mais';
        toggleFullDescBtn.setAttribute('aria-expanded', 'false');
        const COLLAPSED_HEIGHT = 220;

        // Força estado colapsado inicial (robusto mesmo se CSS falhar)
        fullDescEl.classList.add('is-collapsed');
        fullDescEl.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
        fullDescEl.style.overflow = 'hidden';

        requestAnimationFrame(() => {
          const expandedHeight = fullDescEl.scrollHeight;
          const needsToggle = expandedHeight > COLLAPSED_HEIGHT + 1;

          if (!needsToggle) {
            fullDescEl.classList.remove('is-collapsed');
            fullDescEl.style.maxHeight = '';
            fullDescEl.style.overflow = '';
            toggleFullDescBtn.hidden = true;
            return;
          }

          toggleFullDescBtn.hidden = false;
          let expanded = false;
          toggleFullDescBtn.onclick = () => {
            expanded = !expanded;
            toggleFullDescBtn.setAttribute('aria-expanded', String(expanded));
            toggleFullDescBtn.textContent = expanded ? 'Ver menos' : 'Ver mais';

            if (expanded) {
              fullDescEl.classList.remove('is-collapsed');
              fullDescEl.style.maxHeight = `${expandedHeight}px`;
              fullDescEl.style.overflow = 'visible';
            } else {
              fullDescEl.classList.add('is-collapsed');
              fullDescEl.style.maxHeight = `${COLLAPSED_HEIGHT}px`;
              fullDescEl.style.overflow = 'hidden';
            }
          };
        });
      }
    }
  }

  const renderSpecs = (container, specs) => {
    if (!container) return;
    container.innerHTML = '';

    const entries = specs ? Object.entries(specs) : [];
    const hasEntries = entries.length > 0;

    const section = container.closest('.product-section');
    if (section) section.style.display = hasEntries ? '' : 'none';
    if (!hasEntries) return;

    entries.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'product-spec__row';
      const left = document.createElement('span');
      left.textContent = label;
      const right = document.createElement('strong');
      right.textContent = value;
      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    });
  };

  renderSpecs(gameSpecsEl, product.especificacoesJogo);
  renderSpecs(techSpecsEl, product.especificacoesTecnicas);
};

const updateTotalPrice = () => {
  const qtyEl = document.getElementById('quantity');
  const priceEl = document.getElementById('product-price');
  if (!qtyEl || !priceEl) return;

  const qty = Math.max(1, Math.floor(Number(qtyEl.textContent || 1)));
  const total = BASE_PRICE * qty;
  priceEl.textContent = formatPrice(total);
};

const readCart = () => {
  try {
    const raw = localStorage.getItem('cart');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCart = (cart) => {
  localStorage.setItem('cart', JSON.stringify(cart));
  document.dispatchEvent(new CustomEvent('cart:updated'));
};

const addToCart = (product, quantity) => {
  const cart = readCart();

  const qtyToAdd = Math.max(1, Math.floor(Number(quantity || 1)));
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantidade = Number(existing.quantidade || 0) + qtyToAdd;
  } else {
    cart.push({
      id: product.id,
      nome: product.nome,
      preco: BASE_PRICE,
      quantidade: qtyToAdd,
      imagem: product.imagem,
    });
  }

  writeCart(cart);
};

const getQty = () => {
  const el = document.getElementById('quantity');
  return Math.max(1, Math.floor(Number(el?.textContent?.trim() || 1)));
};

const setQty = (val) => {
  const el = document.getElementById('quantity');
  if (!el) return;
  const max = Number(el.dataset.max || 99);
  const min = Number(el.dataset.min || 1);
  el.textContent = String(Math.max(min, Math.min(max, val)));
  updateTotalPrice();
};

const init = async () => {
  setMessage('');

  const slug = getSlugFromUrl();
  if (!slug) {
    setMessage('Produto não encontrado.');
    return;
  }

  setMessage('Carregando produto...');

  // 1) Catálogo local (imagem + descrição) — sempre disponível
  let localCatalog = null;
  try {
    localCatalog = await fetchLocalCatalogFromTodosOsJogos();
  } catch {
    localCatalog = new Map();
  }
  const local = localCatalog.get(slug);

  // 1.1) Catálogo oficial (documento)
  const official = OFFICIAL_PRODUCTS[slug];

  // 2) Firebase (opcional): tenta achar pelo nome (slug)
  const fromFirebase = await tryGetFirebaseProductBySlug(slug);

  // 3) Monta o produto final priorizando:
  // - nome/descrição/imagem locais
  // - categoria/estoque do Firebase (se existir)
  const nome = fromFirebase?.nome || local?.nome || official?.h1;
  const descricao = fromFirebase?.descricao || local?.descricao || '';
  const categoria = fromFirebase?.categoria;
  const estoque = undefined;

  // --- Debug temporário ---
  console.log('[ProductPage] produto completo recebido:', fromFirebase);
  console.log('[ProductPage] imagemCapa original (gs://):', fromFirebase?.imagemCapa);
  console.log('[ProductPage] galeria original (gs://):', fromFirebase?.galeria);

  // 4) Converter gs:// → URL REST pública do Firebase Storage (síncrono, sem chamada de API).
  // Navegadores não renderizam gs:// em <img src>, causando ERR_UNKNOWN_URL_SCHEME.
  // A URL gerada é do formato: firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
  const imagemCapaResolvida = resolveStorageUrl(fromFirebase?.imagemCapa);
  const galeriaResolvida = resolveGalleryUrls(fromFirebase?.galeria);

  console.log('[ProductPage] imagemCapa convertida:', imagemCapaResolvida);
  console.log('[ProductPage] galeria convertida:', galeriaResolvida);

  // 5) Prioridade final:
  //    imagem principal → imagemCapa convertida → 1º item da galeria convertida → fallback local
  //    galeria          → galeria convertida (se houver) → fallback local por slug
  const imagem =
    imagemCapaResolvida ||
    (galeriaResolvida.length > 0 ? galeriaResolvida[0] : null) ||
    getLocalImageBySlug(slug);

  const imagemFallback = local?.imagem;
  const imagemFallback2 = getLocalImageBySlug(slug);

  const imagens =
    galeriaResolvida.length > 0 ? galeriaResolvida : getGalleryImagesBySlug(slug);

  console.log('[ProductPage] product.imagem final:', imagem);
  console.log('[ProductPage] product.imagens finais:', imagens);

  if (!nome || !descricao) {
    setMessage('Produto não encontrado.');
    return;
  }

  const product = {
    id: slug,
    nome,
    descricao,
    descricaoCurta: fromFirebase?.descricaoCurta || null,
    // Importante: Descrição completa deve vir somente do banco
    descricaoCompleta: fromFirebase?.descricaoCompleta,
    especificacoesJogo: official?.gameSpecs,
    especificacoesTecnicas: official?.techSpecs,
    categoria,
    estoque,
    imagem,
    imagemFallback,
    imagemFallback2,
    imagens,
  };

  if (official) {
    setSeo({ title: official.title, metaDescription: official.metaDescription });
  }

  renderProduct(product);
  updateTotalPrice();

  if (!fromFirebase) {
    // Sem Firebase (ou não encontrado): ainda assim carrega tudo local.
    setMessage('');
  }

  const addBtn = document.getElementById('add-to-cart-btn');
  const buyNowBtn = document.getElementById('buy-now-btn');

  const handleBuy = () => {
    const quantity = getQty();
    if (!Number.isFinite(quantity) || quantity < 1) {
      setMessage('Quantidade inválida.');
      return;
    }

    addToCart(product, quantity);
    setMessage('Produto adicionado ao carrinho.');
  };

  if (addBtn) {
    setMessage('');
    addBtn.addEventListener('click', handleBuy);
  }

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', () => {
      const quantity = getQty();
      if (!Number.isFinite(quantity) || quantity < 1) {
        setMessage('Quantidade inválida.');
        return;
      }
      addToCart(product, quantity);
      window.location.href = '/checkout';
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Registra os botões de quantidade imediatamente, sem esperar o Firebase
  const minusBtn = document.getElementById('qty-minus');
  const plusBtn  = document.getElementById('qty-plus');
  if (minusBtn) minusBtn.addEventListener('click', () => setQty(getQty() - 1));
  if (plusBtn)  plusBtn.addEventListener('click',  () => setQty(getQty() + 1));

  init();
});
