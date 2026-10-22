import { expect, test, type Page } from '@playwright/test';
import { autoPlay, handEnded, newPlayer, onboard } from './helpers';

const NAMES = ['Dono da Mesa', 'Parceiro', 'Rival Um', 'Rival Dois'];

test('quatro amigos entram pelo link, jogam uma mão e um deles reconecta no meio', async ({ browser }) => {
  const stamp = Date.now().toString(36).slice(-4);
  // Quatro navegadores ao mesmo tempo: mesa 2D (o 3D é coberto pelo teste offline).
  const [owner, ...friends] = await Promise.all(NAMES.map(() => newPlayer(browser, {}, '2d')));

  await owner!.goto('/');
  await onboard(owner!, `${NAMES[0]} ${stamp}`);
  await owner!.getByRole('link', { name: /Jogar com a turma/ }).click();
  await owner!.getByRole('button', { name: 'Criar sala' }).click();
  await owner!.waitForURL(/\/sala\/[A-Z]{5}$/);
  const url = owner!.url();
  const code = url.split('/').pop()!;
  await expect(owner!.getByRole('heading', { name: `Mesa ${code}` })).toBeVisible();

  // Os amigos abrem o link do convite, criam o perfil e caem direto na mesa.
  for (const [i, page] of friends.entries()) {
    await page.goto(url);
    await onboard(page, `${NAMES[i + 1]} ${stamp}`);
    await page.waitForURL(url);
    await expect(page.getByRole('heading', { name: `Mesa ${code}` })).toBeVisible();
  }
  await expect(owner!.locator('.waiting-seat .empty-seat')).toHaveCount(0);
  await owner!.getByRole('button', { name: 'Começar partida' }).click();

  const players: Page[] = [owner!, ...friends];
  for (const page of players) {
    await expect(page.locator('.hand-tile')).toHaveCount(7);
    // ninguém vê a mão dos outros: só as próprias 7 pedras na HUD
    await expect(page.locator('.seat-label')).toHaveCount(3);
  }

  // Joga um pouco, derruba e recarrega um jogador, e termina a mão.
  const reloader = friends[1]!;
  let reloaded = false;
  await Promise.all(
    players.map((page) =>
      autoPlay(page, async () => {
        if (page === reloader && !reloaded && (await page.locator('.hand-tile').count()) <= 5) {
          reloaded = true;
          await page.reload();
          await expect(page.locator('.hud')).toBeVisible();
        }
        return handEnded(page)();
      }),
    ),
  );

  expect(reloaded).toBe(true);
  for (const page of players) await expect(page.locator('.overlay-card')).toContainText(/Batida|Lá-e-ló|Cruzada|Trancou/);
  // O mesmo resultado em todas as telas.
  const titles = await Promise.all(players.map((p) => p.locator('.overlay-card h2').textContent()));
  expect(new Set(titles).size).toBe(1);
});
