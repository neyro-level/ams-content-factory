import { createPlaywrightConfig } from './playwright.config';

/**
 * This configuration deliberately disables the deterministic test provider.
 * It is used only by the explicit, operator-confirmed live AI smoke command.
 */
export default createPlaywrightConfig({
  port: Number(process.env.E2E_LIVE_AI_PORT ?? 3002),
  textGeneration: '0',
});
