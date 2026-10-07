// Funções puras da memória anti-repetição (testáveis fora do Deno).

const clean = (s: string) => s.replace(/#[\p{L}\d_]+/gu, '').replace(/\s+/g, ' ').trim();
const PLACEHOLDER = /^(post importado|post do instagram|post do linkedin)$/i;

// Texto que representa o que o post DISSE: frase + começo da legenda.
export function memoryText(p: { title?: string | null; caption?: string | null; carousel_text?: { quote?: string } | null }): string | null {
  const quote = clean(String(p.carousel_text?.quote ?? p.title ?? ''));
  const caption = clean(String(p.caption ?? ''));
  const parts = [PLACEHOLDER.test(quote) ? '' : quote, caption.startsWith(quote) ? caption.slice(quote.length) : caption].map((x) => x.trim()).filter(Boolean);
  const text = parts.join(' — ').slice(0, 900).trim();
  return text.length >= 20 ? text : null;
}

export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}


// Estruturas que viraram tique nas frases recentes (≥ 3 ocorrências).
const STRUCTURES: Array<{ re: RegExp; label: string }> = [
  { re: /n[aã]o [eé] [^.?!]{2,60}[.?!]\s*[ÉéE] /i, label: '"X não é Y. É Z." (negação seguida de redefinição)' },
  { re: /(^|\s)[eé] um dado/i, label: '"…é um dado"' },
  { re: /erro de percurso/i, label: '"erro de percurso"' },
  { re: /^se (a sua|o seu|você|sua|seu)\b/i, label: 'abertura condicional "Se você/sua equipe…"' },
  { re: /^existe um (tipo|momento|acordo)/i, label: 'abertura "Existe um tipo de…"' },
  { re: /^por que (insistimos|tratamos|tentamos)/i, label: 'pergunta "Por que insistimos/tratamos/tentamos…"' },
  { re: /planilha paralela|relat[oó]rio oficial/i, label: 'imagem "planilha paralela × relatório oficial"' },
  { re: /senso de dono/i, label: 'tema "senso de dono"' },
  { re: /cansa[cç]o/i, label: 'tema "cansaço"' },
  { re: /sil[eê]ncio/i, label: 'tema "silêncio"' },
];
export function repeatedStructures(texts: string[], min = 3): string[] {
  return STRUCTURES.map((s) => ({ label: s.label, n: texts.filter((t) => s.re.test(t.split(' — ')[0])).length }))
    .filter((x) => x.n >= min).sort((a, b) => b.n - a.n).map((x) => `${x.label} — ${x.n}× nas últimas frases`);
}

