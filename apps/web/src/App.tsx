import { lazy, Suspense, useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { backdropStyle, randomBackdrop } from './lib/backdrop';
import { usePageMeta } from './lib/seo';
import { useSettings } from './lib/settings';
import { inGame, updateNow, useUpdate } from './lib/update';
import { InviteToast } from './components/InviteToast';
import { useOnline } from './store/online';
import { useProfile } from './store/profile';
import { HomeScreen } from './screens/HomeScreen';
import { HowToPlayScreen } from './screens/HowToPlayScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PracticeGameScreen, PracticeSetupScreen } from './screens/PracticeScreens';
import { ProfileScreen } from './screens/ProfileScreen';
import { RankingScreen } from './screens/RankingScreen';
import { RoomScreen } from './screens/RoomScreen';
import { flushPracticeResults } from './offline/results';

// Histórico e replay não são usados na abertura: ficam fora do pacote inicial.
const MatchesScreen = lazy(() => import('./screens/MatchesScreen').then((m) => ({ default: m.MatchesScreen })));
const ReplayScreen = lazy(() => import('./screens/ReplayScreen').then((m) => ({ default: m.ReplayScreen })));
const loading = <div className="center-screen">Buscando…</div>;

export function App() {
  const hasIdentity = useProfile((s) => !!s.local);
  const sync = useProfile((s) => s.sync);
  const highContrast = useSettings((s) => s.highContrast);
  const [location] = useLocation();
  // Fundo dos menus: sorteado a cada vez que o app abre.
  const [backdrop] = useState(randomBackdrop);
  usePageMeta(location);

  const online = useProfile((s) => s.online);
  const updateReady = useUpdate((s) => s.ready);
  const token = useProfile((s) => s.token);

  // Treino que terminou sem rede vai quando a Praça responde de novo; e o socket fica ligado pra chegar convite.
  useEffect(() => {
    if (!online || !token) return;
    void flushPracticeResults();
    useOnline.getState().connect();
  }, [online, token]);

  useEffect(() => {
    void sync();
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  // Servidor estava fora: tenta de novo de tempos em tempos e ao voltar pro app (o evento "online" só vê a rede).
  useEffect(() => {
    if (online) return;
    const timer = setInterval(() => void sync(), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [online, sync]);

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [highContrast]);

  if (!hasIdentity && location !== '/bem-vindo' && location !== '/como-jogar') {
    // Na raiz a boas-vindas aparece no lugar, sem redirecionar: é a página que o Google indexa.
    if (location === '/')
      return (
        <>
          <div className="app-backdrop" style={backdropStyle(backdrop)} aria-hidden="true" />
          <OnboardingScreen />
        </>
      );
    // Guarda o convite (/sala/ABCDE) para voltar a ele depois de criar o perfil.
    if (location.startsWith('/sala/')) sessionStorage.setItem('dm:after-onboarding', location);
    return <Redirect to="/bem-vindo" />;
  }

  return (
    <>
      <div className="app-backdrop" style={backdropStyle(backdrop)} aria-hidden="true" />
      <InviteToast />
      {updateReady && !inGame() && (
        <div className="update-banner" role="status">
          Tem versão nova da Praça.
          <button className="btn small primary" onClick={updateNow}>
            Atualizar
          </button>
        </div>
      )}
      <Switch>
      <Route path="/bem-vindo" component={OnboardingScreen} />
      <Route path="/" component={HomeScreen} />
      <Route path="/treino" component={PracticeSetupScreen} />
      <Route path="/treino/jogo" component={PracticeGameScreen} />
      <Route path="/salas" component={LobbyScreen} />
      <Route path="/sala/:code">{(params) => <RoomScreen code={params.code.toUpperCase()} />}</Route>
      <Route path="/ranking" component={RankingScreen} />
      <Route path="/perfil" component={ProfileScreen} />
      <Route path="/partidas">
        <Suspense fallback={loading}>
          <MatchesScreen />
        </Suspense>
      </Route>
      <Route path="/partidas/:id">
        {(params) => (
          <Suspense fallback={loading}>
            <ReplayScreen id={params.id} />
          </Suspense>
        )}
      </Route>
      <Route path="/como-jogar" component={HowToPlayScreen} />
      <Route>
        <Redirect to="/" />
      </Route>
      </Switch>
    </>
  );
}
