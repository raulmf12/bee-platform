// Diretrizes de Criação — a "mão" que trabalha junto do Genesis (a "mente").
// O ofício concreto: COMO escrever de fato. 3 escopos (universal, plataforma,
// linha editorial) × 5 tipos com FUNÇÃO no prompt e forma própria na tela:
//   regra · fluxo (ordenado) · fortalecer/evitar (colunas verde/vermelho) ·
//   critério (entra na autochecagem/QA).
// Cores herdadas do tema (claro/escuro).

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { directivesApi, beeApi } from '@/lib/api';
import type { BeeDirective, DirectiveScope, DirectiveTipo, BeeEditorial } from '@/types';
import { toast } from 'sonner';

const CSS = `
.dir-root{--g-fg:hsl(var(--foreground));--g-card:hsl(var(--card));--g-sec:hsl(var(--secondary));--g-muted:hsl(var(--muted));--g-mfg:hsl(var(--muted-foreground));--g-accent:hsl(var(--accent));--g-afg:hsl(var(--accent-foreground));--g-border:hsl(var(--border));--g-warn:#c17c72;--g-good:#5aa87a;--g-blue:#5b8bb0;color:var(--g-fg);font-family:Inter,system-ui,sans-serif}
.dir-root .page{max-width:1080px;margin:0 auto;padding:30px 24px 64px}
.dir-root h1,.dir-root h2{font-family:'Plus Jakarta Sans',Inter,sans-serif;letter-spacing:-.02em}
.dir-root .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.dir-root .head h1{font-size:28px;font-weight:700;display:flex;align-items:center;gap:10px}
.dir-root .hex{width:24px;height:24px;color:var(--g-accent)}
.dir-root .sub{margin-top:6px;font-size:13.5px;color:var(--g-mfg);max-width:700px;line-height:1.5}
.dir-root .badge{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--g-good);background:hsl(var(--accent)/0.10);border:1px solid var(--g-accent);border-radius:999px;padding:5px 11px;white-space:nowrap}
.dir-root .card{background:var(--g-card);border:1px solid var(--g-border);border-radius:12px}
.dir-root .pad{padding:16px 18px}
.dir-root .accent{border-color:hsl(var(--accent)/0.35);background:hsl(var(--accent)/0.05)}
.dir-root .sec{margin-top:24px}
.dir-root .sl{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.dir-root .sl h2{font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.dir-root .sl .ic{color:var(--g-accent)}
.dir-root .sl .d{font-size:12px;color:var(--g-mfg)}
.dir-root .btn{font-size:11.5px;font-weight:600;color:var(--g-afg);background:var(--g-accent);border:1px solid var(--g-accent);border-radius:8px;padding:5px 12px;cursor:pointer}
.dir-root .btn:hover{filter:brightness(1.05)}
.dir-root .btn:disabled{opacity:.6;cursor:default}
.dir-root .btn.ghost{background:transparent;color:var(--g-mfg);border-color:var(--g-border)}
.dir-root .barhead{display:flex;align-items:center;gap:10px;margin-top:10px}
.dir-root textarea,.dir-root input.tin{width:100%;font:inherit;font-size:13.5px;line-height:1.5;color:var(--g-fg);background:hsl(var(--accent)/0.05);border:1px solid var(--g-border);border-radius:8px;padding:8px 10px;resize:vertical}
.dir-root textarea:focus,.dir-root input.tin:focus{outline:none;box-shadow:0 0 0 2px var(--g-accent)}
/* accordion (plataforma / editorial) */
.dir-root .pgroup{border-bottom:1px solid var(--g-border)}
.dir-root .pgroup:last-child{border-bottom:0}
.dir-root button.pgh{display:flex;align-items:center;gap:9px;width:100%;background:none;border:0;color:inherit;text-align:left;cursor:pointer;padding:13px 2px}
.dir-root button.pgh:hover .n{color:var(--g-accent)}
.dir-root .pgh .chev{color:var(--g-accent);font-size:11px;width:12px;flex:none}
.dir-root .pgh .n{font-family:'Plus Jakarta Sans';font-weight:700;font-size:14.5px}
.dir-root .pgh .cnt{font-size:10px;font-weight:700;color:var(--g-accent);background:hsl(var(--accent)/0.12);border-radius:999px;padding:1px 7px;flex:none}
.dir-root .pgh .cnt.zero{color:var(--g-mfg);background:var(--g-muted)}
.dir-root .pgh .d{font-size:11.5px;color:var(--g-mfg);margin-left:auto;text-align:right;padding-left:10px}
.dir-root .pbody{padding:4px 2px 14px 14px}
/* typed sub-section */
.dir-root .ts{margin-top:14px}
.dir-root .ts:first-child{margin-top:6px}
.dir-root .tsh{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.dir-root .tsh .tg{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:6px}
.dir-root .tsh .hint{font-size:11px;color:var(--g-mfg)}
.dir-root .tsh .qa{font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--g-blue);border:1px solid var(--g-blue);border-radius:5px;padding:1px 6px;margin-left:auto}
.dir-root .tg.regra{color:var(--g-accent);background:hsl(var(--accent)/0.12)}
.dir-root .tg.fluxo{color:var(--g-accent);background:hsl(var(--accent)/0.12)}
.dir-root .tg.fortalecer{color:var(--g-good);background:rgba(90,168,122,.14)}
.dir-root .tg.evitar{color:var(--g-warn);background:rgba(193,124,114,.14)}
.dir-root .tg.criterio{color:var(--g-blue);background:rgba(91,139,176,.14)}
.dir-root .tg.parametro{color:var(--g-mfg);background:var(--g-muted)}
/* rows */
.dir-root .row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid hsl(var(--border)/0.6);align-items:flex-start}
.dir-root .row:last-child{border-bottom:0}
.dir-root .row.off{opacity:.38}
.dir-root .row .gl{font-size:13px;font-weight:800;line-height:1.5;flex:none;width:18px;text-align:center}
.dir-root .row .gl.good{color:var(--g-good)}.dir-root .row .gl.warn{color:var(--g-warn)}.dir-root .row .gl.blue{color:var(--g-blue)}.dir-root .row .gl.acc{color:var(--g-accent)}
.dir-root .row .num{font-family:'Plus Jakarta Sans';font-weight:800;color:var(--g-accent);font-size:13px;flex:none;width:18px;text-align:center}
.dir-root .row .body{flex:1;min-width:0}
.dir-root .row .ti{font-family:'Plus Jakarta Sans';font-weight:700;font-size:12px;margin-bottom:1px}
.dir-root .row .txt{font-size:13px;line-height:1.5}
.dir-root .row .inv{font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--g-card);background:var(--g-fg);border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle}
.dir-root .row .acts{display:flex;gap:5px;align-items:flex-start;opacity:0;transition:opacity .12s}
.dir-root .row:hover .acts{opacity:1}
.dir-root .lnk{font-size:10.5px;font-weight:600;color:var(--g-accent);background:none;border:0;cursor:pointer;padding:2px 3px}
.dir-root .lnk.off{color:var(--g-warn)}
.dir-root .lnk.del{color:var(--g-warn)}
.dir-root .empty{font-size:12px;color:var(--g-mfg);font-style:italic;padding:5px 0}
.dir-root .dd{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.dir-root .dd{grid-template-columns:1fr}}
.dir-root .addlnk{margin-top:7px;font-size:11px;font-weight:600;color:var(--g-accent);background:none;border:1px dashed hsl(var(--accent)/0.4);border-radius:7px;padding:5px 10px;cursor:pointer}
.dir-root .addlnk:hover{background:hsl(var(--accent)/0.06)}
.dir-root .addform{margin-top:8px;padding:10px;border:1px dashed var(--g-border);border-radius:9px;background:hsl(var(--accent)/0.03)}
.dir-root .ck{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--g-mfg);margin-top:8px;cursor:pointer;user-select:none}
.dir-root .ck input{accent-color:var(--g-accent)}
`;

