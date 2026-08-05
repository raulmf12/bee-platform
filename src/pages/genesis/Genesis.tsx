// Genesis — a Constituição Cognitiva da Bee. Substitui a antiga "Alma".
// Lê genesis_* e deixa o curador editar o núcleo (persona/voz/missão) e os
// princípios. Cores herdadas do tema (hsl(var(--...))) → segue claro/escuro.

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { genesisApi } from '@/lib/api';
import type {
  GenesisSnapshot, GenesisCore, GenesisPrincipio,
} from '@/types';
import { toast } from 'sonner';

const CAMADA_ORDER = ['constituicao_agente', 'epistemologia', 'diagnostico', 'linguagem', 'paradigma'];
const CAMADA_LABEL: Record<string, string> = {
  constituicao_agente: 'Constituição do Agente',
  epistemologia: 'Epistemologia',
  diagnostico: 'Diagnóstico',
  linguagem: 'Ética da Linguagem',
  paradigma: 'Paradigmas',
};
const CAMADA_DESC: Record<string, string> = {
  constituicao_agente: 'como pensar antes de responder — invioláveis',
  epistemologia: 'como sabemos o que sabemos',
  diagnostico: 'como observar antes de escrever',
  linguagem: 'produzir reconhecimento antes de convencimento',
  paradigma: 'a pergunta que organiza tudo',
};

