export const SITE_NAME = 'Dominó Manezinho';

export const DEFAULT_TITLE = 'Dominó Manezinho — Dominó online em duplas na Praça XV, Floripa';
export const DEFAULT_DESCRIPTION =
  'Jogo de dominó online grátis em duplas, do jeito da Praça XV de Florianópolis: chama os amigos pelo WhatsApp ou treina contra os bots, até sem internet. Coisa de mané!';

export interface PageMeta {
  title: string;
  description: string;
  /** Caminho canônico (relativo à origem). */
  canonical: string;
  /** Pode aparecer no Google. Salas, perfil e rota desconhecida não. */
  index: boolean;
}

const PAGES: Record<string, Omit<PageMeta, 'index'>> = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonical: '/' },
  '/bem-vindo': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonical: '/' },
  '/como-jogar': {
    title: 'Como jogar dominó em duplas — regras da Praça XV | Dominó Manezinho',
    description:
      'Regras do dominó em duplas da Praça XV, em Florianópolis: 7 pedras sem compra, saída com a carroça de sena, batida, carroça, lá-e-ló, cruzada, trancado e galo.',
    canonical: '/como-jogar',
  },
};

/** Páginas que entram no sitemap. */
export const INDEXABLE_PATHS = ['/', '/como-jogar'];

export const pageMeta = (path: string): PageMeta => {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const page = PAGES[clean];
  if (!page) return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonical: '/', index: false };
  return { ...page, index: true };
};
