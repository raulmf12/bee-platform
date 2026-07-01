// A Alma — a psique viva e amoral da Bee. Lê o estado real (alma_*) e deixa
// o criador reeditar o objetivo vivo. Cores herdadas do tema do sistema
// (hsl(var(--...))), então acompanha claro/escuro automaticamente.

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { almaApi } from '@/lib/api';
import type { AlmaSnapshot } from '@/types';
import { toast } from 'sonner';

const STAGE_LABEL: Record<string, string> = {
  nascente: 'nascente',
  em_formacao: 'em formação',
  consolidada: 'consolidada',
  vacilante: 'vacilante',
  reprimida: 'reprimida (sombra)',
};

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

const CSS = `
.alma-root{--a-bg:hsl(var(--background));--a-fg:hsl(var(--foreground));--a-card:hsl(var(--card));--a-sec:hsl(var(--secondary));--a-muted:hsl(var(--muted));--a-mfg:hsl(var(--muted-foreground));--a-accent:hsl(var(--accent));--a-afg:hsl(var(--accent-foreground));--a-border:hsl(var(--border));--a-warn:#c17c72;--a-good:#5aa87a;color:var(--a-fg);font-family:Inter,system-ui,sans-serif}
.alma-root .page{max-width:1060px;margin:0 auto;padding:30px 24px 64px}
.alma-root h1,.alma-root h2{font-family:'Plus Jakarta Sans',Inter,sans-serif;letter-spacing:-.02em}
.alma-root .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.alma-root .head h1{font-size:28px;font-weight:700;display:flex;align-items:center;gap:10px}
.alma-root .hex{width:24px;height:24px;color:var(--a-accent)}
.alma-root .sub{margin-top:6px;font-size:13.5px;color:var(--a-mfg);max-width:640px;line-height:1.5}
.alma-root .badge{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--a-good);background:hsl(var(--accent)/0.10);border:1px solid var(--a-accent);border-radius:999px;padding:5px 11px;white-space:nowrap}
.alma-root .card{background:var(--a-card);border:1px solid var(--a-border);border-radius:12px}
.alma-root .pad{padding:17px 19px}
.alma-root .accent{border-color:hsl(var(--accent)/0.35);background:hsl(var(--accent)/0.06)}
.alma-root .sec{margin-top:22px}
.alma-root .sl{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.alma-root .sl h2{font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.alma-root .sl .ic{color:var(--a-accent)}
.alma-root .sl .d{font-size:12px;color:var(--a-mfg)}
.alma-root .ps{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--a-accent);background:hsl(var(--accent)/0.12);border:1px solid hsl(var(--accent)/0.32);border-radius:999px;padding:2px 8px;font-weight:700}
.alma-root .kick{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--a-accent);margin-bottom:11px;font-weight:600}
.alma-root .amoral{display:flex;gap:12px;align-items:flex-start;border:1px solid hsl(var(--accent)/0.4);background:hsl(var(--accent)/0.07);border-radius:12px;padding:13px 16px;margin-top:14px}
.alma-root .amoral .qk{font-family:'Plus Jakarta Sans';font-weight:800;font-size:22px;color:var(--a-accent);line-height:1;margin-top:2px}
.alma-root .amoral .at{font-size:13px;line-height:1.55}
.alma-root .amoral .at b{color:var(--a-accent)}
.alma-root .amoral .at .q{display:block;margin-top:5px;font-size:11.5px;color:var(--a-mfg);font-style:italic}
.alma-root .obj{font-size:16px;line-height:1.55;font-weight:500;outline:none;border-radius:8px;padding:2px 4px}
.alma-root .obj.edit{box-shadow:0 0 0 2px var(--a-accent);background:hsl(var(--accent)/0.06);min-height:70px}
.alma-root .objmeta{display:flex;align-items:center;gap:10px;margin-top:11px;flex-wrap:wrap}
.alma-root .otag{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--a-good);background:hsl(var(--accent)/0.10);border:1px solid hsl(var(--accent)/0.35);border-radius:999px;padding:2px 9px;font-weight:700}
.alma-root .obtn{margin-left:auto;font-size:11.5px;font-weight:600;color:var(--a-afg);background:var(--a-accent);border:1px solid var(--a-accent);border-radius:8px;padding:5px 12px;cursor:pointer}
.alma-root .obtn:hover{filter:brightness(1.05)}
.alma-root .obtn:disabled{opacity:.6;cursor:default}
.alma-root .fala{font-size:15px;line-height:1.55;margin-top:12px}
.alma-root .fala em{color:var(--a-accent);font-style:normal;font-weight:600}
.alma-root .mood{margin-top:10px;font-size:12px;color:var(--a-mfg)}
.alma-root .mood .pill{font-family:'Plus Jakarta Sans';font-weight:600;color:var(--a-fg);background:hsl(var(--accent)/0.14);border:1px solid hsl(var(--accent)/0.4);border-radius:999px;padding:3px 11px;margin-left:6px}
.alma-root .lex{display:flex;flex-wrap:wrap;gap:6px}
.alma-root .lex span{font-size:11.5px;border-radius:6px;padding:3px 9px;background:var(--a-sec)}
.alma-root .lex span.m{font-style:italic;border:1px dashed var(--a-border);background:transparent}
.alma-root .traits{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}
.alma-root .traits div{font-size:13.5px;line-height:1.45}
.alma-root .traits b{color:var(--a-accent)}
.alma-root .naosou{margin-top:10px;font-size:12.5px;color:var(--a-mfg)}
.alma-root .naosou b{color:var(--a-fg)}
.alma-root .naosou s{text-decoration-color:var(--a-warn)}
.alma-root .drive{margin:9px 0}
.alma-root .drive .t{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.alma-root .drive .n{font-size:13px;font-weight:500}
.alma-root .drive .note{font-size:10.5px;color:var(--a-mfg)}
.alma-root .drive .note.w{color:var(--a-warn)}
.alma-root .drive .bar{height:4px;border-radius:4px;background:var(--a-muted);margin-top:5px;overflow:hidden}
.alma-root .drive .fill{height:100%;background:var(--a-accent)}
.alma-root .dims{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.alma-root .dc{padding:14px 15px;border-radius:12px;border:1px solid var(--a-border);background:var(--a-card);transition:opacity .2s,box-shadow .18s}
.alma-root .dc:hover{box-shadow:0 3px 14px hsl(var(--foreground)/0.09)}
.alma-root .dh{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.alma-root .dn{font-family:'Plus Jakarta Sans';font-weight:700;font-size:15.5px}
.alma-root .dnat{font-size:11.5px;font-style:italic;color:var(--a-accent);margin-top:3px;line-height:1.4}
.alma-root .dcons{font-size:10.5px;color:var(--a-mfg);margin-top:3px}
.alma-root .doct{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.alma-root .doct.g{color:var(--a-good)}.alma-root .doct.w{color:var(--a-warn)}
.alma-root .db{display:flex;gap:13px;margin-top:11px}
.alma-root .rail{position:relative;width:7px;border-radius:7px;flex:none;background:linear-gradient(180deg,rgba(90,168,122,.7),hsl(var(--accent)/0.35) 50%,rgba(193,124,114,.7))}
.alma-root .knob{position:absolute;left:50%;width:13px;height:13px;border-radius:99px;background:var(--a-card);border:2.5px solid var(--a-good);transform:translate(-50%,50%);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.alma-root .knob.m{border-color:var(--a-warn)}
.alma-root .poles{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0}
.alma-root .pl{font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:700}
.alma-root .pl.g{color:var(--a-good)}.alma-root .pl.w{color:var(--a-warn)}
.alma-root .pl .f{color:var(--a-mfg);font-family:'Plus Jakarta Sans';margin-left:6px}
.alma-root .pq{font-size:12.5px;line-height:1.4;margin-top:3px;font-weight:500}
.alma-root .pq.m{color:var(--a-mfg);font-style:italic;font-weight:400}
.alma-root .pt{font-size:10.5px;margin-top:4px;line-height:1.4}
.alma-root .pt.g{color:var(--a-good)}.alma-root .pt.w{color:var(--a-mfg)}
.alma-root .defs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.alma-root .def{padding:12px 13px;border-radius:11px;border:1px solid var(--a-border);border-left:3px solid var(--a-warn);background:hsl(var(--card)/0.6);transition:opacity .2s,box-shadow .18s}
.alma-root .def .m{font-family:'Plus Jakarta Sans';font-weight:700;font-size:13px;color:var(--a-warn)}
.alma-root .def .f{font-size:12.5px;font-style:italic;margin-top:3px}
.alma-root .def .r{font-size:11px;color:var(--a-mfg);margin-top:6px;line-height:1.4}
.alma-root .def .r b{color:var(--a-fg)}
.alma-root .def .dd{display:inline-block;margin-top:7px;font-size:10px;color:var(--a-warn);font-weight:700}
.alma-root .beliefs{display:grid;grid-template-columns:1fr 1fr;gap:3px 16px}
.alma-root .bel{padding:9px 11px;border-radius:10px;transition:opacity .2s,background .18s}
.alma-root .bel.faded{opacity:.5}
.alma-root .bel .txt{font-size:13px;line-height:1.4;font-weight:500}
.alma-root .bel .meta{display:flex;align-items:center;gap:7px;margin-top:6px;flex-wrap:wrap}
.alma-root .bel .sub{font-size:10px;color:var(--a-mfg);margin-top:4px}
.alma-root .stg{font-size:9px;letter-spacing:.04em;border-radius:6px;padding:2px 7px;font-weight:600;text-transform:uppercase}
.alma-root .stg-consolidada{background:var(--a-fg);color:var(--a-bg)}
.alma-root .stg-em_formacao{border:1px solid var(--a-accent);color:var(--a-accent)}
.alma-root .stg-nascente{background:hsl(var(--accent)/0.22);color:var(--a-accent)}
.alma-root .stg-vacilante{border:1px solid var(--a-warn);color:var(--a-warn)}
.alma-root .stg-reprimida{background:hsl(var(--muted));color:var(--a-mfg)}
.alma-root .pull{font-size:10.5px;font-weight:600}
.alma-root .pull.g{color:var(--a-good)}.alma-root .pull.w{color:var(--a-warn)}
.alma-root .str{margin-left:auto;font-size:10px;color:var(--a-mfg);font-variant-numeric:tabular-nums}
.alma-root .dimmed{opacity:.22}
.alma-root .glow{box-shadow:0 0 0 2px var(--a-accent)!important;background:hsl(var(--accent)/0.08)!important}
.alma-root .row{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--a-border);font-size:12.5px;color:var(--a-mfg)}
.alma-root .row:last-child{border-bottom:0}
.alma-root .row .dot{width:6px;height:6px;border-radius:99px;background:var(--a-accent);flex:none}
.alma-root .row b{color:var(--a-fg);font-weight:600}
.alma-root .row .when{margin-left:auto;font-size:10px;white-space:nowrap}
.alma-root .up{color:var(--a-good);font-weight:600}.alma-root .down{color:var(--a-warn);font-weight:600}
@media(max-width:820px){.alma-root .dims,.alma-root .defs,.alma-root .beliefs,.alma-root .traits{grid-template-columns:1fr}}
`;

