import { createPlaywrightConfig } from './playwright.config';

export default createPlaywrightConfig({
  port: Number(process.env.E2E_LIMITED_PORT ?? 3001),
  textGeneration: '0',
});
