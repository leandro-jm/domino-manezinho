import { INDEXABLE_PATHS, pageMeta } from '@domino/shared';

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Troca o conteúdo de uma tag do molde (title ou meta/link com o atributo dado). */
const swap = (html: string, pattern: RegExp, value: string) => html.replace(pattern, (_m, open: string, close: string) => open + value + close);

/**
 * index.html com título, descrição, canonical e robots da rota, e o endereço público no lugar de __ORIGEM__.
 * O Google lê isso antes de rodar o JS; salas, perfil e rota desconhecida saem como noindex.
 */
export const renderPage = (template: string, path: string, origin: string): string => {
  const meta = pageMeta(path);
  const title = attr(meta.title);
  const description = attr(meta.description);
  const url = `${origin}${meta.canonical}`;
  let html = template.replaceAll('__ORIGEM__', origin);
  html = swap(html, /(<title>)[^<]*(<\/title>)/, title);
  html = swap(html, /(<meta (?:name|property)="(?:og:|twitter:)?title" content=")[^"]*(")/g, title);
  html = swap(html, /(<meta (?:name|property)="(?:og:|twitter:)?description" content=")[^"]*(")/g, description);
  html = swap(html, /(<link rel="canonical" href=")[^"]*(")/, url);
  html = swap(html, /(<meta property="og:url" content=")[^"]*(")/, url);
  html = swap(html, /(<meta name="robots" content=")[^"]*(")/, meta.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
  return html;
};

export const robotsTxt = (origin: string) => `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;

export const sitemapXml = (origin: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${INDEXABLE_PATHS.map(
    (p) => `  <url><loc>${origin}${p}</loc></url>`,
  ).join('\n')}\n</urlset>\n`;
