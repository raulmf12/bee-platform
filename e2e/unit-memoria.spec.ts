import { test, expect } from '@playwright/test';
import { hashText, memoryText, repeatedStructures } from '../supabase/functions/_shared/memory-text';
import { liMapPost, liPostedAt, liUsername } from '../supabase/functions/_shared/linkedin-map';

test.describe('unit · memória anti-repetição e LinkedIn', () => {
  test('texto da memória = frase + legenda, sem hashtags nem placeholder', () => {
    expect(memoryText({ carousel_text: { quote: 'Adotamos metodologias complexas para evitar conversas simples.' }, caption: 'Adotamos metodologias complexas para evitar conversas simples.\n\nMeu terapeuta usava jeans. #lideranca' }))
      .toBe('Adotamos metodologias complexas para evitar conversas simples. — Meu terapeuta usava jeans.');
    expect(memoryText({ title: 'Post importado', caption: 'Um texto que vale como memória do que foi dito.' })).toBe('Um texto que vale como memória do que foi dito.');
    expect(memoryText({ title: 'Oi', caption: '' })).toBeNull();
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });

  test('tiques: detecta fórmulas repetidas nas frases recentes', () => {
    const frases = [
      'O atrito na sua equipe não é um erro de percurso. É um dado sobre a sua estrutura.',
      'O desconforto na sua equipe não é um erro de percurso. É um dado real.',
      'O cansaço da sua equipe não é falta de resiliência. É um dado.',
      'Velocidade sem direção não é agilidade.',
    ];
    const t = repeatedStructures(frases);
    expect(t.some((x) => x.includes('é um dado'))).toBe(true);
    expect(t.some((x) => x.includes('X não é Y'))).toBe(true);
    expect(t.some((x) => x.includes('erro de percurso'))).toBe(false); // só 2×
  });

  test('LinkedIn: perfil, data e só o que o autor escreveu', () => {
    expect(liUsername('https://www.linkedin.com/in/marcos-piccini/?originalSubdomain=br')).toBe('marcos-piccini');
    expect(liUsername('marcospiccini')).toBe('marcospiccini');
    expect(liUsername('https://www.linkedin.com/company/bee')).toBeNull();
    expect(liPostedAt({ posted_at: { timestamp: 1714557600000 } })).toBe('2024-05-01T10:00:00.000Z');
    expect(liPostedAt({ posted_at: { timestamp: 1714557600 } })).toBe('2024-05-01T10:00:00.000Z');
    const p = liMapPost({ urn: 'urn:li:activity:1', url: 'https://www.linkedin.com/posts/x?utm=1', text: '#lideranca\nNunca se investiu tanto em liderança.\nSegunda linha', posted_at: { timestamp: 1714557600000 } });
    expect(p).toMatchObject({ key: 'urn:li:activity:1', url: 'https://www.linkedin.com/posts/x', quote: 'Nunca se investiu tanto em liderança.' });
    expect(liMapPost({ urn: 'urn:li:activity:2', text: '', reshared_post: {} })).toBeNull(); // repost sem texto próprio
    // formato real do scraper (Apify, out/2026): urn como objeto e data em texto
    const real = liMapPost({ urn: { activity_urn: '7513980032831078400', share_urn: null, ugcPost_urn: '7513980032084770816' }, url: 'https://www.linkedin.com/posts/x_abc', text: 'Um post de verdade com texto suficiente.', posted_at: { date: '2026-10-08 17:14:02', timestamp: 1791472442825 } });
    expect(real?.key).toBe('urn:li:activity:7513980032831078400');
    expect(real?.posted_at).toBe(new Date(1791472442825).toISOString());
  });
});
