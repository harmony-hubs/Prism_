import { test, expect } from '@playwright/test';
import { PublicKey } from '@solana/web3.js';
import type { Route } from '@playwright/test';
import { SovereignMockState } from './sovereign-mock-state';

/** Must match `playwright.config.ts` `webServer.env.VITE_PRISM_PROGRAM_ID` and inject wallet. */
const E2E_PRISM = new PublicKey('GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB');
const E2E_OWNER = new PublicKey('2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ');

const BLOCKHASH = '4uQauZfdTqF9A9dYAbBtrj42jW35jYkJ8nT5uYq6rL9n';

/**
 * Injects a Solana wallet + stub `signTransaction` (Sovereign uses `signAndSend` E2E path when
 * `VITE_E2E=1` and `e2ePrismSovereignApply` is set — no on-chain sign required for those txs).
 */
async function injectE2EWallet(page: import('@playwright/test').Page) {
  const addr = E2E_OWNER.toBase58();
  await page.addInitScript((ownerAddr: string) => {
    const pk = { toBase58: () => ownerAddr };
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
      async signTransaction(t: unknown) {
        return t;
      },
      on() {},
      off() {},
    };
    (window as unknown as { solana: typeof wallet }).solana = wallet;
  }, addr);
}

type RpcMsg = { method?: string; id?: number; params?: unknown[] };

function handleOne(
  mock: SovereignMockState,
  j: RpcMsg,
): { jsonrpc: '2.0'; id: number; result: unknown } | 'defer' {
  const id = j.id ?? 0;
  const m = j.method;
  const p = j.params as unknown[] | undefined;

  const out = (result: unknown) => ({ jsonrpc: '2.0' as const, id, result });

  if (m === 'getLatestBlockhash') {
    return out({
      context: { slot: Number(mock.getSlot()) },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000_000_000 },
    });
  }
  if (m === 'getSlot') {
    return out(Number(mock.getSlot()));
  }
  if (m === 'getBlockHeight') {
    return out(1_000_000);
  }
  if (m === 'getAccountInfo') {
    const key = typeof p?.[0] === 'string' ? p[0] : null;
    if (key && key === mock.sovereignPda.toBase58()) {
      const d = mock.getAccountData();
      if (!d) {
        return out({ context: { slot: 0 }, value: null });
      }
      const b64 = Buffer.from(d).toString('base64');
      return out({
        context: { slot: Number(mock.getSlot()) },
        value: {
          data: [b64, 'base64'],
          executable: false,
          lamports: 1_000_000,
          owner: E2E_PRISM.toBase58(),
          rentEpoch: 0,
          space: 104,
        },
      });
    }
    // Any other account — not on "chain" in this e2e (avoids hanging on `route.continue()` to real devnet)
    return out({ context: { slot: Number(mock.getSlot()) }, value: null });
  }
  if (m === 'getSignatureStatuses' && p?.[0] && Array.isArray(p[0])) {
    const sigs = p[0] as string[];
    return out({
      context: { slot: Number(mock.getSlot()) },
      value: sigs.map(() => ({
        confirmationStatus: 'confirmed' as const,
        confirmations: 32,
        err: null,
        slot: Number(mock.getSlot()),
        status: { Ok: null },
      })),
    });
  }
  if (m === 'getMinimumBalanceForRentExemption' && p?.[0] != null) {
    return out(890_880);
  }
  if (m === 'sendTransaction' || m === 'sendRawTransaction' || m === 'simulateTransaction') {
    // App uses the E2E `signAndSend` shortcut — real sends should not run in this spec
    return out('E2EPrismSovereign1Verif1TxSig1PadPadPadPadPadPadPadPad');
  }
  if (m === 'getHealth') {
    return out('ok');
  }
  if (m === 'getVersion') {
    return out({ 'feature-set': 0, 'solana-core': 'e2e' });
  }
  if (m === 'getEpochInfo') {
    return out({
      absoluteSlot: Number(mock.getSlot()),
      blockHeight: 1_000_000,
      epoch: 0,
      slotIndex: 0,
      slotsInEpoch: 432_000,
      transactionCount: 0,
    });
  }
  // Unknown method — avoid falling through to the real network in CI
  return out(null);
}

