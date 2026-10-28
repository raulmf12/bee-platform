#!/usr/bin/env node
// Regressão completa MULTIPLATAFORMA (Windows, macOS, Linux) — o mesmo que scripts/regressao.sh, em Node.
//   npm run regressao                                → suíte inteira (~40 min)
//   npm run regressao -- e2e/f6-agenda.spec.ts       → só os specs indicados
//   npm run regressao:check                          → só confere se a máquina está pronta (não roda teste)
// Antes de rodar confere tudo (Node, dependências, .env, token do Supabase, navegador de teste) e diz o que falta.
// Mantém o computador acordado, grava o log completo num arquivo e mostra só o progresso, o resumo e as falhas.
// Nunca roda duas suítes ao mesmo tempo (um único usuário de teste: o cleanup de uma apaga os dados da outra).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProjectAccess, loadLocalEnv, managementToken } from './supabase-token.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const testArgs = args.filter((a) => a !== '--check');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const LOG = process.env.LOG ?? path.join(os.tmpdir(), `regressao-${stamp}.log`);
const LOCK = path.join(os.tmpdir(), 'hive-regressao.lock');

const ok = (m) => console.log(`  ✔ ${m}`);
const problems = [];
const fail = (m, fix) => { problems.push({ m, fix }); console.log(`  ✘ ${m}${fix ? `\n      → ${fix}` : ''}`); };

// ---------- 1. A máquina está pronta? ----------
async function preflight() {
  console.log('Conferindo a máquina…');
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) ok(`Node ${process.versions.node}`); else fail(`Node ${process.versions.node} é antigo`, 'instale o Node 20 ou mais novo (nodejs.org, versão LTS)');

  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  if (fs.existsSync(cli)) ok('dependências instaladas'); else fail('dependências não instaladas', 'rode: npm install');

  loadLocalEnv(ROOT);
  const need = { '.env.local': ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'], '.env.e2e.local': ['E2E_EMAIL', 'E2E_PASSWORD', 'E2E_USER_ID'] };
  for (const [file, vars] of Object.entries(need)) {
    const missing = vars.filter((v) => !process.env[v]);
    if (!fs.existsSync(path.join(ROOT, file))) fail(`falta o arquivo ${file}`, `peça ao Raul o conteúdo dele (${vars.join(', ')}) e salve na pasta do projeto — nunca no GitHub`);
    else if (missing.length) fail(`${file} sem ${missing.join(', ')}`, 'peça ao Raul os valores');
    else ok(file);
  }

  const token = managementToken();
  if (!token) fail('sem token do Supabase', 'gere um em supabase.com/dashboard/account/tokens e acrescente SUPABASE_ACCESS_TOKEN=sbp_... no .env.e2e.local');
  else {
    const access = await checkProjectAccess(token);
    if (access.ok) ok('token do Supabase com acesso ao projeto'); else fail(`token do Supabase: ${access.why}`);
  }

  if (fs.existsSync(cli)) {
    let exe = '';
    try { const { chromium } = await import('@playwright/test'); exe = chromium.executablePath(); } catch { /* sem playwright */ }
    if (exe && fs.existsSync(exe)) ok('navegador de teste instalado');
    else {
      console.log('  … instalando o navegador de teste (só na primeira vez, ~150 MB)');
      const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
      if (r.status === 0) ok('navegador de teste instalado'); else fail('não consegui instalar o navegador de teste', 'rode: npx playwright install chromium');
    }
  }

  const free = freeDiskGb();
  const min = Number(process.env.MIN_FREE_GB ?? 2);
  if (free !== null && free < min) fail(`pouco espaço em disco (${free.toFixed(1)} GB livres)`, `libere pelo menos ${min} GB: os testes gravam vídeos e o navegador precisa de espaço`);
  else if (free !== null) ok(`${free.toFixed(1)} GB livres em disco`);
}

function freeDiskGb() {
  try { const s = fs.statfsSync(os.tmpdir()); return (s.bavail * s.bsize) / 1e9; } catch { return null; }
}

// ---------- 2. Trava contra duas suítes ----------
function takeLock() {
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    try { process.kill(pid, 0); console.error(`Já existe uma regressão rodando (processo ${pid}). Espere ela terminar.`); process.exit(2); }
    catch { /* trava órfã: o processo já morreu */ }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const release = () => { try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK); } catch { /* já removida */ } };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
}

