import { expect, test } from '@playwright/test';
import { autoPlay, newPlayer, onboard } from './helpers';

test('joga uma partida inteira contra bots, acha no histórico e revê mão a mão', async ({ browser }) => {
  // Partida até 6 com bots no ritmo de gente: alguns minutos.
  test.setTimeout(480_000);
  const stamp = Date.now().toString(36).slice(-4);
  const page = await newPlayer(browser, {}, '2d');

  await page.goto('/');
  await onboard(page, `Revisor ${stamp}`);
  await page.getByRole('link', { name: /Jogar com a turma/ }).click();
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await page.waitForURL(/\/sala\/[A-Z]{5}$/);
  await page.getByRole('button', { name: 'Completar com bots' }).click();
  await page.getByRole('button', { name: 'Começar partida' }).click();
  await expect(page.locator('.hand-tile')).toHaveCount(7);

  // Placar grande só aparece no fim da partida (o fim de cada mão mostra o placar pequeno).
  const bigScore = page.locator('.overlay-card .big-score');
  await autoPlay(page, () => bigScore.isVisible().catch(() => false), 420_000);
  const finalScore = (await bigScore.textContent())!.trim();
  expect(finalScore).toMatch(/^Nós \d+ × \d+ Eles$/);
  await page.locator('.overlay-card').getByRole('button', { name: 'Sair da mesa' }).click();

  await page.goto('/perfil');
  await page.getByRole('link', { name: 'Minhas partidas e replays' }).click();
  await page.waitForURL('**/partidas');
  const row = page.locator('.match-row').first();
  await expect(row).toContainText(finalScore);
  await row.click();
  await page.waitForURL(/\/partidas\/.+/);

  // Começo da mão: 28 pedras nas mãos, mesa vazia.
  await expect(page.locator('.replay-tiles .tile-face')).toHaveCount(28);
  await page.getByRole('button', { name: 'Próxima jogada' }).click();
  await expect(page.locator('.replay-caption')).toContainText('saiu com 6-6');
  await expect(page.locator('.replay-tiles .tile-face')).toHaveCount(27);

  // Última mão, até o fim: o placar do replay fecha com o da partida.
  const tabs = page.getByRole('tab');
  if (await tabs.count()) await tabs.last().click();
  await page.getByRole('button', { name: 'Fim da mão' }).click();
  await expect(page.locator('.replay-caption')).toContainText(/bateu|Trancou/);
  await expect(page.getByText(finalScore.replace('Nós', 'Placar: nós').replace('Eles', 'eles'))).toBeVisible();
});
