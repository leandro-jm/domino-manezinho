import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers';

const ORIGIN = 'https://domino.exemplo.com.br';
let s: TestServer;

beforeAll(async () => {
  // O molde de verdade, como sai do build.
  const dist = mkdtempSync(join(tmpdir(), 'domino-web-'));
  writeFileSync(join(dist, 'index.html'), readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8'));
  s = await startServer({}, { config: { webDist: dist, publicUrl: ORIGIN } });
});
afterAll(() => s.close());

const page = async (url: string) => {
  const res = await s.app.inject({ method: 'GET', url });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  return res.body;
};

describe('SEO', () => {
  it('home sai com canonical, Open Graph e JSON-LD no endereço público', async () => {
    const html = await page('/');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.jpg" />`);
    expect(html).toContain('"@type": ["VideoGame", "WebApplication"]');
    expect(html).toContain('content="index, follow');
    expect(html).not.toContain('__ORIGEM__');
  });

  it('cada página pública tem título e canonical próprios', async () => {
    const html = await page('/como-jogar');
    expect(html).toMatch(/<title>Como jogar dominó em duplas[^<]*<\/title>/);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/como-jogar" />`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/como-jogar" />`);
    expect(await page('/bem-vindo')).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
  });

  it('sala, perfil e rota desconhecida ficam fora do Google', async () => {
    for (const url of ['/sala/ABCDE', '/perfil', '/partidas/123', '/nao-existe']) {
      expect(await page(url)).toContain('<meta name="robots" content="noindex, follow" />');
    }
  });

  it('robots.txt e sitemap.xml apontam pro endereço público', async () => {
    const robots = await s.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots.body).toContain('Disallow: /api/');
    const sitemap = await s.app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(sitemap.headers['content-type']).toContain('application/xml');
    expect(sitemap.body).toContain(`<loc>${ORIGIN}/como-jogar</loc>`);
    expect(sitemap.body).not.toContain('/sala/');
  });

  it('arquivo que não existe continua 404', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/models/sumiu.glb' })).statusCode).toBe(404);
  });
});
