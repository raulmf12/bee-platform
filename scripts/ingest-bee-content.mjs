#!/usr/bin/env node
// Ingestao automatizada da pasta "10 - Conteudos High Copy" no RAG.
// Uso: SUPABASE_JWT=eyJ... node scripts/ingest-bee-content.mjs [content_root]
//
// Le todos os .txt/.md/.docx/.pdf da pasta, deduplica por hash MD5,
// pula arquivos de Marilia, chunkifica e chama a edge function ingest-document.
// Tambem cria SQL aux pra popular tabelas estruturadas (content_pillars, etc).

import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, basename, dirname, extname, relative } from 'node:path';
import mammoth from 'mammoth';
// pdf-parse e pdfjs sao tratados sob demanda dentro de extractPdf

const CONTENT_ROOT = process.argv[2]
  ?? '/Users/raulmfaria/Downloads/10 - Conteúdos High Copy';
const JWT = process.env.SUPABASE_JWT;
const SUPABASE_URL = 'https://djlorvdehedcupeykyes.supabase.co';
const PUBLISHABLE = 'sb_publishable_0sT1FC53gFrX4D-f8ViZBw_12G-JWa0';

if (!JWT) {
  console.error('Faltou env SUPABASE_JWT.');
  console.error('Pega no DevTools localStorage > sb-djlorvdehedcupeykyes-auth-token > access_token');
  process.exit(1);
}

