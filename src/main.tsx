import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

// Limpeza unica do IndexedDB legado (versao pre-Supabase).
// Decisao 3A do usuario: comecar limpo apos migracao.
const MIGRATION_FLAG = 'bee:migrated_to_supabase_v1';
if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATION_FLAG)) {
  // Apaga base Dexie antiga e flags relacionadas.
  try {
    indexedDB.deleteDatabase('bee-platform');
    localStorage.removeItem('bee:current_user_id');
  } catch (e) {
    console.warn('[migration] falha limpando IndexedDB legado', e);
  }
  localStorage.setItem(MIGRATION_FLAG, '1');
}

// Roteador de dados (antes BrowserRouter): necessário para avisar antes de sair de uma tela com edição
// pendente (useBlocker — doc 04 §11.2). As rotas continuam declaradas em <App /> (rota curinga).
const router = createBrowserRouter([{ path: '*', element: <><App /><Toaster richColors position="top-right" /></> }]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