// ---------- 3. Computador acordado ----------
// Suspensão no meio da suíte gera dezenas de "fetch failed" falsos.
function keepAwake() {
  const child = startAwake();
  child?.on('error', () => { /* utilitário ausente: segue sem manter acordado */ });
  child?.unref();
}
function startAwake() {
  const pid = String(process.pid);
  try {
    if (process.platform === 'darwin') return spawn('caffeinate', ['-i', '-w', pid], { stdio: 'ignore' });
    if (process.platform === 'win32') {
      // ES_CONTINUOUS | ES_SYSTEM_REQUIRED enquanto este processo existir.
      const ps = "$t=Add-Type -Name P -Namespace W -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e);';"
        + ` [void]$t::SetThreadExecutionState([uint32]2147483649); Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`;
      return spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
    }
    return spawn('systemd-inhibit', ['--what=sleep', '--why=regressao', 'tail', `--pid=${pid}`, '-f', '/dev/null'], { stdio: 'ignore' });
  } catch { return null; }
}

// ---------- 4. Rodar e resumir ----------
function run() {
  return new Promise((resolve) => {
    const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    const out = fs.createWriteStream(LOG);
    const child = spawn(process.execPath, [cli, 'test', '--project=e2e', '--reporter=line', ...testArgs], { cwd: ROOT, env: process.env });
    let buf = '';
    const onData = (d) => {
      out.write(d);
      buf += d.toString();
      const lines = buf.split(/\r?\n/); buf = lines.pop() ?? '';
      for (const l of lines) {
        const m = l.match(/^\[(\d+)\/(\d+)\]/);
        if (m && process.stdout.isTTY) process.stdout.write(`\r  teste ${m[1]} de ${m[2]}…   `);
        else if (m && Number(m[1]) % 20 === 0) console.log(`  teste ${m[1]} de ${m[2]}…`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => { out.end(() => resolve(code ?? 1)); });
  });
}

function summarize(code) {
  if (process.stdout.isTTY) process.stdout.write('\n');
  const log = fs.readFileSync(LOG, 'utf8');
  const count = (re) => Number(log.match(re)?.[1] ?? 0);
  const passed = count(/(\d+) passed/), failed = count(/(\d+) failed/), flaky = count(/(\d+) flaky/), skipped = count(/(\d+) did not run/);
  console.log('\n──────── Resultado ────────');
  console.log(`  ${passed} passaram · ${failed} falharam${flaky ? ` · ${flaky} instáveis` : ''}${skipped ? ` · ${skipped} não rodaram` : ''}`);
  const blocks = log.split(/\n\s+\d+\) \[e2e\] › /).slice(1);
  for (const b of blocks.slice(0, 30)) {
    const title = b.split('\n')[0].trim();
    const err = (b.match(/Received message: "([^"]+)"/) ?? b.match(/Error: ([^\n]+)/))?.[1] ?? '';
    console.log(`  ✘ ${title}\n      ${err.slice(0, 180)}`);
  }
  if (/ENOSPC/.test(log)) console.log('\n  ⚠ "no space left on device": o disco encheu — libere espaço e rode de novo.');
  if ((log.match(/fetch failed|HTTP 502|ECONNRESET/g) ?? []).length >= 5) console.log('\n  ⚠ Muitas falhas de rede/Supabase: costuma ser ambiente (internet, suspensão, instabilidade). Rode de novo só os specs que falharam antes de investigar o código.');
  console.log(`\n  Log completo: ${LOG}`);
  console.log(code === 0 ? '  ✅ Regressão verde.' : '  ❌ Regressão com falhas — não suba código até entender cada uma.');
}

// ---------- principal ----------
await preflight();
if (problems.length) {
  console.log(`\n${problems.length} item(ns) para resolver antes de rodar os testes (veja as setas → acima).`);
  process.exit(1);
}
if (CHECK_ONLY) { console.log('\nMáquina pronta para a regressão.'); process.exit(0); }
takeLock();
keepAwake();
console.log(`\nRodando${testArgs.length ? ` (${testArgs.join(' ')})` : ' a suíte completa (~40 min)'}… log em ${LOG}`);
const code = await run();
summarize(code);
process.exit(code);