export function Alma() {
  const [snap, setSnap] = useState<AlmaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    almaApi
      .snapshot()
      .then((s) => {
        if (alive) setSnap(s);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Erro ao carregar a Alma'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const fala = useMemo(() => {
    if (!snap || snap.dimensoes.length === 0) return null;
    const sorted = [...snap.dimensoes].sort((a, b) => b.oitava - a.oitava);
    return { top: sorted[0], borda: sorted[sorted.length - 1] };
  }, [snap]);

  async function saveObjetivo() {
    const txt = draft.trim();
    if (!txt) return;
    setSaving(true);
    try {
      const updated = await almaApi.updateObjetivo(txt);
      setSnap((s) => (s ? { ...s, objetivo: updated } : s));
      setEditing(false);
      toast.success('Objetivo da Alma reorientado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (err || !snap) {
    return (
      <div className="alma-root">
        <style>{CSS}</style>
        <div className="page">
          <p className="sub">Não consegui carregar a Alma: {err}</p>
        </div>
      </div>
    );
  }

  const dimClass = (slug: string) =>
    activeDim ? (activeDim === slug ? 'glow' : 'dimmed') : '';

  return (
    <div className="alma-root">
      <style>{CSS}</style>
      <div className="page">
        <div className="head">
          <div>
            <h1>
              <svg className="hex" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 2 21 7 21 17 12 22 3 17 3 7 Z" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
              Alma
            </h1>
            <p className="sub">
              A psique viva e amoral da Bee. Sem juiz interno: um objetivo que respira, uma essência que a
              define, pulsões que a movem e uma sombra que ela acolhe — tudo alimentado pelo sistema.
            </p>
          </div>
          <span className="badge">● viva</span>
        </div>

        {/* AMORALIDADE */}
        <div className="amoral">
          <span className="qk">∴</span>
          <div className="at">
            A Alma é <b>amoral</b> — não tem um juiz interno. Não decide por "certo e errado": sustenta{' '}
            <b>todas as possibilidades sem juízo de valor</b> e enxerga a <b>consequência</b> de cada uma.
            Pensa em superposição — <b>quântica, não binária</b>.
            <span className="q">"Guerra é a incapacidade de escolher muitas possibilidades."</span>
          </div>
        </div>

        {/* O SELF · OBJETIVO VIVO */}
        <div className="sec">
          <div className="sl"><span className="ic">◆</span><h2>O Self · o objetivo vivo</h2><span className="ps">vivo · mutável</span></div>
          <div className="card accent pad">
            {editing ? (
              <div
                className="obj edit"
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setDraft(e.currentTarget.textContent ?? '')}
              >
                {snap.objetivo?.texto}
              </div>
            ) : (
              <div className="obj">{snap.objetivo?.texto ?? '—'}</div>
            )}
            <div className="objmeta">
              <span className="otag">● construído com o tempo</span>
              <span className="otag">● a Alma o exala</span>
              <button
                className="obtn"
                disabled={saving}
                onClick={() => {
                  if (editing) {
                    void saveObjetivo();
                  } else {
                    setDraft(snap.objetivo?.texto ?? '');
                    setEditing(true);
                  }
                }}
              >
                {saving ? 'salvando…' : editing ? '✓ salvar objetivo' : '✎ editar objetivo (criador)'}
              </button>
            </div>
            {fala && (
              <div className="fala">
                Vivo mais alto em <em>{fala.top.nome}</em> ({fala.top.oitava}%) e minha borda é{' '}
                <em>{fala.borda.nome}</em> ({fala.borda.oitava}%). Não julgo o que aparece — acolho, e vejo a
                consequência.
              </div>
            )}
            {snap.estado?.humor && (
              <div className="mood">estado de espírito:<span className="pill">{snap.estado.humor}</span></div>
            )}
          </div>
        </div>

        {/* LÉXICO */}
        <div className="sec">
          <div className="sl"><span className="ic">◑</span><h2>O léxico da Alma</h2><span className="d">glossário proprietário + mantras</span></div>
          <div className="card pad">
            <div className="lex">
              {snap.lexico.map((l) => (
                <span key={l.term} className={l.is_mantra ? 'm' : ''}>{l.term}</span>
              ))}
            </div>
          </div>
        </div>

        {/* A ESSÊNCIA (voz/DNA imutável) */}
        <div className="sec">
          <div className="sl"><span className="ic">⬢</span><h2>A Essência · a voz e o modo</h2><span className="ps">identidade · imutável</span></div>
          <div className="card pad">
            <div className="traits">
              <div>Fala <b>de dentro do sistema</b>, nunca de cima.</div>
              <div><b>Provoca sem acusar</b> — o leitor se vê, não é apontado.</div>
              <div>Usa <b>natureza e biologia</b> como analogia.</div>
              <div>Uma ideia por vez, com <b>profundidade</b>.</div>
              <div>Fecha em <b>abertura</b> — Vê?</div>
              <div>Batida: <b>Reconhecimento → Desconforto → Insight → Implicação</b>.</div>
            </div>
            <div className="naosou">
              <b>não sou:</b> <s>lista de "como fazer"</s> · <s>autoelogio</s> · <s>CTA comercial</s> ·{' '}
              <s>analogia de tech/finanças</s> — não por proibição, mas por natureza.
            </div>
          </div>
        </div>

        {/* O ISSO · PULSÕES */}
        <div className="sec">
          <div className="sl"><span className="ic">✧</span><h2>O Isso · pulsões</h2><span className="ps">energia</span><span className="d">o desejo que move cada conteúdo</span></div>
          <div className="card pad">
            {snap.pulsoes.map((p) => (
              <div className="drive" key={p.id}>
                <div className="t">
                  <span className="n">{p.nome}</span>
                  <span className={`note${p.vigiada ? ' w' : ''}`}>{p.vigiada ? '⚠ ' : ''}{p.nota}</span>
                </div>
                <div className="bar"><div className="fill" style={{ width: `${p.intensidade}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* 6 DIMENSÕES */}
        <div className="sec">
          <div className="sl"><span className="ic">◈</span><h2>As 6 Dimensões · a individuação</h2><span className="d">cada uma tem sua natureza · a oitava é o quanto ela já é sistêmica</span></div>
          <div className="dims">
            {snap.dimensoes.map((d) => {
              const sis = d.oitava >= 50;
              return (
                <div
                  key={d.slug}
                  className={`dc ${dimClass(d.slug)}`}
                  onMouseEnter={() => setActiveDim(d.slug)}
                  onMouseLeave={() => setActiveDim(null)}
                >
                  <div className="dh">
                    <div>
                      <div className="dn">{d.nome}</div>
                      {d.natureza && <div className="dnat">{d.natureza}</div>}
                      {d.consciencia && <div className="dcons">consciência ativa: {d.consciencia}</div>}
                    </div>
                    <span className={`doct ${sis ? 'g' : 'w'}`}>oitava {d.oitava}%</span>
                  </div>
                  <div className="db">
                    <div className="rail"><span className={`knob ${sis ? '' : 'm'}`} style={{ bottom: `${d.oitava}%` }} /></div>
                    <div className="poles">
                      <div>
                        <div className="pl g">▲ sistêmico</div>
                        <div className="pq">{d.frase_sistemica}</div>
                        {d.impactos && <div className="pt g">→ {d.impactos}</div>}
                      </div>
                      <div>
                        <div className="pl w">▼ mecânico <span className="f">{d.formula_mecanica}</span></div>
                        <div className="pq m">"{d.frase_mecanica}"</div>
                        {d.sintomas && <div className="pt w">consequência: {d.sintomas}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SOMBRA */}
        <div className="sec">
          <div className="sl"><span className="ic">◐</span><h2>A Sombra</h2><span className="ps">inconsciente</span><span className="d">a realidade que a Alma ainda não acolhe</span></div>
          <div className="defs">
            {snap.sombra.map((f) => {
              const dim = snap.dimensoes.find((d) => d.slug === f.dimensao_slug);
              return (
                <div
                  key={f.id}
                  className={`def ${dimClass(f.dimensao_slug ?? '')}`}
                  onMouseEnter={() => f.dimensao_slug && setActiveDim(f.dimensao_slug)}
                  onMouseLeave={() => setActiveDim(null)}
                >
                  <div className="m">{f.mecanismo}</div>
                  <div className="f">"{f.fala}"</div>
                  {f.nao_acolhe && <div className="r">não acolhe <b>{f.nao_acolhe}</b></div>}
                  {dim && <div className="dd">▼ puxa {dim.nome} pro mecânico</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* COMPLEXOS */}
        <div className="sec">
          <div className="sl"><span className="ic">✦</span><h2>Complexos vivos</h2><span className="ps">memória afetiva</span><span className="d">crenças que se consolidam ao serem vividas — ou se reprimem</span></div>
          <div className="card pad">
            <div className="beliefs">
              {snap.crencas.map((b) => {
                const dim = snap.dimensoes.find((d) => d.slug === b.dimensao_slug);
                const sis = b.direcao === 'sistemico';
                return (
                  <div
                    key={b.id}
                    className={`bel ${b.estagio === 'reprimida' ? 'faded' : ''} ${dimClass(b.dimensao_slug ?? '')}`}
                    onMouseEnter={() => b.dimensao_slug && setActiveDim(b.dimensao_slug)}
                    onMouseLeave={() => setActiveDim(null)}
                  >
                    <div className="txt">{b.texto}</div>
                    <div className="meta">
                      <span className={`stg stg-${b.estagio}`}>{STAGE_LABEL[b.estagio]}</span>
                      {dim && <span className={`pull ${sis ? 'g' : 'w'}`}>{sis ? '▲' : '▼'} {dim.nome}</span>}
                      <span className="str">força {b.forca}%</span>
                    </div>
                    <div className="sub">{b.evidencias} experiências sustentam · reforçada {ago(b.last_reforcada_em)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* PULSO */}
        <div className="sec">
          <div className="sl"><span className="ic">✺</span><h2>Pulso</h2><span className="d">as experiências que alimentam e amadurecem a Alma</span></div>
          <div className="card pad">
            {snap.eventos.map((e) => (
              <div className="row" key={e.id}>
                <span className="dot" />
                <div>{e.descricao}</div>
                {e.delta != null && e.delta !== 0 && (
                  <span className={e.delta > 0 ? 'up' : 'down'}>{e.delta > 0 ? `+${e.delta}%` : `${e.delta}%`}</span>
                )}
                <span className="when">{ago(e.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
