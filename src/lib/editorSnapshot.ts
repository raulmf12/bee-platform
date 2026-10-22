/** Captura síncrona: não depende do debounce da prévia do editor. */
export interface EditorSnapshot { fabricJson: object; dataUrl: string }

export function canvasSignature(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    }
    return item;
  });
}

/** Só sincroniza a frase quando existe exatamente um campo identificado. */
export function quoteFromCanvas(value: unknown): string | undefined {
  const found: string[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const item = node as { name?: string; text?: string; beeSlot?: { content_key?: string }; objects?: unknown[] };
    if ((item.name === 'bee-quote' || item.beeSlot?.content_key === 'quote') && typeof item.text === 'string') found.push(item.text);
    item.objects?.forEach(visit);
  }
  visit(value);
  return found.length === 1 ? found[0] : undefined;
}

export function canvasTextPatch(value: unknown, previous: Record<string, unknown> | null | undefined) {
  const quote = quoteFromCanvas(value);
  return quote === undefined ? {} : { carousel_text: { ...previous, quote } };
}

/** Uma falha não envenena as próximas operações de salvamento. */
export function createEditorQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
}
