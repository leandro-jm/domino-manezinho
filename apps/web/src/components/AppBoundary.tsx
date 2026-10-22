import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/report';

/** Último recurso: erro de render não deixa a tela branca para sempre; oferece limpar o treino salvo e recarregar. */
export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error('[app] erro de tela', err);
    reportError('render', err);
  }

  private reset = () => {
    try {
      localStorage.removeItem('dm:offline');
    } catch {
      // sem armazenamento
    }
    window.location.assign('/');
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen">
        <div className="card">
          <p>Deu ruim aqui, mané. Tenta de novo.</p>
          <button className="btn primary" onClick={this.reset}>
            Voltar pro começo
          </button>
        </div>
      </main>
    );
  }
}
