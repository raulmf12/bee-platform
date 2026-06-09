import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore, needsOnboarding } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { PostsKanban } from '@/pages/posts/PostsKanban';
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
import { NewVideoPost } from '@/pages/posts/NewVideoPost';
import { Podcasts } from '@/pages/podcasts/Podcasts';
import { NewPodcastClip } from '@/pages/podcasts/NewPodcastClip';
import { EditorPage } from '@/pages/editor/EditorPage';

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
        <Route
          path="/editor"
          element={
            <ProtectedRoute>
              <EditorPage />
            </ProtectedRoute>
          }
        />
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
          <Route path="posts" element={<PostsKanban />} />
          <Route path="posts/novo" element={<NewPost />} />
          <Route path="posts/novo-video" element={<NewVideoPost />} />
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
