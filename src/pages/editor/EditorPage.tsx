// Pagina /editor — Canvas Studio standalone pra testes.

import { useNavigate } from 'react-router-dom';
import { CanvasStudio } from '@/components/editor/canvas-studio/CanvasStudio';
import { toast } from 'sonner';

export function EditorPage() {
  const navigate = useNavigate();

  return (
    <CanvasStudio
      initialPreset="linkedin-portrait"
      onBack={() => navigate(-1)}
      onSave={async ({ title }) => {
        toast.success(`Salvo: "${title}" (mock — integracao real no Chunk 4)`);
      }}
    />
  );
}