type Draft = { titulo: string; instrucao: string; inviolavel: boolean };
const EMPTY: Draft = { titulo: '', instrucao: '', inviolavel: false };

const PLATFORMS = [
  { ref: 'linkedin', label: 'LinkedIn', desc: 'o cognitivo — a pessoa pensa' },
  { ref: 'instagram', label: 'Instagram', desc: 'o perceptivo — sente e depois pensa' },
];

// Ordem de render + metadados por tipo. 'parametro' fica fora do fluxo padrão
// (UI dedicada ainda não construída), mas linhas existentes ainda aparecem.
const TIPO_META: Record<DirectiveTipo, { label: string; hint: string; glyph: string; glyphCls: string; isQa?: boolean; numbered?: boolean }> = {
  regra: { label: 'Regras', hint: 'o que sempre vale ao escrever', glyph: '§', glyphCls: 'acc' },
  fluxo: { label: 'Fluxo / estrutura', hint: 'os passos, na ordem', glyph: '', glyphCls: 'acc', numbered: true },
  fortalecer: { label: 'Fortalecer', hint: 'o que priorizar', glyph: '✓', glyphCls: 'good' },
  evitar: { label: 'Evitar', hint: 'proibições', glyph: '✗', glyphCls: 'warn' },
  criterio: { label: 'Critérios de excelência', hint: 'checados na geração', glyph: '▸', glyphCls: 'blue', isQa: true },
  parametro: { label: 'Parâmetros', hint: 'valores concretos', glyph: '•', glyphCls: 'acc' },
};

