import { expect, test } from '@playwright/test';
import { autoPlay, handEnded, newPlayer, onboard } from './helpers';

test('treino offline: joga uma mão inteira contra os bots e retoma depois de recarregar', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await onboard(page, 'Zé Treino');

  await page.getByRole('link', { name: /Treinar contra bots/ }).click();
  await page.getByText('É um monstro').first().click();
  await page.getByRole('button', { name: 'Bora!' }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.hand-tile')).toHaveCount(7);
  await expect(page.locator('.seat-label')).toHaveCount(3);

  await autoPlay(page, handEnded(page));
  await expect(page.locator('.overlay-card h2')).toHaveText(/Batida|Lá-e-ló|Cruzada|Trancou/);

  // Recarregou no meio: a partida fica salva e continua.
  await page.reload();
  await expect(page.locator('.scoreboard')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Continuar treino/ })).toBeVisible();
});
