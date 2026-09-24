import { test as setup, expect } from '@playwright/test';
import { credentials, storageStatePath, type Role } from './env';

// Accede una volta con ciascun account di prova e salva la sessione: i test la riusano
// senza rifare il login ogni volta.
for (const role of ['mario', 'luigi', 'admin'] as Role[]) {
  setup(`login ${role}`, async ({ page }) => {
    const { email, password } = credentials(role);
    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Accedi al Club' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
