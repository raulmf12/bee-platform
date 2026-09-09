// Geração da CENA do M02 (Rosto + Pensamento) — FONTE ÚNICA usada pela página de
// teste E pelo fluxo real. Coloca o Marcos DENTRO de um ambiente real (o que dava
// o "sem cenário/paia" antes): usa a PRANCHA oficial como estilo/composição e as
// fotos REAIS do Marcos só como likeness (rosto/corpo), ignorando o fundo preto
// de estúdio delas. Chama o edge `nano-scene` (Nano Banana com referências).

import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import { imageDims } from './assetLib';

export type M02Place = 'esquerda' | 'direita' | 'topo' | 'baixo' | 'centro';

// Prancha OFICIAL por variação (referência de ESTILO/ambiente — nunca o rosto).
export const PRANCHA_TILE: Record<string, string> = {
  'M02-A': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-A.jpg`,
  'M02-B': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-B.jpg`,
  'M02-C': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-C.jpg`,
  'M02-D': `${SUPABASE_URL}/storage/v1/object/public/design/hive/prancha-D.jpg`,
};

// Onde o Marcos fica e onde sobra a zona MAIS CALMA do cenário pro texto — sem
// "fundo liso": o ambiente real continua ali, só numa parte de menos detalhe.
export const SCENE_ZONE: Record<M02Place, string> = {
  esquerda: 'o Marcos À DIREITA do quadro; a METADE ESQUERDA fica com a parte mais CALMA e profunda do cenário (céu, parede, penumbra, profundidade desfocada) — espaço pro texto respirar, mas AINDA é o cenário, nunca um fundo chapado',
  direita: 'o Marcos À ESQUERDA do quadro; a METADE DIREITA fica com a parte mais CALMA/profunda do cenário pro texto — ambiente real, não fundo liso',
  baixo: 'o Marcos na METADE DE CIMA; embaixo, o primeiro plano mais calmo do cenário (chão, mesa, superfície) pro texto',
  topo: 'o Marcos na parte de BAIXO; no TOPO, céu/teto/profundidade do cenário pro texto',
  centro: 'o Marcos descentralizado; ao redor, o cenário amplo e mais calmo pro texto',
};

// Ambiente REAL por variação (a alma da cena). O modelo constrói ISTO ao redor
// do Marcos — é o que faltava (posts saíam "sem cenário").
export const SCENE_ENV: Record<string, string> = {
  'M02-A': 'um interior real e sóbrio do dia a dia (um escritório com profundidade, uma sala com parede e luz de janela) — presença em primeiro plano, cenário discreto mas REAL e reconhecível. NUNCA fundo preto chapado.',
  'M02-B': 'um ENCONTRO real: mesa com café, escritório comum vivo e desfocado ao fundo, talvez outra pessoa parcial e desfocada — clima de conversa e escuta, como uma foto de bastidor.',
  'M02-C': 'um lugar real e COTIDIANO ao ar livre (a beira de uma mata, um campo comum, um caminho de terra, uma varanda com vista simples) — luz natural do dia, nada de paisagem épica de cartão-postal, montanha dramática ou neblina de fantasia. Uma foto que uma pessoa de verdade tiraria num passeio.',
  'M02-D': 'uma mesa de trabalho / escrivaninha real com caderno aberto, caneta, luz de janela lateral — clima de registro e estudo (diário).',
};

// Monta o prompt da cena (dois papéis de referência: prancha=estilo, fotos=rosto).
export function buildM02ScenePrompt(variant: string, place: M02Place): string {
  return [
    'Gere UMA fotografia editorial (4:5 vertical) do HOMEM REAL DENTRO DE UM CENÁRIO REAL. Você recebe referências com DOIS papéis distintos:',
    '• A 1ª imagem é a PRANCHA OFICIAL de estilo: copie dela o ENQUADRAMENTO, a COMPOSIÇÃO, a PALETA, a luz e o clima. IGNORE por completo o rosto/identidade de quem aparece nela — é só guia visual de composição e ambiente.',
    '• As imagens SEGUINTES são o HOMEM REAL. PRESERVE EXATAMENTE a aparência dele: mesmo rosto, traços, cabelo curto castanho, barba curta, meia-idade, camisa clara/social. NÃO rejuvenesça, NÃO idealize, NÃO troque a roupa por terno. ⚠️ IGNORE o FUNDO PRETO DE ESTÚDIO dessas fotos — ele NÃO deve aparecer; use as fotos SÓ pra o rosto/corpo dele.',
    `CENÁRIO (o mais importante — é o que estava faltando): coloque o Marcos DENTRO deste ambiente: ${SCENE_ENV[variant] ?? SCENE_ENV['M02-A']} O ambiente tem que ser visível e crível, com profundidade — NADA de recorte dele sobre cor chapada.`,
    `Composição: ${SCENE_ZONE[place] ?? SCENE_ZONE.esquerda}.`,
    'A zona reservada pro texto é uma parte MAIS CALMA e de menos detalhe do MESMO cenário (céu, parede, profundidade desfocada) — nunca um retângulo de cor lisa.',
    '⚠️ REALISMO: tem que parecer uma FOTO REAL e comum, que o próprio Marcos tiraria — NADA de épico, cinematográfico, dramático, hiper-nítido ou de fantasia/render 3D. Luz natural comum, imperfeição plausível. Se parecer papel de parede/banco de imagens, está ERRADO.',
    'Atmosfera silenciosa e editorial. Paleta sóbria (off-white, azul profundo, cinza, terrosos).',
    'NÃO escreva NENHUM texto/letra/número/logo na imagem — só a cena fotográfica.',
  ].join(' ');
}

async function urlToB64(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
    fr.readAsDataURL(blob);
  });
}

export interface M02SceneResult { dataUrl: string; width: number; height: number; place: M02Place }

// Cache por chave (ex: postId|variant|place) — evita regerar (custo) por tecla.
const _sceneCache = new Map<string, M02SceneResult>();
export function clearM02SceneCache(prefix?: string): void {
  if (!prefix) { _sceneCache.clear(); return; }
  for (const k of _sceneCache.keys()) if (k.startsWith(prefix)) _sceneCache.delete(k);
}

// Gera a cena. likenessUrls = fotos REAIS do Marcos (rosto). Devolve dataUrl (o
// caller decide subir pro Storage ou usar direto).
export async function renderM02Scene(opts: {
  variant: string;
  place?: M02Place;
  likenessUrls: string[];
  cacheKey?: string;
}): Promise<M02SceneResult> {
  const place: M02Place = opts.place ?? 'esquerda';
  if (opts.cacheKey) {
    const hit = _sceneCache.get(opts.cacheKey);
    if (hit) return hit;
  }
  const prompt = buildM02ScenePrompt(opts.variant, place);
  const tile = PRANCHA_TILE[opts.variant];
  // 1ª ref = prancha (estilo) · demais = Marcos real (likeness). Até 4 no total.
  const refUrls = [...(tile ? [tile] : []), ...opts.likenessUrls.filter(Boolean).slice(0, 3)];
  const references = await Promise.all(refUrls.map(urlToB64));
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/nano-scene`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, references, ref_mime: 'image/jpeg' }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`nano-scene ${res.status}: ${txt.slice(0, 160)}`);
  const out = JSON.parse(txt) as { image_base64: string; mime_type: string };
  const dataUrl = `data:${out.mime_type};base64,${out.image_base64}`;
  const dims = await imageDims(dataUrl);
  const result: M02SceneResult = { dataUrl, width: dims.w, height: dims.h, place };
  if (opts.cacheKey) _sceneCache.set(opts.cacheKey, result);
  return result;
}
