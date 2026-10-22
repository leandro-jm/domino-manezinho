import type { Browser, Page } from '@playwright/test';

/**
 * Contexto novo (= aparelho novo), sem som. `quality: '2d'` dispensa a cena 3D: com vários navegadores
 * renderizando por software (sem GPU), as pessoas animadas deixariam tudo lento demais.
 */
export const newPlayer = async (browser: Browser, options: Parameters<Browser['newContext']>[0] = {}, quality = 'baixa') => {
  const context = await browser.newContext(options);
  await context.addInitScript((q) => {
    if (!localStorage.getItem('dm:settings')) {
      localStorage.setItem('dm:settings', JSON.stringify({ quality: q, sound: false, ambience: false }));
    }
  }, quality);
  return context.newPage();
};

export const onboard = async (page: Page, nickname: string) => {
  await page.waitForURL('**/bem-vindo');
  await page.getByLabel('Apelido').fill(nickname);
  await page.getByRole('button', { name: 'Bora pra praça!' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/bem-vindo'));
};

const visible = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);

/** Joga sozinho sempre que for a vez: pedra jogável (escolhendo a ponta se precisar) ou toc-toc. */
export const autoPlay = async (page: Page, done: () => Promise<boolean>, maxMs = 180_000) => {
  const deadline = Date.now() + maxMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error('autoPlay: tempo esgotado');
    if (await visible(page, '.pass-btn')) {
      await page.locator('.pass-btn').click({ timeout: 2000 }).catch(() => undefined);
    } else if (await visible(page, '.hand-tile.is-playable')) {
      await page.locator('.hand-tile.is-playable').first().click({ timeout: 2000 }).catch(() => undefined);
      if (await visible(page, '.side-chooser .btn')) {
        await page.locator('.side-chooser .btn').first().click({ timeout: 2000 }).catch(() => undefined);
      }
    }
    await page.waitForTimeout(150);
  }
};

export const handEnded = (page: Page) => () => visible(page, '.overlay-card');
