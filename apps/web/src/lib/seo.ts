import { useEffect } from 'react';
import { pageMeta } from '@domino/shared';

const setAttr = (selector: string, attr: string, value: string) => document.head.querySelector(selector)?.setAttribute(attr, value);

/**
 * Título, descrição, canonical e robots da rota atual. O servidor já manda certo na primeira carga;
 * isso cobre a navegação dentro do app e o index.html que o service worker serve offline.
 */
export function usePageMeta(path: string) {
  useEffect(() => {
    const meta = pageMeta(path);
    const url = `${location.origin}${meta.canonical}`;
    document.title = meta.title;
    setAttr('meta[name="description"]', 'content', meta.description);
    setAttr('meta[property="og:title"]', 'content', meta.title);
    setAttr('meta[property="og:description"]', 'content', meta.description);
    setAttr('meta[property="og:url"]', 'content', url);
    setAttr('link[rel="canonical"]', 'href', url);
    setAttr('meta[name="robots"]', 'content', meta.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
  }, [path]);
}