// ----- categorizacao por caminho ---------------------------------------------
function categorize(relPath) {
  const p = relPath.toLowerCase();
  // pula explicitamente
  if (p.includes('marilia') || p.includes('marília')) return { skip: true, reason: 'Marilia removida do projeto' };

  // pula duplicados Launch MC (mantem so a versao FLS/)
  if (p.includes('launch mc - mar26/fls aulas/')) return { skip: true, reason: 'Duplicado FLS Aulas' };
  if (p.includes('launch mc - mar26/depoimentos/depoimentos fls t2')) return { skip: true, reason: 'Duplicado Depoimentos FLS' };
  if (p.includes('launch mc - mar26/guia de desenvolvimento/')) return { skip: true, reason: 'Duplicado Guia' };
  if (p.includes('launch mc - mar26/masterclass/')) return { skip: true, reason: 'Duplicado Masterclass' };
  if (p.includes('launch mc - mar26/revisao promessa') || p.includes('launch mc - mar26/revisão promessa')) return { skip: true, reason: 'Duplicado Revisao' };

  // categorias por path
  if (p.includes('fls aulas/aula')) {
    const match = relPath.match(/Aula\s+(\d+).*-\s*(.+?)\.txt/i);
    const titulo = match ? `Aula ${match[1]} - ${match[2]}` : basename(relPath);
    return {
      category: 'metodologia-processo',
      tags: ['fls', 'aula', '6-dimensoes'],
      title: titulo,
    };
  }
  if (p.includes('podcast/') && p.includes('cortes/')) {
    return {
      category: 'metodologia-processo',
      tags: ['podcast', 'corte', 'autorresponsabilidade'],
      title: `Podcast Corte: ${basename(relPath, extname(relPath))}`,
    };
  }
  if (p.includes('podcast/')) {
    return {
      category: 'metodologia-processo',
      tags: ['podcast', 'episodio-completo'],
      title: `Podcast: ${basename(relPath, extname(relPath))}`,
    };
  }
  if (p.includes('cases/')) {
    return {
      category: 'cases-clientes',
      tags: ['case', 'cliente', 'transformacao'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('depoimentos')) {
    return {
      category: 'cases-clientes',
      tags: ['depoimento', 'testimonial'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('masterclass/')) {
    return {
      category: 'metodologia-processo',
      tags: ['masterclass', '6-dimensoes'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('palestra unip')) {
    return {
      category: 'metodologia-processo',
      tags: ['palestra', 'piccini', 'unip'],
      title: 'Palestra UNIP - Marcos Piccini',
    };
  }
  if (p.includes('marcos piccini') || p.includes('marcos/')) {
    return {
      category: 'fundador-historia',
      tags: ['marcos-piccini', 'persona'],
      title: basename(relPath, extname(relPath)),
      updates_persona: 'marcos',
    };
  }
  if (p.includes('livros/')) {
    return {
      category: 'referencias-externas',
      tags: ['livro', 'referencia'],
      title: `Livro: ${basename(relPath, extname(relPath))}`,
    };
  }
  if (p.includes('tacc/')) {
    return {
      category: 'referencias-externas',
      tags: ['tacc', 'conceito'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('promessa, avatar') || p.includes('avatar')) {
    return {
      category: 'pilares-conteudo',
      tags: ['avatar', 'promessa', 'dores'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('premissas/')) {
    if (p.includes('estilo') || p.includes('guia de conteudo') || p.includes('guia de voz')) {
      return {
        category: 'brand-voice',
        tags: ['voz', 'estilo', 'tom'],
        title: basename(relPath, extname(relPath)),
        is_voice_primary: true,
      };
    }
    if (p.includes('logicas desconstrutivas') || p.includes('lógicas desconstrutivas')) {
      return {
        category: 'regras-do-fazer',
        tags: ['regras', 'logica-desconstrutiva'],
        title: basename(relPath, extname(relPath)),
      };
    }
    if (p.includes('temas e visoes') || p.includes('temas e visões')) {
      return {
        category: 'pilares-conteudo',
        tags: ['temas', 'visoes', 'pilares'],
        title: basename(relPath, extname(relPath)),
        is_pillars_source: true,
      };
    }
    return {
      category: 'metodologia-processo',
      tags: ['premissa'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('conteúdos/') || p.includes('conteudos/')) {
    return {
      category: 'exemplos-posts',
      tags: ['exemplo', 'post-real'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('claude/')) {
    if (p.includes('guia de voz')) {
      return {
        category: 'brand-voice',
        tags: ['voz', 'guia-claude'],
        title: 'Guia de Voz (Claude)',
        is_voice_primary: true,
      };
    }
    return {
      category: 'exemplos-posts',
      tags: ['conteudo-claude'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('artigos/')) {
    return {
      category: 'metodologia-processo',
      tags: ['artigo', 'manifesto'],
      title: basename(relPath, extname(relPath)),
    };
  }
  if (p.includes('guia de desenvolvimento')) {
    return {
      category: 'metodologia-processo',
      tags: ['guia', 'lideranca-sistemica'],
      title: 'Guia de Desenvolvimento - Lideranca Sistemica',
    };
  }
  if (p.includes('setup masterclass')) {
    return {
      category: 'metodologia-processo',
      tags: ['masterclass', 'setup'],
      title: 'Setup Masterclass',
    };
  }
  if (p.includes('ideias de conteúdo') || p.includes('ideias de conteudo')) {
    return {
      category: 'pilares-conteudo',
      tags: ['ideias', 'temas'],
      title: 'Ideias de conteudo',
    };
  }
  return {
    category: 'metodologia-processo',
    tags: ['outros'],
    title: basename(relPath, extname(relPath)),
  };
}

// ----- extracao de texto -----------------------------------------------------
async function extractTxt(filepath) {
  return await readFile(filepath, 'utf-8');
}

async function extractDocx(filepath) {
  const buffer = await readFile(filepath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractPdf(filepath) {
  // usa pdftotext do poppler se disponivel; senao pdf-parse
  const { execSync } = await import('node:child_process');
  try {
    return execSync(`pdftotext -layout "${filepath}" -`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch {
    try {
      const pdf = (await import('pdf-parse')).default;
      const buf = await readFile(filepath);
      const d = await pdf(buf);
      return d.text;
    } catch (e) {
      throw new Error(`Falha PDF: ${e.message}`);
    }
  }
}

async function extractText(filepath) {
  const ext = extname(filepath).toLowerCase();
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') return extractTxt(filepath);
  if (ext === '.docx') return extractDocx(filepath);
  if (ext === '.pdf') return extractPdf(filepath);
  throw new Error(`Ext nao suportada: ${ext}`);
}

// ----- walk recursivo --------------------------------------------------------
async function walk(dir) {
  const out = [];
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...await walk(full));
    else {
      const ext = extname(item.name).toLowerCase();
      if (['.txt', '.md', '.markdown', '.docx', '.pdf'].includes(ext)) out.push(full);
    }
  }
  return out;
}

// ----- ingest via edge function ---------------------------------------------
async function ingest(title, text, source_type, metadata) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-document`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, text, source_type, metadata }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt);
}

// ----- main ------------------------------------------------------------------
async function main() {
  console.log(`📂 Lendo: ${CONTENT_ROOT}`);
  const files = await walk(CONTENT_ROOT);
  console.log(`📄 Encontrados ${files.length} arquivos`);

  // deduplica por hash
  const byHash = new Map();
  for (const f of files) {
    const buf = await readFile(f);
    const h = createHash('md5').update(buf).digest('hex');
    if (!byHash.has(h)) byHash.set(h, f);
  }
  const unique = Array.from(byHash.values()).sort();
  console.log(`✨ Únicos (após dedup MD5): ${unique.length}\n`);

  let okCount = 0, skipCount = 0, errCount = 0;
  let totalChunks = 0;
  const report = [];

  for (let i = 0; i < unique.length; i++) {
    const filepath = unique[i];
    const rel = relative(CONTENT_ROOT, filepath);
    const cat = categorize(rel);

    if (cat.skip) {
      console.log(`[${i + 1}/${unique.length}] ⏭️  ${rel}\n      ↳ pulando: ${cat.reason}`);
      skipCount++;
      continue;
    }

    try {
      const text = await extractText(filepath);
      if (!text || text.trim().length < 50) {
        console.log(`[${i + 1}/${unique.length}] ⚠️  ${rel}\n      ↳ texto muito curto (${text?.length ?? 0} chars), pulando`);
        skipCount++;
        continue;
      }

      const result = await ingest(cat.title, text, extname(filepath).slice(1), {
        category: cat.category,
        tags: cat.tags,
        relative_path: rel,
        ...(cat.updates_persona ? { updates_persona: cat.updates_persona } : {}),
        ...(cat.is_voice_primary ? { is_voice_primary: true } : {}),
        ...(cat.is_pillars_source ? { is_pillars_source: true } : {}),
      });

      console.log(`[${i + 1}/${unique.length}] ✅ ${cat.title}\n      ↳ cat: ${cat.category} | chunks: ${result.chunk_count} | tags: ${cat.tags.join(',')}`);
      okCount++;
      totalChunks += result.chunk_count;
      report.push({ idx: i + 1, title: cat.title, category: cat.category, chunks: result.chunk_count, path: rel });
    } catch (e) {
      console.log(`[${i + 1}/${unique.length}] ❌ ${rel}\n      ↳ erro: ${e.message.slice(0, 200)}`);
      errCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}\nRESUMO FINAL`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Ingeridos: ${okCount}`);
  console.log(`⏭️  Pulados:  ${skipCount}`);
  console.log(`❌ Erros:    ${errCount}`);
  console.log(`📊 Total de chunks indexados: ${totalChunks}`);

  // resumo por categoria
  const byCat = {};
  for (const r of report) {
    if (!byCat[r.category]) byCat[r.category] = { docs: 0, chunks: 0 };
    byCat[r.category].docs++;
    byCat[r.category].chunks += r.chunks;
  }
  console.log(`\n📚 Por categoria:`);
  for (const [c, s] of Object.entries(byCat).sort((a, b) => b[1].chunks - a[1].chunks)) {
    console.log(`   ${c.padEnd(25)} ${String(s.docs).padStart(3)} docs | ${String(s.chunks).padStart(4)} chunks`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
