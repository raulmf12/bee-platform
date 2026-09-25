import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore, needsOnboarding } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { NewPost } from '@/pages/posts/NewPost';
import { PostEditor } from '@/pages/posts/PostEditor';
import { Biblioteca } from '@/pages/biblioteca/Biblioteca';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { OnboardingWizard } from '@/pages/onboarding/OnboardingWizard';
import { KnowledgeBase } from '@/pages/conhecimento/KnowledgeBase';
import { Produtos } from '@/pages/produtos/Produtos';
import { Editoriais } from '@/pages/editoriais/Editoriais';
import { Arsenal } from '@/pages/arsenal/Arsenal';
import { Curadoria } from '@/pages/curadoria/Curadoria';
import { LinhasEditoriais } from '@/pages/linhas/LinhasEditoriais';
import { Podcasts } from '@/pages/podcasts/Podcasts';
import { NewPodcastClip } from '@/pages/podcasts/NewPodcastClip';
import { Templates } from '@/pages/templates/Templates';
import { TemplateEditor } from '@/pages/templates/TemplateEditor';
import { Genesis } from '@/pages/genesis/Genesis';
import { Directives } from '@/pages/directives/Directives';
import { Aprendizado } from '@/pages/aprendizado/Aprendizado';
import { Coach } from '@/pages/coach/Coach';
import { Feedback } from '@/pages/feedback/Feedback';
import { Personas } from '@/pages/personas/Personas';
import { Agenda } from '@/pages/agenda/Agenda';
import { HivePreview } from '@/pages/hive/HivePreview';
import { HiveAssets } from '@/pages/hive/HiveAssets';
import { HiveMarcos } from '@/pages/hive/HiveMarcos';
import { HiveConvite } from '@/pages/hive/HiveConvite';
import { HiveTesteM02 } from '@/pages/hive/HiveTesteM02'; // TEMP: apagar depois
import { HiveTesteM01 } from '@/pages/hive/HiveTesteM01'; // TEMP: apagar depois
import { Custos } from '@/pages/custos/Custos';
import { ImageLab } from '@/pages/labs/ImageLab';
import { Pipeline } from '@/pages/pipeline/Pipeline';
import { Performance } from '@/pages/desempenho/Performance';
import { OneContent } from '@/pages/criar/OneContent';
import { CreateHub } from '@/pages/criar/CreateHub';
import { Campaigns } from '@/pages/campanhas/Campaigns';
import { NewCampaign } from '@/pages/campanhas/NewCampaign';
import { CampaignDetail } from '@/pages/campanhas/CampaignDetail';
import { Production } from '@/pages/producao/Production';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, settings, initialized } = useAuthStore();
  if (!initialized) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (needsOnboarding(settings)) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { currentUser, initialized } = useAuthStore();
  if (!initialized) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { init, initialized } = useAuthStore();

  useEffect(() => {
    void init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Editor de templates: tela cheia, fora do AppShell (precisa da largura).
            O editor de post continua embutido no PostEditor. */}
        <Route
          path="/templates/:id"
          element={
            <ProtectedRoute>
              <TemplateEditor />
            </ProtectedRoute>
          }
        />
        {/* O /editor solto virou o editor de templates. */}
        <Route path="/editor" element={<Navigate to="/templates" replace />} />
        <Route
          path="/onboarding"
          element={
            <OnboardingGate>
              <OnboardingWizard />
            </OnboardingGate>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="genesis" element={<Genesis />} />
          <Route path="diretrizes" element={<Directives />} />
          <Route path="alma" element={<Navigate to="/genesis" replace />} />
          <Route path="templates" element={<Templates />} />
          <Route path="aprendizado" element={<Aprendizado />} />
          <Route path="coach" element={<Coach />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="personas" element={<Personas />} />
          {/* O kanban virou o Dashboard — links antigos pra /posts caem la. */}
          <Route path="posts" element={<Navigate to="/" replace />} />
          <Route path="posts/novo" element={<NewPost />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="desempenho" element={<Performance />} />
          <Route path="hive/preview" element={<HivePreview />} />
          <Route path="hive/assets" element={<HiveAssets />} />
          <Route path="hive/marcos" element={<HiveMarcos />} />
          <Route path="hive/convite" element={<HiveConvite />} />
          <Route path="hive/teste-m02" element={<HiveTesteM02 />} /> {/* TEMP: apagar depois */}
          <Route path="hive/teste-m01" element={<HiveTesteM01 />} /> {/* TEMP: apagar depois */}
          <Route path="custos" element={<Custos />} />
          <Route path="labs/imagens" element={<ImageLab />} />
          <Route path="criar" element={<CreateHub />} />
          <Route path="criar/conteudo" element={<OneContent />} />
          <Route path="campanhas" element={<Campaigns />} />
          <Route path="campanhas/nova" element={<NewCampaign />} />
          <Route path="campanhas/:id" element={<CampaignDetail />} />
          <Route path="producao" element={<Production />} />
          {/* Vídeo virou parte do wizard (NewPost). Rota antiga redireciona. */}
          <Route path="posts/novo-video" element={<Navigate to="/posts/novo" replace />} />
          <Route path="podcasts" element={<Podcasts />} />
          <Route path="podcasts/novo" element={<NewPodcastClip />} />
          <Route path="posts/:id" element={<PostEditor />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="editoriais" element={<Editoriais />} />
          <Route path="arsenal" element={<Arsenal />} />
          <Route path="curadoria" element={<Curadoria />} />
          <Route path="linhas" element={<LinhasEditoriais />} />
          <Route path="biblioteca" element={<Biblioteca />} />
          <Route path="conhecimento" element={<KnowledgeBase />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}
