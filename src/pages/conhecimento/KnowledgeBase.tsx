// Pagina de Base de Conhecimento (RAG).
// Upload de TXT/MD/PDF/DOCX → extrai texto local → manda pra ingest-document.

import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  FileText,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { knowledgeApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import { detectType, extractText } from '@/lib/documentParser';
import type { KnowledgeDocument } from '@/types';
import { toast } from 'sonner';

export function KnowledgeBase() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const d = await knowledgeApi.list();
      setDocs(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocs();
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const type = detectType(file.name);
    if (!type) {
      toast.error('Tipo nao suportado. Use TXT, MD, PDF ou DOCX.');
      return;
    }
    setIngesting(true);
    const tId = toast.loading(`Extraindo texto de ${file.name}...`);
    try {
      const text = await extractText(file);
      if (text.trim().length < 50) {
        toast.dismiss(tId);
        toast.error('Texto extraido muito curto (<50 chars). Verifica o arquivo.');
        return;
      }
      toast.dismiss(tId);
      const t2 = toast.loading(`Ingerindo ${file.name} no RAG (gera embeddings)...`);
      const result = await edge.ingestDocument({
        title: file.name,
        text,
        source_type: type,
      });
      toast.dismiss(t2);
      toast.success(`${file.name}: ${result.chunk_count} chunks indexados`);
      await loadDocs();
    } catch (err) {
      toast.dismiss(tId);
      console.error(err);
      toast.error(`Falha: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setIngesting(false);
    }
  }

  async function handlePaste() {
    if (!pasteTitle.trim() || pasteText.trim().length < 50) {
      toast.error('Titulo + texto (>= 50 chars) obrigatorios.');
      return;
    }
    setIngesting(true);
    const tId = toast.loading('Ingerindo texto no RAG...');
    try {
      const result = await edge.ingestDocument({
        title: pasteTitle.trim(),
        text: pasteText,
        source_type: 'paste',
      });
      toast.dismiss(tId);
      toast.success(`${result.chunk_count} chunks indexados`);
      setPasteTitle('');
      setPasteText('');
      await loadDocs();
    } catch (err) {
      toast.dismiss(tId);
      toast.error(`Falha: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setIngesting(false);
    }
  }

  async function handleDelete(doc: KnowledgeDocument) {
    if (!confirm(`Apagar "${doc.title}" (e seus ${doc.chunk_count} chunks)?`)) return;
    try {
      await knowledgeApi.delete(doc.id);
      toast.success('Documento removido');
      await loadDocs();
    } catch (e) {
      toast.error('Erro ao apagar');
      console.error(e);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold">Base de Conhecimento</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Documentos ingeridos viram o motor da IA. Toda geracao busca aqui antes de escrever.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar documento
          </CardTitle>
          <CardDescription>TXT, MD, PDF ou DOCX. Texto e extraido local antes de ingerir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === 'file' ? 'accent' : 'outline'}
              size="sm"
              onClick={() => setMode('file')}
            >
              Upload arquivo
            </Button>
            <Button
              variant={mode === 'paste' ? 'accent' : 'outline'}
              size="sm"
              onClick={() => setMode('paste')}
            >
              Colar texto
            </Button>
          </div>

          {mode === 'file' && (
            <div
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-accent transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {ingesting ? 'Processando...' : 'Clique pra escolher um arquivo'}
                </p>
                <p className="text-xs text-muted-foreground">.txt .md .pdf .docx</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.pdf,.docx"
                onChange={handleFile}
                className="hidden"
                disabled={ingesting}
              />
            </div>
          )}

          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="paste-title">Titulo</Label>
                <Input
                  id="paste-title"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Ex: Tom de voz Bee, Valores, Exemplos de bons posts..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paste-text">Texto</Label>
                <Textarea
                  id="paste-text"
                  rows={10}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Cola o conteudo aqui..."
                />
                <p className="text-xs text-muted-foreground">{pasteText.length} chars</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={handlePaste} disabled={ingesting} variant="accent">
                  {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Ingerir
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documentos ({docs.length})</CardTitle>
          <CardDescription>
            Total de chunks indexados: {docs.reduce((s, d) => s + d.chunk_count, 0)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-6 w-6" />
              Nenhum documento ingerido. Adiciona o primeiro acima.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize">{d.source_type ?? '?'}</Badge>
                      <span>{d.chunk_count} chunks</span>
                      {d.source_size && <span>· {Math.round(d.source_size / 1024)} KB</span>}
                      <span>· {new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(d)}
                    title="Apagar"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
