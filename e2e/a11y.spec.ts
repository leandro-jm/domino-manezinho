import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newPlayer, onboard } from './helpers';

/** Problemas sérios ou críticos do axe (WCAG 2 A/AA) na tela como está agora. */
const violations = async (page: Page) => {
  // Medir no meio de um fade dá contraste falso: espera as animações que terminam (as em laço ficam de fora).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

test('telas principais sem problema sério de acessibilidade, e dá pra jogar só com o teclado', async ({ browser }) => {
  const page = await newPlayer(browser, {}, '2d');
  await page.goto('/');
  await page.getByLabel('Apelido').waitFor();
  expect(await violations(page)).toEqual([]);

  await onboard(page, 'Teclado');
  expect(await violations(page)).toEqual([]);

  await page.goto('/treino');
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Bora!' }).click();
  await expect(page.locator('.hand-tile')).toHaveCount(7);
  expect(await violations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Configurações' }).click();
  const dialog = page.getByRole('dialog', { name: 'Configurações' });
  await expect(dialog).toBeVisible();
  // O foco entra no diálogo e Esc fecha.
  await expect(dialog.getByRole('button', { name: 'Pronto' })).toBeFocused();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Uma mão inteira só com o teclado: número escolhe a pedra, seta escolhe a ponta, P passa.
  const deadline = Date.now() + 120_000;
  while (!(await page.locator('.overlay-card').isVisible())) {
    expect(Date.now()).toBeLessThan(deadline);
    const status = (await page.locator('.hud-status').textContent()) ?? '';
    if (status.includes('toc-toc')) await page.keyboard.press('p');
    else if (status.includes('Tua vez')) {
      const tiles = page.locator('.hand-tile');
      const count = await tiles.count();
      for (let i = 0; i < count; i++) {
        if (await tiles.nth(i).isEnabled()) {
          await page.keyboard.press(String(i + 1));
          break;
        }
      }
      if (await page.locator('.side-chooser').isVisible()) await page.keyboard.press('ArrowLeft');
    }
    await page.waitForTimeout(200);
  }
  await expect(page.locator('.overlay-card h2')).toHaveText(/Batida|Lá-e-ló|Cruzada|Trancou/);
});
