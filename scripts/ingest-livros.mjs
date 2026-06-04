#!/usr/bin/env node
// Re-ingere Infinito.docx e O Lobo.docx em partes (split client-side).
// O ingest-document estourou compute pra docs > 60k chars — split em 20k.

import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';

const JWT = process.env.SUPABASE_JWT;
const SUPABASE_URL = 'https://djlorvdehedcupeykyes.supabase.co';
const PUBLISHABLE = 'sb_publishable_0sT1FC53gFrX4D-f8ViZBw_12G-JWa0';
const SPLIT_SIZE = 20000;

if (!JWT) {
  console.error('Faltou SUPABASE_JWT');
  process.exit(1);
}

const FILES = [
  {
    path: '/Users/raulmfaria/Downloads/10 - Conteúdos High Copy/Base de Inteligência/Livros/Infinito.docx',
    title: 'Livro: Infinito',
    tags: ['livro', 'referencia', 'infinito'],
  },
  {
    path: '/Users/raulmfaria/Downloads/10 - Conteúdos High Copy/Base de Inteligência/Livros/O Lobo.docx',
    title: 'Livro: O Lobo',
    tags: ['livro', 'referencia', 'o-lobo'],
  },
];

async function extractDocx(filepath) {
  const buffer = await readFile(filepath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Split por paragrafo, agregando ate SPLIT_SIZE chars
function smartSplit(text, target) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const parts = [];
  let buffer = '';
  for (const p of paras) {
    if (buffer.length + p.length + 2 <= target) {
      buffer = buffer ? `${buffer}\n\n${p}` : p;
    } else {
      if (buffer) parts.push(buffer);
      // se 1 paragrafo eh maior que target, parte ele forçadamente
      if (p.length > target) {
        for (let i = 0; i < p.length; i += target) {
          parts.push(p.slice(i, i + target));
        }
        buffer = '';
      } else {
        buffer = p;
      }
    }
  }
  if (buffer) parts.push(buffer);
  return parts;
}

async function ingest(title, text, metadata) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-document`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, text, source_type: 'docx', metadata }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

(async () => {
  for (const file of FILES) {
    console.log(`\n📕 ${file.title}`);
    const text = await extractDocx(file.path);
    console.log(`   tamanho: ${text.length} chars`);
    const parts = smartSplit(text, SPLIT_SIZE);
    console.log(`   dividido em ${parts.length} partes de ~${SPLIT_SIZE} chars`);

    for (let i = 0; i < parts.length; i++) {
      const partTitle = `${file.title} (parte ${i + 1}/${parts.length})`;
      try {
        const result = await ingest(partTitle, parts[i], {
          category: 'referencias-externas',
          tags: file.tags,
          book: file.title,
          part: i + 1,
          total_parts: parts.length,
        });
        console.log(`   ✅ parte ${i + 1}/${parts.length}: ${result.chunk_count} chunks`);
      } catch (e) {
        console.log(`   ❌ parte ${i + 1}/${parts.length}: ${e.message.slice(0, 150)}`);
      }
    }
  }
  console.log('\n🎉 Concluido.');
})();