export function Directives() {
  const [dirs, setDirs] = useState<BeeDirective[]>([]);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState<Set<string>>(new Set(['platform:linkedin']));
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [addKey, setAddKey] = useState<string | null>(null); // `${scopeKey}::${tipo}`
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([directivesApi.list(), beeApi.editorials()])
      .then(([d, e]) => { if (alive) { setDirs(d); setEditorials(e); } })
      .catch((x) => alive && setErr(x instanceof Error ? x.message : 'Erro ao carregar'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const byKey = useMemo(() => {
    const m: Record<string, BeeDirective[]> = {};
    dirs.forEach((d) => {
      const k = d.scope === 'universal' ? 'universal' : `${d.scope}:${d.scope_ref}`;
      (m[k] ??= []).push(d);
    });
    return m;
  }, [dirs]);

  function toggle(k: string) {
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  async function saveAdd(scope: DirectiveScope, scope_ref: string | null, tipo: DirectiveTipo, scopeKey: string) {
    const instrucao = addDraft.instrucao.trim();
    if (!instrucao) return;
    setBusy(true);
    try {
      const sameTipo = (byKey[scopeKey] ?? []).filter((d) => d.tipo === tipo);
      const nextOrdem = (sameTipo[sameTipo.length - 1]?.ordem ?? sameTipo.length) + 1;
      const created = await directivesApi.create({
        scope, scope_ref, tipo, inviolavel: tipo === 'regra' ? addDraft.inviolavel : false,
        titulo: addDraft.titulo.trim() || null, instrucao, ordem: nextOrdem,
      });
      setDirs((s) => [...s, created]);
      setAddDraft(EMPTY); setAddKey(null);
      toast.success('Diretriz adicionada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally { setBusy(false); }
  }

  async function saveEdit(d: BeeDirective) {
    try {
      const updated = await directivesApi.update(d.id, {
        titulo: editDraft.titulo.trim() || null,
        instrucao: editDraft.instrucao.trim() || d.instrucao,
        inviolavel: d.tipo === 'regra' ? editDraft.inviolavel : d.inviolavel,
      });
      setDirs((s) => s.map((x) => x.id === d.id ? updated : x));
      setEditId(null);
      toast.success('Diretriz atualizada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function toggleActive(d: BeeDirective) {
    try {
      const updated = await directivesApi.update(d.id, { ativo: !d.ativo });
      setDirs((s) => s.map((x) => x.id === d.id ? updated : x));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); }
  }

  async function remove(d: BeeDirective) {
    if (!confirm('Remover esta diretriz?')) return;
    try {
      await directivesApi.remove(d.id);
      setDirs((s) => s.filter((x) => x.id !== d.id));
      toast.success('Diretriz removida.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); }
  }

  // Uma linha (diretriz), estilizada pelo tipo. `n` = índice (fluxo numerado).
  function Row({ d, n }: { d: BeeDirective; n: number }) {
    const meta = TIPO_META[d.tipo];
    const editing = editId === d.id;
    return (
      <div className={`row ${d.ativo ? '' : 'off'}`}>
        {meta.numbered
          ? <span className="num">{n}</span>
          : <span className={`gl ${meta.glyphCls}`}>{meta.glyph}</span>}
        <div className="body">
          {editing ? (
            <>
              <input className="tin" placeholder="título (opcional)" value={editDraft.titulo}
                onChange={(e) => setEditDraft((s) => ({ ...s, titulo: e.target.value }))} />
              <textarea rows={3} style={{ marginTop: 6 }} value={editDraft.instrucao}
                onChange={(e) => setEditDraft((s) => ({ ...s, instrucao: e.target.value }))} />
              {d.tipo === 'regra' && (
                <label className="ck"><input type="checkbox" checked={editDraft.inviolavel}
                  onChange={(e) => setEditDraft((s) => ({ ...s, inviolavel: e.target.checked }))} /> regra inviolável (⛔)</label>
              )}
              <div className="barhead">
                <button className="btn" onClick={() => void saveEdit(d)}>✓ salvar</button>
                <button className="btn ghost" onClick={() => setEditId(null)}>cancelar</button>
              </div>
            </>
          ) : (
            <>
              {d.titulo && <div className="ti">{d.titulo}</div>}
              <div className="txt">{d.instrucao}{d.inviolavel && <span className="inv">inviolável</span>}</div>
            </>
          )}
        </div>
        {!editing && (
          <div className="acts">
            <button className="lnk" onClick={() => { setEditDraft({ titulo: d.titulo ?? '', instrucao: d.instrucao, inviolavel: d.inviolavel }); setEditId(d.id); }}>editar</button>
            <button className={`lnk ${d.ativo ? 'off' : ''}`} onClick={() => void toggleActive(d)}>{d.ativo ? 'desligar' : 'ligar'}</button>
            <button className="lnk del" onClick={() => void remove(d)}>excluir</button>
          </div>
        )}
      </div>
    );
  }

  // Uma sub-seção por TIPO dentro de um escopo. Sempre renderiza (mesmo vazia)
  // pra você poder adicionar o primeiro item de qualquer tipo.
  function TypeSection({ scope, scope_ref, scopeKey, tipo }: {
    scope: DirectiveScope; scope_ref: string | null; scopeKey: string; tipo: DirectiveTipo;
  }) {
    const meta = TIPO_META[tipo];
    const items = (byKey[scopeKey] ?? []).filter((d) => d.tipo === tipo);
    const k = `${scopeKey}::${tipo}`;
    return (
      <div className="ts">
        <div className="tsh">
          <span className={`tg ${tipo}`}>{meta.label}</span>
          <span className="hint">{meta.hint}</span>
          {meta.isQa && <span className="qa">autochecagem</span>}
        </div>
        {items.length
          ? items.map((d, i) => <Row key={d.id} d={d} n={i + 1} />)
          : <div className="empty">—</div>}
        {addKey === k ? (
          <div className="addform">
            <input className="tin" placeholder="título (opcional, ex: Gancho, O leitor…)" value={addDraft.titulo}
              onChange={(e) => setAddDraft((s) => ({ ...s, titulo: e.target.value }))} />
            <textarea rows={3} style={{ marginTop: 6 }} placeholder={`nova diretriz do tipo "${meta.label}"…`} value={addDraft.instrucao}
              onChange={(e) => setAddDraft((s) => ({ ...s, instrucao: e.target.value }))} />
            {tipo === 'regra' && (
              <label className="ck"><input type="checkbox" checked={addDraft.inviolavel}
                onChange={(e) => setAddDraft((s) => ({ ...s, inviolavel: e.target.checked }))} /> regra inviolável (⛔)</label>
            )}
            <div className="barhead">
              <button className="btn" disabled={busy} onClick={() => void saveAdd(scope, scope_ref, tipo, scopeKey)}>{busy ? 'salvando…' : '✓ adicionar'}</button>
              <button className="btn ghost" disabled={busy} onClick={() => { setAddKey(null); setAddDraft(EMPTY); }}>cancelar</button>
            </div>
          </div>
        ) : (
          <button className="addlnk" onClick={() => { setAddKey(k); setAddDraft(EMPTY); }}>+ {meta.label.toLowerCase()}</button>
        )}
      </div>
    );
  }

  // O corpo de um escopo: as 5 sub-seções tipadas (Fortalecer/Evitar lado a lado).
  function ScopeBody({ scope, scope_ref, scopeKey }: { scope: DirectiveScope; scope_ref: string | null; scopeKey: string }) {
    const has = (t: DirectiveTipo) => (byKey[scopeKey] ?? []).some((d) => d.tipo === t);
    const common = { scope, scope_ref, scopeKey };
    return (
      <>
        <TypeSection {...common} tipo="regra" />
        <TypeSection {...common} tipo="fluxo" />
        <div className="dd">
          <TypeSection {...common} tipo="fortalecer" />
          <TypeSection {...common} tipo="evitar" />
        </div>
        <TypeSection {...common} tipo="criterio" />
        {has('parametro') && <TypeSection {...common} tipo="parametro" />}
      </>
    );
  }

  function Accordion({ k, label, desc, scope, scope_ref }: {
    k: string; label: string; desc: string; scope: DirectiveScope; scope_ref: string | null;
  }) {
    const count = (byKey[k] ?? []).length;
    const isOpen = open.has(k);
    return (
      <div className="pgroup">
        <button className="pgh" aria-expanded={isOpen} onClick={() => toggle(k)}>
          <span className="chev">{isOpen ? '▾' : '▸'}</span>
          <span className="n">{label}</span>
          <span className={`cnt ${count ? '' : 'zero'}`}>{count}</span>
          <span className="d">{desc}</span>
        </button>
        {isOpen && <div className="pbody"><ScopeBody scope={scope} scope_ref={scope_ref} scopeKey={k} /></div>}
      </div>
    );
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }
  if (err) {
    return <div className="dir-root"><style>{CSS}</style><div className="page"><p className="sub">Não consegui carregar as Diretrizes: {err}</p></div></div>;
  }

  return (
    <div className="dir-root">
      <style>{CSS}</style>
      <div className="page">
        <div className="head">
          <div>
            <h1>
              <svg className="hex" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M4 20 L12 4 L20 20" /><path d="M7.5 13 H16.5" />
              </svg>
              Diretrizes de Criação
            </h1>
            <p className="sub">
              O <b>ofício</b> — como escrever de fato, trabalhando junto do Genesis (a filosofia). Cada diretriz tem um
              <b> tipo</b> com função real no prompt: <span style={{ color: 'var(--g-accent)' }}>regras</span>,{' '}
              <span style={{ color: 'var(--g-accent)' }}>fluxo</span>,{' '}
              <span style={{ color: 'var(--g-good)' }}>fortalecer</span> /{' '}
              <span style={{ color: 'var(--g-warn)' }}>evitar</span>, e{' '}
              <span style={{ color: 'var(--g-blue)' }}>critérios</span> (que viram a autochecagem da IA).
            </p>
          </div>
          <span className="badge">● {dirs.length} diretrizes</span>
        </div>

        {/* UNIVERSAL */}
        <div className="sec">
          <div className="sl"><span className="ic">◆</span><h2>Universal</h2><span className="d">vale para todo post, em qualquer plataforma</span></div>
          <div className="card accent pad">
            <ScopeBody scope="universal" scope_ref={null} scopeKey="universal" />
          </div>
        </div>

        {/* POR PLATAFORMA */}
        <div className="sec">
          <div className="sl"><span className="ic">◧</span><h2>Por plataforma</h2><span className="d">cada canal cumpre uma função diferente</span></div>
          <div className="card pad">
            {PLATFORMS.map((p) => (
              <Accordion key={p.ref} k={`platform:${p.ref}`} label={p.label} desc={p.desc} scope="platform" scope_ref={p.ref} />
            ))}
          </div>
        </div>

        {/* POR LINHA EDITORIAL */}
        <div className="sec">
          <div className="sl"><span className="ic">§</span><h2>Por linha editorial</h2><span className="d">o craft específico de cada pilar</span></div>
          <div className="card pad">
            {editorials.length ? editorials.map((e) => (
              <Accordion key={e.slug} k={`editorial:${e.slug}`} label={e.name} desc={e.slug} scope="editorial" scope_ref={e.slug} />
            )) : <div className="empty">Nenhuma editoria ativa.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
