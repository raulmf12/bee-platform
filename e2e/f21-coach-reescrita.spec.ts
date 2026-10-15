import { test, expect, type Page } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { mockEdge, mockProduction } from './helpers/mocks';

// F21 — Coach do editor da peça: além de destilar a lição (voice-coach), cada feedback volta com o
// texto REESCRITO (post-chat em modo 'rewrite') e um "Aplicar" que troca a legenda/frase do post.
test.describe('F21 · Coach reescreve o texto da peça', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  const ORIGINAL = 'O crachá de alta performance esconde uma verdade desconfortável.\n\nMuitos executivos recebem bônus sob aplausos.';

  async function seedPost() {
    return seed('user_posts', {
      platform: 'linkedin', format: 'image', status: 'approved', title: 'Reflexão', caption: ORIGINAL,
      carousel_text: { quote: 'Bater todas as metas pode destruir valor' },
      metadata: { editorial_slug: 'reflexao-filosofica-curta' },
      rendered_slides: { slide1: 'https://x.test/a.jpg' },     // já renderizada: o editor não sobe imagem ao abrir
    });
  }

  async function mocks(page: Page) {
    const chat: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'voice-coach', () => ({
      success: true, reply: 'Entendi: tom mais próximo, sem apontar o dedo.',
      proposals: [{ texto: 'Substitua tom acusatório por análise sóbria.', categoria: 'tom', facet: 'legenda', scope: { editorial_slug: 'reflexao-filosofica-curta', platform: 'linkedin', target_avatar: null } }],
    }));
    await mockEdge(page, 'post-chat', (b) => {
      const msgs = b.messages as Array<{ content: string }>;
      const frase = /frase/i.test(msgs[msgs.length - 1].content);
      return {
        success: true, reply: 'Reescrevi mantendo a linha narrativa.',
        suggestions: frase
          ? [{ field: 'titulo', text: 'Bater a meta nem sempre é gerar valor', label: 'Mais sóbria' }]
          : [{ field: 'legenda', text: 'Existe um fenômeno silencioso nas salas de reunião.\n\nNão é má-fé: é o sistema.', label: 'Tom sóbrio' }],
      };
    }, chat);
    return chat;
  }

  test('feedback → legenda reescrita → Aplicar grava no post (correção da IA) e permite desfazer', async ({ page }) => {
    const chat = await mocks(page);
    const pid = await seedPost();
    await page.goto(`/posts/${pid}`);
    await page.getByRole('button', { name: /Coach: corrigir este post/ }).click();
    await page.getByPlaceholder('O que não ficou bom?').fill('A legenda está distante e agressiva. A linha narrativa está ok.');
    await page.keyboard.press('Enter');
    const card = page.getByTestId('coach-rewrite');
    await expect(card).toContainText('Nova legenda');
    await expect(card).toContainText('fenômeno silencioso');
    await expect(page.getByText('Substitua tom acusatório')).toBeVisible();          // a lição continua sendo proposta
    // a reescrita parte do texto ATUAL do editor, no modo de reescrita
    expect(chat[0].mode).toBe('rewrite');
    expect((chat[0].post as { caption: string; id: string }).caption).toBe(ORIGINAL);
    expect((chat[0].post as { id: string }).id).toBe(pid);

    await page.getByTestId('coach-apply').click();
    await expect(card).toContainText('Aplicada');
    await expect(page.locator('#caption')).toHaveValue(/fenômeno silencioso/);
    await expect.poll(async () => (await sql<{ caption: string; r: number; m: number }>(`select caption, coalesce(ai_edit_rounds,0) r, coalesce(manual_edits,0) m from user_posts where id='${pid}'`))[0])
      .toEqual({ caption: 'Existe um fenômeno silencioso nas salas de reunião.\n\nNão é má-fé: é o sistema.', r: 1, m: 0 });

    await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
    await expect(page.locator('#caption')).toHaveValue(ORIGINAL);
    await expect.poll(async () => (await sql<{ caption: string }>(`select caption from user_posts where id='${pid}'`))[0].caption).toBe(ORIGINAL);
  });

  test('"Nova frase" → Aplicar troca o texto da imagem e re-renderiza no mesmo template', async ({ page }) => {
    test.setTimeout(120_000);
    await mockProduction(page);
    await mocks(page);
    const pid = await seedPost();
    await page.goto(`/posts/${pid}`);
    await page.getByRole('button', { name: /Coach: corrigir este post/ }).click();
    await page.getByRole('button', { name: 'Nova frase' }).click();
    await expect(page.getByTestId('coach-rewrite')).toContainText('Nova frase');
    await page.getByTestId('coach-apply').click();
    await expect.poll(async () => (await sql<{ q: string; r: number; img: string }>(`select carousel_text->>'quote' q, coalesce(ai_edit_rounds,0) r, rendered_slides->>'slide1' img from user_posts where id='${pid}'`))[0], { timeout: 90_000 })
      .toMatchObject({ q: 'Bater a meta nem sempre é gerar valor', r: 1 });
    await expect.poll(async () => (await sql<{ img: string }>(`select rendered_slides->>'slide1' img from user_posts where id='${pid}'`))[0].img, { timeout: 90_000 })
      .not.toBe('https://x.test/a.jpg');                                            // imagem nova com a frase nova
  });
});