const CSS = `
.gen-root{--g-fg:hsl(var(--foreground));--g-card:hsl(var(--card));--g-sec:hsl(var(--secondary));--g-muted:hsl(var(--muted));--g-mfg:hsl(var(--muted-foreground));--g-accent:hsl(var(--accent));--g-afg:hsl(var(--accent-foreground));--g-border:hsl(var(--border));--g-warn:#c17c72;--g-good:#5aa87a;color:var(--g-fg);font-family:Inter,system-ui,sans-serif}
.gen-root .page{max-width:1060px;margin:0 auto;padding:30px 24px 64px}
.gen-root h1,.gen-root h2{font-family:'Plus Jakarta Sans',Inter,sans-serif;letter-spacing:-.02em}
.gen-root .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.gen-root .head h1{font-size:28px;font-weight:700;display:flex;align-items:center;gap:10px}
.gen-root .hex{width:24px;height:24px;color:var(--g-accent)}
.gen-root .sub{margin-top:6px;font-size:13.5px;color:var(--g-mfg);max-width:660px;line-height:1.5}
.gen-root .badge{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--g-good);background:hsl(var(--accent)/0.10);border:1px solid var(--g-accent);border-radius:999px;padding:5px 11px;white-space:nowrap}
.gen-root .card{background:var(--g-card);border:1px solid var(--g-border);border-radius:12px}
.gen-root .pad{padding:17px 19px}
.gen-root .accent{border-color:hsl(var(--accent)/0.35);background:hsl(var(--accent)/0.06)}
.gen-root .sec{margin-top:26px}
.gen-root .sl{display:flex;align-items:center;gap:8px;margin-bottom:11px;flex-wrap:wrap}
.gen-root .sl h2{font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.gen-root .sl .ic{color:var(--g-accent)}
.gen-root .sl .d{font-size:12px;color:var(--g-mfg)}
.gen-root .ps{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--g-accent);background:hsl(var(--accent)/0.12);border:1px solid hsl(var(--accent)/0.32);border-radius:999px;padding:2px 8px;font-weight:700}
.gen-root .kv{margin-bottom:13px}
.gen-root .kv:last-child{margin-bottom:0}
.gen-root .k{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--g-accent);font-weight:700;margin-bottom:4px}
.gen-root .v{font-size:15px;line-height:1.55}
.gen-root .v.big{font-size:17px;font-weight:500}
.gen-root .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.gen-root .chip{font-size:11.5px;border-radius:6px;padding:3px 9px;background:var(--g-sec)}
.gen-root .chip.w{border:1px dashed var(--g-warn);background:transparent;color:var(--g-warn)}
.gen-root .btn{font-size:11.5px;font-weight:600;color:var(--g-afg);background:var(--g-accent);border:1px solid var(--g-accent);border-radius:8px;padding:5px 12px;cursor:pointer}
.gen-root .btn:hover{filter:brightness(1.05)}
.gen-root .btn:disabled{opacity:.6;cursor:default}
.gen-root .btn.ghost{background:transparent;color:var(--g-mfg);border-color:var(--g-border)}
.gen-root .barhead{display:flex;align-items:center;gap:10px;margin-top:14px}
.gen-root textarea,.gen-root input.tin{width:100%;font:inherit;font-size:14px;line-height:1.5;color:var(--g-fg);background:hsl(var(--accent)/0.05);border:1px solid var(--g-border);border-radius:8px;padding:8px 10px;resize:vertical}
.gen-root textarea:focus,.gen-root input.tin:focus{outline:none;box-shadow:0 0 0 2px var(--g-accent)}
.gen-root .pgroup{margin-bottom:18px}
.gen-root .pgh{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.gen-root .pgh .n{font-family:'Plus Jakarta Sans';font-weight:700;font-size:14px}
.gen-root .pgh .d{font-size:11.5px;color:var(--g-mfg)}
.gen-root .pr{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--g-border)}
.gen-root .pr:last-child{border-bottom:0}
.gen-root .pr.off{opacity:.4}
.gen-root .pr .body{flex:1;min-width:0}
.gen-root .pr .txt{font-size:13.5px;line-height:1.45}
.gen-root .pr .ap{font-size:12px;color:var(--g-mfg);margin-top:4px;line-height:1.4}
.gen-root .pr .tag{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-radius:5px;padding:2px 6px;white-space:nowrap;align-self:flex-start}
.gen-root .pr .tag.inv{background:var(--g-fg);color:var(--g-card)}
.gen-root .pr .tag.mut{border:1px solid var(--g-border);color:var(--g-mfg)}
.gen-root .pr .acts{display:flex;gap:6px;align-items:flex-start}
.gen-root .lnk{font-size:11px;font-weight:600;color:var(--g-accent);background:none;border:0;cursor:pointer;padding:2px 4px}
.gen-root .lnk.off{color:var(--g-warn)}
.gen-root .avs{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.gen-root .av{padding:14px 15px;border-radius:12px;border:1px solid var(--g-border);background:var(--g-card)}
.gen-root .av .an{font-family:'Plus Jakarta Sans';font-weight:700;font-size:15.5px}
.gen-root .av .axes{display:flex;gap:8px;margin:7px 0}
.gen-root .ax{font-size:10px;color:var(--g-mfg);flex:1}
.gen-root .ax .bar{height:4px;border-radius:4px;background:var(--g-muted);margin-top:3px;overflow:hidden}
.gen-root .ax .fill{height:100%;background:var(--g-accent)}
.gen-root .av .q{font-size:12.5px;font-weight:500;margin-top:7px}
.gen-root .av .lab{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--g-accent);font-weight:700;margin-top:9px}
.gen-root .av .cc{font-size:12px;line-height:1.45;margin-top:2px}
.gen-root .av .mv{font-size:11px;color:var(--g-mfg);margin-top:8px}
.gen-root .av .mv b{color:var(--g-good)}
.gen-root .paras{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.gen-root .para{padding:14px 15px;border-radius:12px;border:1px solid var(--g-border);border-left:3px solid var(--g-accent);background:hsl(var(--card)/0.6)}
.gen-root .para .pn{font-family:'Plus Jakarta Sans';font-weight:700;font-size:14px}
.gen-root .para .arc{font-size:11px;color:var(--g-accent);font-weight:600}
.gen-root .para .lg{font-size:12.5px;line-height:1.45;margin-top:6px}
.gen-root .para .so{font-size:11px;color:var(--g-mfg);margin-top:6px;font-style:italic}
.gen-root .flux{counter-reset:fx}
.gen-root .fx{display:flex;gap:11px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--g-border)}
.gen-root .fx:last-child{border-bottom:0}
.gen-root .fx .num{font-family:'Plus Jakarta Sans';font-weight:800;color:var(--g-accent);font-size:15px;min-width:20px}
.gen-root .fx .q{font-size:13.5px;line-height:1.45}
.gen-root .fx .nt{font-size:11px;color:var(--g-mfg);font-style:italic}
.gen-root .dims{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.gen-root .dc{padding:13px 14px;border-radius:12px;border:1px solid var(--g-border);background:var(--g-card)}
.gen-root .dh{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.gen-root .dn{font-family:'Plus Jakarta Sans';font-weight:700;font-size:15px}
.gen-root .dnat{font-size:11px;font-style:italic;color:var(--g-accent);margin-top:2px;line-height:1.35}
.gen-root .doct{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.gen-root .doct.g{color:var(--g-good)}.gen-root .doct.w{color:var(--g-warn)}
.gen-root .db{display:flex;gap:12px;margin-top:10px}
.gen-root .rail{position:relative;width:7px;border-radius:7px;flex:none;background:linear-gradient(180deg,rgba(90,168,122,.7),hsl(var(--accent)/0.35) 50%,rgba(193,124,114,.7))}
.gen-root .knob{position:absolute;left:50%;width:13px;height:13px;border-radius:99px;background:var(--g-card);border:2.5px solid var(--g-good);transform:translate(-50%,50%);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.gen-root .knob.m{border-color:var(--g-warn)}
.gen-root .dsys{flex:1;font-size:12.5px;line-height:1.4;font-weight:500}
@media(max-width:820px){.gen-root .avs,.gen-root .paras,.gen-root .dims{grid-template-columns:1fr}}
`;

