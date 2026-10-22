/** Versões finais recebem endereço próprio: nunca sobrescrevem pacotes anteriores. */
export function imageAssetPath(userId: string, assetId: string, filename: string, immutable = false): string {
  const dot = filename.lastIndexOf('.');
  const name = immutable
    ? dot > 0 ? `${filename.slice(0, dot)}-${crypto.randomUUID()}${filename.slice(dot)}` : `${filename}-${crypto.randomUUID()}`
    : filename;
  return `${userId}/assets/${assetId}/${name}`;
}
