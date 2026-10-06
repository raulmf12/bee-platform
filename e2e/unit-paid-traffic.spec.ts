import { test, expect } from '@playwright/test';
import { analyzePaidTraffic, derive, funnelLeak, monthGaps, objectiveLabel, OTHER_KEY, paidInsights, totalsOf, type AdRow, type CampaignRow, type InsightRow } from '../src/lib/campaign/paidTraffic';

const row = (o: Partial<InsightRow> & { date: string; fb_ad_id: string }): InsightRow => ({
  fb_account_id: 'act_1', fb_campaign_id: 'c1', campaign_name: 'Camp 1', ad_name: 'Ad', spend: 0, impressions: 0, reach: 0, clicks: 0, actions: null, action_values: null, ...o,
});
const acts = (o: Record<string, number>) => Object.entries(o).map(([action_type, value]) => ({ action_type, value: String(value) }));

test.describe('unit · tráfego pago por conta do Instagram', () => {
  test('totais e derivados (CPC por clique no link, CPM, ROAS, funil)', () => {
    const t = totalsOf([
      row({ date: '2026-02-02', fb_ad_id: 'a', spend: '100.50', impressions: 10000, reach: 8000, clicks: 300, actions: acts({ link_click: 200, landing_page_view: 100, initiate_checkout: 10, purchase: 2, post_engagement: 500 }), action_values: acts({ purchase: 400 }) }),
      row({ date: '2026-02-03', fb_ad_id: 'b', fb_campaign_id: 'c2', spend: 99.5, impressions: 10000, reach: 9000, clicks: 100, actions: acts({ link_click: 50, landing_page_view: 25 }) }),
    ]);
    expect(t).toMatchObject({ spend: 200, impressions: 20000, reachDaily: 17000, linkClicks: 250, landingPageViews: 125, initiateCheckout: 10, purchases: 2, purchaseValue: 400, engagement: 500, activeDays: 2, campaigns: 2, ads: 2, firstDate: '2026-02-02', lastDate: '2026-02-03' });
    const d = derive(t);
    expect(d.cpc).toBeCloseTo(0.8); expect(d.cpm).toBeCloseTo(10); expect(d.cpa).toBeCloseTo(100); expect(d.roas).toBeCloseTo(2);
    expect(d.linkCtr).toBeCloseTo(0.0125); expect(d.lpvRate).toBeCloseTo(0.5); expect(d.checkoutRate).toBeCloseTo(0.08); expect(d.purchaseRate).toBeCloseTo(0.2);
    expect(derive(totalsOf([])).cpa).toBeNull();
  });

  test('atribuição por conta, outras, meses, objetivos, campanhas, melhores/piores anúncios e dias da semana', () => {
    const ads: AdRow[] = [
      { fb_ad_id: 'a1', name: 'Anúncio campeão', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'conta1', creative: { thumbnail_url: 'https://x/t1.jpg' } },
      { fb_ad_id: 'a2', name: 'Anúncio sem venda', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'conta1', creative: null },
      { fb_ad_id: 'b1', name: 'Anúncio conta 2', fb_campaign_id: 'c2', ig_account_id: 'ig2', ig_username: 'conta2', creative: null },
      { fb_ad_id: 'x1', name: 'Outra conta', fb_campaign_id: 'c2', ig_account_id: 'ig9', ig_username: 'outra', creative: null },
    ];
    const campaigns: CampaignRow[] = [{ fb_campaign_id: 'c1', name: 'Vendas MC', objective: 'OUTCOME_SALES' }, { fb_campaign_id: 'c2', name: 'Tráfego', objective: 'LINK_CLICKS' }];
    const rows = [
      row({ date: '2026-01-05', fb_ad_id: 'a1', spend: 300, impressions: 30000, actions: acts({ link_click: 300, purchase: 3 }), action_values: acts({ purchase: 900 }) }), // segunda
      row({ date: '2026-03-07', fb_ad_id: 'a2', spend: 200, impressions: 10000, actions: acts({ link_click: 50 }) }),                                              // sábado
      row({ date: '2026-03-08', fb_ad_id: 'b1', fb_campaign_id: 'c2', spend: 100, impressions: 5000, actions: acts({ link_click: 120, purchase: 1 }) }),          // domingo
      row({ date: '2026-03-08', fb_ad_id: 'x1', fb_campaign_id: 'c2', spend: 50, impressions: 2000 }),
    ];
    const a = analyzePaidTraffic({ rows, ads, campaigns, accounts: [{ id: 'ig1', username: 'conta1' }, { id: 'ig2', username: 'conta2' }] });
    expect(a.months).toEqual(['2026-01', '2026-03']);
    expect(a.notes.some((n) => n.includes('Meses sem veiculação dentro do período: fev/26.'))).toBe(true);
    const [c1, c2] = a.accounts;
    expect(c1.totals).toMatchObject({ spend: 500, purchases: 3, purchaseValue: 900, ads: 2 });
    expect(c2.totals).toMatchObject({ spend: 100, purchases: 1 });
    expect(a.other?.key).toBe(OTHER_KEY);
    expect(a.other?.totals.spend).toBe(50);
    expect(a.total.totals.spend).toBe(650);
    expect(a.coverage).toEqual({ rows: 4, attributedRows: 3, unattributedSpend: 50 });
    expect(c1.monthly.map((m) => [m.month, m.spend, m.purchases])).toEqual([['2026-01', 300, 3], ['2026-03', 200, 0]]);
    expect(c1.objectives.map((o) => [o.objective, o.totals.spend])).toEqual([['Vendas', 500]]);
    expect(c2.objectives[0].objective).toBe('Tráfego');
    expect(c1.campaigns[0]).toMatchObject({ label: 'Camp 1', objective: 'Vendas' });
    expect(c1.bestAds.map((x) => x.label)).toEqual(['Anúncio campeão']);
    expect(c1.bestAds[0].thumbnail).toBe('https://x/t1.jpg');
    expect(c1.worstAds.map((x) => [x.label, x.totals.spend])).toEqual([['Anúncio sem venda', 200]]);
    expect(c1.weekdays.find((d) => d.label === 'segunda')).toMatchObject({ spend: 300, purchases: 3, cpa: 100 });
    expect(c1.weekdays.map((d) => d.label)).toEqual(['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']);
  });

  test('conclusões a partir dos números (eficiência comparada, desperdício, funil, orgânico)', () => {
    const ads: AdRow[] = [
      { fb_ad_id: 'a1', name: 'A1', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'conta1', creative: null },
      { fb_ad_id: 'a2', name: 'A2 caro', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'conta1', creative: null },
      { fb_ad_id: 'b1', name: 'B1', fb_campaign_id: 'c2', ig_account_id: 'ig2', ig_username: 'conta2', creative: null },
    ];
    const rows = [
      row({ date: '2026-03-02', fb_ad_id: 'a1', spend: 300, impressions: 30000, actions: acts({ link_click: 300, landing_page_view: 150, initiate_checkout: 30, purchase: 3, post_engagement: 1000 }), action_values: acts({ purchase: 600 }) }),
      row({ date: '2026-03-03', fb_ad_id: 'a2', spend: 150, impressions: 10000, actions: acts({ link_click: 40 }) }),
      row({ date: '2026-03-04', fb_ad_id: 'b1', fb_campaign_id: 'c2', spend: 600, impressions: 20000, actions: acts({ link_click: 100, landing_page_view: 20, initiate_checkout: 5, purchase: 2 }) }),
    ];
    const a = analyzePaidTraffic({ rows, ads, campaigns: [{ fb_campaign_id: 'c1', name: 'MC Vendas', objective: 'OUTCOME_SALES' }, { fb_campaign_id: 'c2', name: 'MC2', objective: 'OUTCOME_SALES' }], accounts: [{ id: 'ig1', username: 'conta1' }, { id: 'ig2', username: 'conta2' }] });
    const ins = paidInsights(a, [{ username: 'conta1', followers: 1500, posts: 100, avgInteractions: 20 }]);
    const text = ins.map((i) => i.text).join('\n').replace(/\u00a0/g, ' ');
    expect(text).toContain('No período (02/03/2026 a 04/03/2026) foram investidos R$ 1.050,00 em 2 campanhas e 3 anúncios, gerando 5 compras');
    expect(text).toContain('Em vendas, @conta1 foi 2,0× mais eficiente que @conta2');
    expect(text).toContain('Mil impressões custaram R$ 30,00 em @conta2 contra R$ 11,25 em @conta1');
    expect(text).toContain('@conta1: R$ 150,00 foram para os 1 anúncios de maior gasto sem nenhuma compra');
    expect(text).toContain('a campanha mais eficiente foi "Camp 1" (3 compras a R$ 150,00)');
    expect(text).toContain('~2.000 interações orgânicas nos 100 posts importados (1.500 seguidores)');
    expect(text).toContain('cobriram 57,1% do investimento');
    expect(text).not.toContain('tem o clique mais barato');   // aqui quem tem clique barato também converte melhor
    expect(funnelLeak(a.accounts[1])).toEqual({ step: 'clique → visita à página', rate: 0.2 });
    expect(paidInsights(analyzePaidTraffic({ rows: [], ads: [], campaigns: [], accounts: [] }))[0].kind).toBe('atencao');
  });

  test('clique barato que converte pior vira alerta; anúncio com 1 compra fica atrás dos com 2+', () => {
    const ads: AdRow[] = [
      { fb_ad_id: 'a1', name: 'A1 1 compra barata', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'barata', creative: null },
      { fb_ad_id: 'a2', name: 'A2 2 compras', fb_campaign_id: 'c1', ig_account_id: 'ig1', ig_username: 'barata', creative: null },
      { fb_ad_id: 'b1', name: 'B1', fb_campaign_id: 'c1', ig_account_id: 'ig2', ig_username: 'cara', creative: null },
    ];
    const rows = [
      row({ date: '2026-03-02', fb_ad_id: 'a1', spend: 10, impressions: 1000, actions: acts({ link_click: 50, landing_page_view: 40, initiate_checkout: 1, purchase: 1 }) }),
      row({ date: '2026-03-02', fb_ad_id: 'a2', spend: 990, impressions: 50000, actions: acts({ link_click: 950, landing_page_view: 760, initiate_checkout: 9, purchase: 2 }) }),
      row({ date: '2026-03-02', fb_ad_id: 'b1', spend: 600, impressions: 30000, actions: acts({ link_click: 200, landing_page_view: 150, initiate_checkout: 30, purchase: 6 }) }),
    ];
    const a = analyzePaidTraffic({ rows, ads, campaigns: [], accounts: [{ id: 'ig1', username: 'barata' }, { id: 'ig2', username: 'cara' }] });
    expect(a.accounts[0].bestAds.map((x) => x.label)).toEqual(['A2 2 compras', 'A1 1 compra barata']);
    const text = paidInsights(a).map((i) => i.text).join('\n').replace(/ /g, ' ');
    expect(text).toContain('@barata tem o clique mais barato (CPC R$ 1,00, CTR do link 2,0%)');
    expect(text).not.toContain('cobriram');   // sem valor de compra registrado, não fala de ROAS
    expect(text).toContain('1,3% das visitas iniciam checkout contra 20,0% em @cara');
  });

  test('rótulos e lacunas', () => {
    expect(objectiveLabel('LINK_CLICKS')).toBe('Tráfego');
    expect(objectiveLabel('POST_ENGAGEMENT')).toBe('Engajamento');
    expect(objectiveLabel(null)).toBe('Sem objetivo');
    expect(monthGaps(['2025-02', '2025-03', '2025-06'])).toEqual(['2025-04', '2025-05']);
  });
});