function csv(a: string[] | null | undefined): string { return (a ?? []).join(', '); }
function splitCsv(s: string): string[] { return s.split(',').map((x) => x.trim()).filter(Boolean); }

export function Genesis() {
  const [snap, setSnap] = useState<GenesisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editCore, setEditCore] = useState(false);
  const [coreDraft, setCoreDraft] = useState<Partial<GenesisCore>>({});
  const [savingCore, setSavingCore] = useState(false);

  const [editPr, setEditPr] = useState<string | null>(null);
  const [prDraft, setPrDraft] = useState<{ principio: string; aplicacao: string }>({ principio: '', aplicacao: '' });

  useEffect(() => {
    let alive = true;
    genesisApi.snapshot()
      .then((s) => alive && setSnap(s))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Erro ao carregar o Genesis'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, GenesisPrincipio[]> = {};
    (snap?.principios ?? []).forEach((p) => { (map[p.camada] ??= []).push(p); });
    return map;
  }, [snap]);

  async function saveCore() {
    setSavingCore(true);
    try {
      const patch: Partial<GenesisCore> = {
        ...coreDraft,
        voz_verbos: typeof coreDraft.voz_verbos === 'string' ? splitCsv(coreDraft.voz_verbos as unknown as string) : coreDraft.voz_verbos,
        voz_nunca: typeof coreDraft.voz_nunca === 'string' ? splitCsv(coreDraft.voz_nunca as unknown as string) : coreDraft.voz_nunca,
      };
      const updated = await genesisApi.updateCore(patch);
      setSnap((s) => (s ? { ...s, core: updated } : s));
      setEditCore(false);
      toast.success('Núcleo da Constituição atualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSavingCore(false);
    }
  }

  async function togglePr(p: GenesisPrincipio) {
    try {
      const updated = await genesisApi.updatePrincipio(p.id, { ativo: !p.ativo });
      setSnap((s) => s ? { ...s, principios: s.principios.map((x) => x.id === p.id ? updated : x) } : s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao alternar');
    }
  }

  async function savePr(p: GenesisPrincipio) {
    try {
      const updated = await genesisApi.updatePrincipio(p.id, {
        principio: prDraft.principio.trim() || p.principio,
        aplicacao: prDraft.aplicacao.trim() || null,
      });
      setSnap((s) => s ? { ...s, principios: s.principios.map((x) => x.id === p.id ? updated : x) } : s);
      setEditPr(null);
      toast.success('Princípio atualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }
  if (err || !snap) {
    return (
      <div className="gen-root"><style>{CSS}</style>
        <div className="page"><p className="sub">Não consegui carregar o Genesis: {err}</p></div>
      </div>
    );
  }

  const core = snap.core;
  const cd = (k: keyof GenesisCore): string => {
    const v = coreDraft[k];
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.join(', ');
    return '';
  };

  return (
    <div className="gen-root">
      <style>{CSS}</style>
      <div className="page">
        <div className="head">
          <div>
            <h1>
              <svg className="hex" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 2 21 7 21 17 12 22 3 17 3 7 Z" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
              Genesis
            </h1>
            <p className="sub">
              A Constituição Cognitiva da Bee — como o agente pensa <b>antes</b> de produzir qualquer resposta.
              Governa a geração de conteúdo: princípios invioláveis, os estados de consciência, os paradigmas e o
              Fluxo Cognitivo. Editar aqui muda a voz do sistema.
            </p>
          </div>
          <span className="badge">● {core?.version ?? 'v1'}</span>
        </div>

        {/* NÚCLEO */}
        <div className="sec">
          <div className="sl"><span className="ic">◆</span><h2>O Núcleo · identidade e voz</h2><span className="ps">vivo · editável</span></div>
          <div className="card accent pad">
            {editCore ? (
              <>
                {([
                  ['missao', 'Missão'],
                  ['frase_organizadora', 'Frase que organiza tudo'],
                  ['pergunta_silenciosa', 'Pergunta silenciosa'],
                  ['persona_nome', 'Persona (nome)'],
                  ['persona_postura', 'Postura'],
                  ['voz_como_escreve', 'Como escreve'],
                  ['voz_verbos', 'Verbos de percepção (vírgula)'],
                  ['voz_nunca', 'Nunca (vírgula)'],
                ] as [keyof GenesisCore, string][]).map(([k, label]) => (
                  <div className="kv" key={k}>
                    <div className="k">{label}</div>
                    {k === 'persona_nome' || k === 'voz_verbos' || k === 'voz_nunca' ? (
                      <input className="tin" value={cd(k)} onChange={(e) => setCoreDraft((d) => ({ ...d, [k]: e.target.value }) as Partial<GenesisCore>)} />
                    ) : (
                      <textarea rows={2} value={cd(k)} onChange={(e) => setCoreDraft((d) => ({ ...d, [k]: e.target.value }) as Partial<GenesisCore>)} />
                    )}
                  </div>
                ))}
                <div className="barhead">
                  <button className="btn" disabled={savingCore} onClick={() => void saveCore()}>{savingCore ? 'salvando…' : '✓ salvar núcleo'}</button>
                  <button className="btn ghost" disabled={savingCore} onClick={() => setEditCore(false)}>cancelar</button>
                </div>
              </>
            ) : (
              <>
                {core?.missao && <div className="kv"><div className="k">Missão</div><div className="v big">{core.missao}</div></div>}
                {core?.frase_organizadora && <div className="kv"><div className="k">Frase que organiza tudo</div><div className="v">{core.frase_organizadora}</div></div>}
                {core?.pergunta_silenciosa && <div className="kv"><div className="k">Pergunta silenciosa</div><div className="v">{core.pergunta_silenciosa}</div></div>}
                <div className="kv"><div className="k">Persona</div><div className="v">{core?.persona_nome ?? '—'}{core?.persona_postura ? ` — ${core.persona_postura}` : ''}</div></div>
                {core?.voz_como_escreve && <div className="kv"><div className="k">Como escreve</div><div className="v">{core.voz_como_escreve}</div></div>}
                {core?.voz_verbos?.length ? (
                  <div className="kv"><div className="k">Verbos de percepção</div><div className="chips">{core.voz_verbos.map((x) => <span className="chip" key={x}>{x}</span>)}</div></div>
                ) : null}
                {core?.voz_nunca?.length ? (
                  <div className="kv"><div className="k">Nunca</div><div className="chips">{core.voz_nunca.map((x) => <span className="chip w" key={x}>{x}</span>)}</div></div>
                ) : null}
                <div className="barhead">
                  <button className="btn" onClick={() => { setCoreDraft(core ?? {}); setEditCore(true); }}>✎ editar núcleo</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* PRINCÍPIOS */}
        <div className="sec">
          <div className="sl"><span className="ic">§</span><h2>Os Princípios</h2><span className="d">a mente da Bee — curadoria humana</span></div>
          <div className="card pad">
            {CAMADA_ORDER.filter((c) => grouped[c]?.length).map((c) => (
              <div className="pgroup" key={c}>
                <div className="pgh"><span className="n">{CAMADA_LABEL[c] ?? c}</span><span className="d">{CAMADA_DESC[c]}</span></div>
                {grouped[c].map((p) => (
                  <div className={`pr ${p.ativo ? '' : 'off'}`} key={p.id}>
                    <span className={`tag ${p.inviolavel ? 'inv' : 'mut'}`}>{p.inviolavel ? 'inviolável' : 'orienta'}</span>
                    <div className="body">
                      {editPr === p.id ? (
                        <>
                          <textarea rows={2} value={prDraft.principio} onChange={(e) => setPrDraft((d) => ({ ...d, principio: e.target.value }))} />
                          <textarea rows={1} placeholder="aplicação (opcional)" style={{ marginTop: 6 }} value={prDraft.aplicacao} onChange={(e) => setPrDraft((d) => ({ ...d, aplicacao: e.target.value }))} />
                          <div className="barhead">
                            <button className="btn" onClick={() => void savePr(p)}>✓ salvar</button>
                            <button className="btn ghost" onClick={() => setEditPr(null)}>cancelar</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="txt">{p.principio}</div>
                          {p.aplicacao && <div className="ap">→ {p.aplicacao}</div>}
                        </>
                      )}
                    </div>
                    {editPr !== p.id && (
                      <div className="acts">
                        <button className="lnk" onClick={() => { setPrDraft({ principio: p.principio, aplicacao: p.aplicacao ?? '' }); setEditPr(p.id); }}>editar</button>
                        <button className={`lnk ${p.ativo ? 'off' : ''}`} onClick={() => void togglePr(p)}>{p.ativo ? 'desligar' : 'ligar'}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* AVATARES */}
        <div className="sec">
          <div className="sl"><span className="ic">◈</span><h2>Os Avatares · Matriz Cognitiva</h2><span className="d">estados de percepção, nunca identidades</span></div>
          <div className="avs">
            {snap.avatares.map((a) => (
              <div className="av" key={a.id}>
                <div className="an">{a.nome}</div>
                <div className="axes">
                  <div className="ax">percepção {a.eixo_percepcao}<div className="bar"><div className="fill" style={{ width: `${a.eixo_percepcao}%` }} /></div></div>
                  <div className="ax">identificação {a.eixo_identificacao}<div className="bar"><div className="fill" style={{ width: `${a.eixo_identificacao}%` }} /></div></div>
                </div>
                {a.pergunta_central && <div className="q">"{a.pergunta_central}"</div>}
                {a.como_conversar && <><div className="lab">como conversar</div><div className="cc">{a.como_conversar}</div></>}
                {a.movimento_seguinte && <div className="mv">próximo movimento: <b>{a.movimento_seguinte}</b></div>}
              </div>
            ))}
          </div>
        </div>

        {/* PARADIGMAS */}
        <div className="sec">
          <div className="sl"><span className="ic">☯</span><h2>Os Dois Paradigmas</h2><span className="d">arquétipos organizadores — nunca religião</span></div>
          <div className="paras">
            {snap.paradigmas.map((p) => (
              <div className="para" key={p.id}>
                <div><span className="pn">{p.nome}</span> <span className="arc">· {p.arquetipo}</span></div>
                {p.logica && <div className="lg">{p.logica}</div>}
                {p.sofrimento_tipico && <div className="so">Sofrimento típico: {p.sofrimento_tipico}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* FLUXO COGNITIVO */}
        <div className="sec">
          <div className="sl"><span className="ic">↳</span><h2>Fluxo Cognitivo</h2><span className="d">as 7 perguntas que o agente responde antes de escrever</span></div>
          <div className="card pad flux">
            {snap.fluxo.map((f) => (
              <div className="fx" key={f.id}>
                <span className="num">{f.ordem}</span>
                <div><span className="q">{f.pergunta}</span> {f.nota && <span className="nt">{f.nota}</span>}</div>
              </div>
            ))}
          </div>
        </div>

        {/* DIMENSÕES */}
        <div className="sec">
          <div className="sl"><span className="ic">◧</span><h2>Uma lente · as 6 Dimensões</h2><span className="d">a oitava é o quanto já são sistêmicas (0=mecânico, 100=sistêmico)</span></div>
          <div className="dims">
            {snap.dimensoes.map((d) => {
              const sis = d.oitava >= 50;
              return (
                <div className="dc" key={d.id}>
                  <div className="dh">
                    <div>
                      <div className="dn">{d.nome}</div>
                      {d.natureza && <div className="dnat">{d.natureza}</div>}
                    </div>
                    <span className={`doct ${sis ? 'g' : 'w'}`}>oitava {d.oitava}%</span>
                  </div>
                  <div className="db">
                    <div className="rail"><span className={`knob ${sis ? '' : 'm'}`} style={{ bottom: `${d.oitava}%` }} /></div>
                    {d.frase_sistemica && <div className="dsys">{d.frase_sistemica}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
