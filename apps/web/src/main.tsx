import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppBoundary } from './components/AppBoundary';
import './lib/install';
import './lib/update';
import { watchGlobalErrors } from './lib/report';
import './styles.css';

watchGlobalErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
