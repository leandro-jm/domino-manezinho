import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppBoundary } from './components/AppBoundary';
import './lib/install';
import './lib/update';
import { API_BASE } from './lib/api';
import { loadRuntimeFlags } from './lib/flags';
import { watchGlobalErrors } from './lib/report';
import './styles.css';

watchGlobalErrors();

// Flags de runtime antes da primeira renderização (com teto de espera, pra não atrasar a abertura offline).
// Sem top-level await: o build do Vite mira es2020.
void Promise.race([loadRuntimeFlags(API_BASE), new Promise((r) => setTimeout(r, 1500))]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppBoundary>
        <App />
      </AppBoundary>
    </StrictMode>,
  );
});
