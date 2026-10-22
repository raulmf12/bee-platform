import { test, expect } from '@playwright/test';
import { canvasSignature, canvasTextPatch, quoteFromCanvas, createEditorQueue } from '../src/lib/editorSnapshot';
import { imageAssetPath } from '../src/lib/storagePath';

test('frase identificada prevalece sobre decoração', () => {
  expect(quoteFromCanvas({ objects: [{ text: 'Logo' }, { name: 'bee-quote', text: 'Nova' }] })).toBe('Nova');
});
test('identifica slot dentro de grupos e mantém frase vazia', () => {
  expect(quoteFromCanvas({ objects: [{ objects: [{ beeSlot: { content_key: 'quote' }, text: '' }] }] })).toBe('');
});
test('não adivinha entre duas frases identificadas', () => {
  expect(quoteFromCanvas({ objects: [{ name: 'bee-quote', text: 'A' }, { name: 'bee-quote', text: 'B' }] })).toBeUndefined();
});
test('preserva legenda e outros campos ao sincronizar frase', () => {
  expect(canvasTextPatch({ name: 'bee-quote', text: 'Nova' }, { caption: 'Legenda', autor: 'Autor' })).toEqual({ carousel_text: { caption: 'Legenda', autor: 'Autor', quote: 'Nova' } });
  expect(canvasTextPatch({ objects: [{ text: 'Sem slot' }] }, { quote: 'Original' })).toEqual({});
});
test('ordem de chaves JSONB não representa edição', () => {
  expect(canvasSignature({ a: 1, b: { c: 2, d: 3 } })).toBe(canvasSignature({ b: { d: 3, c: 2 }, a: 1 }));
});
test('mudança de texto e ordem de camadas representam edição', () => {
  expect(canvasSignature({ objects: ['A', 'B'] })).not.toBe(canvasSignature({ objects: ['B', 'A'] }));
  expect(canvasSignature({ text: 'A' })).not.toBe(canvasSignature({ text: 'B' }));
});
test('render imutável tem URL exclusiva e mantém extensão', () => {
  const a = imageAssetPath('user', 'post', 'render.jpg', true);
  expect(a).toMatch(/^user\/assets\/post\/render-[0-9a-f-]+\.jpg$/);
  expect(imageAssetPath('user', 'post', 'render.jpg', true)).not.toBe(a);
});
test('chamadores sem opção imutável mantêm caminho anterior', () => {
  expect(imageAssetPath('u', 'a', 'preview.png')).toBe('u/assets/a/preview.png');
});
test('aprovação espera salvamento e fila continua depois de falha', async () => {
  const queue = createEditorQueue();
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const save = queue(async () => { events.push('salvar'); await gate; events.push('salvo'); });
  const approve = queue(async () => { events.push('aprovar'); });
  await Promise.resolve();
  expect(events).toEqual(['salvar']);
  release(); await Promise.all([save, approve]);
  expect(events).toEqual(['salvar', 'salvo', 'aprovar']);
  await expect(queue(async () => { throw new Error('falha'); })).rejects.toThrow('falha');
  await expect(queue(async () => 'retomado')).resolves.toBe('retomado');
});
