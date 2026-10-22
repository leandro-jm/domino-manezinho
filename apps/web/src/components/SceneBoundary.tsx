import { Component, type ReactNode } from 'react';

/** Se a cena 3D quebrar (modelo que não carregou, shader que o aparelho recusa…), não derruba a partida. */
export class SceneBoundary extends Component<{ onError: (err: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    this.props.onError(err);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
