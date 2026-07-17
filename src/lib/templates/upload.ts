// Helpers de upload de imagem compartilhados pelo editor.
// Imagens viram data URL: ficam embutidas no template/post, sem storage.

// 4MB por imagem — acima disso o data URL estoura o localStorage dos uploads
// e incha o template_config no banco.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
