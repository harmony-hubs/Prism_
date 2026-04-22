import { test, expect } from '@playwright/test';

/**
 * Injects a minimal `window.solana` so "Connect wallet" works without Phantom (automation / CI).
 * Matches `src/dwallet/phantomWallet.ts` expectations.
 */
async function injectMockSolanaWallet(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const addr = 'DevW4ll3tAutom8tion111111111111111111111111111';
    const pk = {
      toBase58: () => addr,
    };
    const wallet = {
      isPhantom: true,
      publicKey: null as typeof pk | null,
      async connect() {
        wallet.publicKey = pk;
        return { publicKey: pk };
      },
      async disconnect() {
        wallet.publicKey = null;
      },
      on() {},
      off() {},
    };
    (window as unknown as { solana: typeof wallet }).solana = wallet;
  });
}

test.describe('PRISM — scripted walkthrough (Chrome)', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockSolanaWallet(page);
  });

  test('follow the motions per instruction', async ({ page }) => {
    await test.step('1. Open app — splash shows PRISM', async () => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'PRISM' })).toBeVisible();
      await expect(page.getByTestId('splash-continue')).toBeVisible();
    });

    await test.step('2. Tap Continue (passkey path — demo continues even if WaaP fails)', async () => {
      await page.getByTestId('splash-continue').click();
    });

    await test.step('3. Boot — “Revealing your spectrum…”', async () => {
      await expect(page.getByTestId('boot-screen')).toBeVisible();
      await expect(page.getByText('Revealing your spectrum')).toBeVisible();
    });

    await test.step('4. Hub — portfolio and Preview (devnet) badge', async () => {
      await expect(page.getByTestId('hub-screen')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Total (est.)')).toBeVisible();
      await expect(page.getByTestId('network-preview-badge')).toBeVisible();
    });

    await test.step('5. Connect dev wallet (mock injected Solana)', async () => {
      await page.getByTestId('header-connect-wallet').click();
      await expect(page.getByTestId('header-connect-wallet')).toContainText(/Solana/);
    });

    await test.step('6. Activity tab — see Start here / vision lede', async () => {
      await page.getByTestId('tab-activity').click();
      await expect(page.getByText('Start here')).toBeVisible();
      await expect(page.getByTestId('hub-welcome-lede')).toBeVisible();
    });

    await test.step('7. Assets — expand Sol facet, run Test sign', async () => {
      await page.getByTestId('tab-assets').click();
      await page.getByTestId('facet-row-sol').click();
      await expect(page.getByTestId('test-sign-sol')).toBeVisible();
      await page.getByTestId('test-sign-sol').click();
      await expect(page.getByTestId('signature-approval-modal')).toBeVisible();
      await expect(page.getByTestId('signature-approval-confirm')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('signature-approval-confirm').click();
      await page.getByTestId('tab-activity').click();
      await expect(page.getByText('Beamed Solana (practice)')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('8. Builder lab — story & checklist; expand developer tools', async () => {
      await page.getByTestId('open-learn-lab').click();
      await expect(page.getByTestId('dwallet-tab-panel')).toBeVisible();
      await expect(page.getByTestId('ika-encrypt-pitch')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Bridgeless identity: Ika + Encrypt' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Follow the book — your checklist' })).toBeVisible();
      await expect(page.getByTestId('dwallet-tools')).toBeVisible();
      await expect(page.getByTestId('dwallet-tools-simple')).toBeVisible();
      await page.getByTestId('dwallet-show-developer').click();
      await expect(page.getByTestId('dwallet-agent-panel')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Cursor agent' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Operator console' })).toBeVisible();
    });

    await test.step('9. Trade hub — beam swap / agents tabs', async () => {
      await page.getByTestId('learn-back').click();
      await expect(page.getByTestId('hub-screen')).toBeVisible();
      await page.getByTestId('open-trade-beam').click();
      await expect(page.getByTestId('signature-approval-modal')).toBeVisible();
      await expect(page.getByTestId('signature-approval-confirm')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('signature-approval-confirm').click();
      await expect(page.getByTestId('trade-hub')).toBeVisible();
      await expect(page.getByTestId('trade-tab-dex')).toBeVisible();
      await page.getByTestId('trade-tab-agents').click();
      await expect(page.getByText(/Nothing here executes trades yet/i)).toBeVisible();
    });
  });
});
