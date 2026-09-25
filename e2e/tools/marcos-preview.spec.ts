import { test } from '@playwright/test';
import { sql } from '../helpers/admin';
import { buildPipeline } from '../../src/lib/campaign/pipeline';
import { happening, pendingItems, recommendations, upcoming } from '../../src/lib/campaign/home';

// Prévia SOMENTE LEITURA do que a Home/Pipeline do Marcos mostram com os dados
// reais (smoke do cutover). Rodar à mão: npx playwright test e2e/tools --project=e2e
test('@tool prévia Home/Pipeline do Marcos (read-only)', async () => {
  const M = 'dfa11979-83c5-4737-9601-56e4df05746a';
  const [campaigns, cycles, ideas, contents, posts, accounts, metrics] = await Promise.all([
    sql(`select * from campaigns where user_id='${M}' and coalesce(metadata->>'kind','')<>'avulso'`),
    sql(`select * from campaign_cycles where user_id='${M}'`),
    sql(`select * from ideas where user_id='${M}'`),
    sql(`select * from contents where user_id='${M}'`),
    sql(`select id,platform,format,status,title,caption,carousel_text,metadata,scheduled_date,published_at,publish_error,content_id,campaign_id,cycle_id,account_id,piece_role,alternative_group,created_at,updated_at from user_posts where user_id='${M}'`),
    sql(`select id,platform,label,is_default,status,metadata from social_accounts where user_id='${M}'`),
    sql(`select * from post_metrics where user_id='${M}'`),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = { campaigns, cycles, ideas, contents, posts, accounts, metrics };
  const cards = buildPipeline(d);
  const cols: Record<string, number> = {};
  for (const c of cards) cols[c.column] = (cols[c.column] ?? 0) + 1;
  console.log('HAPPENING', JSON.stringify(happening(d)));
  console.log('PENDING', JSON.stringify(pendingItems(d).map((p) => [p.kind, p.title.slice(0, 50), p.dueLabel])));
  console.log('RECS', JSON.stringify(recommendations(d).map((r) => r.title)));
  console.log('UPCOMING', JSON.stringify(upcoming(d).map((u) => [u.dayLabel, u.account])));
  console.log('PIPELINE', JSON.stringify(cols), 'cards', cards.length, 'kinds', JSON.stringify(cards.reduce((a: Record<string, number>, c) => ({ ...a, [c.kind]: (a[c.kind] ?? 0) + 1 }), {})));
});