function setupRpcRoute(mock: SovereignMockState) {
  return async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const url = route.request().url();
    if (!url.includes('devnet.solana.com')) {
      await route.continue();
      return;
    }
    const raw = route.request().postData();
    if (!raw) {
      await route.continue();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await route.continue();
      return;
    }
    if (Array.isArray(parsed)) {
      const resps = (parsed as RpcMsg[]).map((j) => handleOne(mock, j));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resps) });
      return;
    }
    const r = handleOne(mock, parsed as RpcMsg);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  };
}

test.describe('Sovereign Command Center — full motions (mocked chain)', () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => {
    const mock = new SovereignMockState(E2E_PRISM, E2E_OWNER);
    await page.exposeFunction(
      'e2ePrismSovereignApply',
      (payload: { disc: number; data: number[]; feePayer: string }) => {
        mock.apply(payload.disc, payload.data, payload.feePayer);
      },
    );
    await page.exposeFunction('e2ePrismSovereignForceTripInactivity', () => {
      mock.forceTripInactivity();
    });
    await page.route('**/*devnet.solana.com**', setupRpcRoute(mock));
    await injectE2EWallet(page);
  });

  test('initialize → armed → poke → attest → disarm → re-arm → (trip) re-arm', async ({ page }) => {
    await page.goto('/');

    await test.step('Reach hub and connect', async () => {
      await page.getByTestId('splash-continue').click();
      await expect(page.getByTestId('hub-screen')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('header-connect-wallet').click();
      await expect(page.getByTestId('header-connect-wallet')).toContainText('Solana ·', { timeout: 15_000 });
    });

    await test.step('Sovereign panel visible; initialize', async () => {
      const panel = page.getByTestId('sovereign-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByText(/Sovereign Command/i).first()).toBeVisible();
      await page.getByTestId('sovereign-init').click();
      await expect(page.getByTestId('sovereign-status')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('sovereign-status')).toContainText(/ARMED.*heartbeat fresh/i);
    });

    await test.step('Poke (heartbeat)', async () => {
      await page.getByTestId('sovereign-poke').click();
      await expect(page.getByTestId('sovereign-status')).toContainText(/ARMED.*heartbeat fresh/i, { timeout: 10_000 });
    });

    await test.step('Attest above panic floor (demo: 5000)', async () => {
      await page.getByTestId('sovereign-attest-input').fill('6000');
      await page.getByTestId('sovereign-attest').click();
      await expect(page.getByText('6000')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Disarm', async () => {
      await page.getByTestId('sovereign-disarm').click();
      await expect(page.getByTestId('sovereign-status')).toContainText('DISARMED', { timeout: 10_000 });
    });

    await test.step('Re-arm from disarmed', async () => {
      await page.getByTestId('sovereign-rearm').click();
      await expect(page.getByTestId('sovereign-status')).toContainText(/ARMED.*heartbeat fresh/i, { timeout: 10_000 });
    });

    await test.step('Simulate inactivity trip (mock) → TRIPPED copy', async () => {
      await page.evaluate(() => (window as unknown as { e2ePrismSovereignForceTripInactivity: () => void }).e2ePrismSovereignForceTripInactivity());
      await page.waitForTimeout(4500);
      await expect(page.getByTestId('sovereign-status')).toContainText('TRIPPED', { timeout: 10_000 });
      await expect(page.getByText(/inactivity/i).first()).toBeVisible();
    });

    await test.step('Re-arm clears trip in UI', async () => {
      await page.getByTestId('sovereign-rearm').click();
      await expect(page.getByTestId('sovereign-status')).toContainText(/ARMED.*heartbeat fresh/i, { timeout: 10_000 });
    });
  });
});
