import { getPrisma } from '@ams-content-factory/db';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';

const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

function createAuth() {
  return betterAuth({
    baseURL: appUrl,
    trustedOrigins: [appUrl],
    database: prismaAdapter(getPrisma(), {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

/**
 * Creates the authentication service on its first request.
 *
 * Next.js evaluates route modules while building. Delaying the Prisma adapter
 * prevents a build-only process from opening a database connection, while the
 * service remains server-only when an auth route receives traffic.
 */
export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth();
  }

  return authInstance;
}
