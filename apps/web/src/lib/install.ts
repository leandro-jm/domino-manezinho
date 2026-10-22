import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallStore {
  prompt: BeforeInstallPromptEvent | null;
  install: () => Promise<void>;
}

export const useInstall = create<InstallStore>((set, get) => ({
  prompt: null,
  install: async () => {
    const p = get().prompt;
    if (!p) return;
    await p.prompt();
    await p.userChoice;
    set({ prompt: null });
  },
}));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  useInstall.setState({ prompt: e as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null }));
