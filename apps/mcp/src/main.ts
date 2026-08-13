import { createMcpBrandScopeService } from '@ams-content-factory/core';

import { createMcpApplicationHandlers } from './handlers.js';
import { createMcpServer } from './index.js';
import { startMcpRuntime } from './runtime.js';

void startMcpRuntime({
  createServer: (context) =>
    createMcpServer(context, createMcpApplicationHandlers(), createMcpBrandScopeService()),
}).catch((error: unknown) => {
  // stdout belongs exclusively to the stdio MCP protocol; configuration failures are safe stderr text.
  console.error(error instanceof Error ? error.message : 'Unable to start MCP runtime.');
  process.exitCode = 1;
});
