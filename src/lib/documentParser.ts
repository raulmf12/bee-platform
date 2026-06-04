// Extrai texto puro de arquivos enviados pelo user: TXT, MD, PDF, DOCX.
// Roda 100% no client. Sem upload do binario — so o texto vai pro backend.

import mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Worker do PDF.js carregado via Vite ?url
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type SupportedType = 'txt' | 'md' | 'pdf' | 'docx';

export function detectType(filename: string): SupportedType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return null;
}

export async function extractText(file: File): Promise<string> {
  const type = detectType(file.name);
  if (!type) throw new Error(`Tipo nao suportado: ${file.name}`);

  switch (type) {
    case 'txt':
    case 'md':
      return file.text();

    case 'pdf': {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? (item as { str: string }).str : ''))
          .join(' ');
        parts.push(text);
      }
      return parts.join('\n\n').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    }

    case 'docx': {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      return result.value;
    }
  }
}
