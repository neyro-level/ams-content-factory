import 'dotenv/config';
import { getAuth } from '../../packages/core/src/index.js';
import { createPrismaClient } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const authTestEmail = 'wave1-auth-contract@ams-content-factory.local';

afterAll(async () => {
  await prisma.user.deleteMany({
    where: {
      email: authTestEmail,
    },
  });
  await prisma.$disconnect();
});

describe('database foundation', () => {
  it('enables pgvector and creates the identity foundation', async () => {
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('organization', 'membership', 'brand')
    `;

    expect(extensions).toEqual([{ extname: 'vector' }]);
    expect(tables.map((table) => table.table_name).sort()).toEqual([
      'brand',
      'membership',
      'organization',
    ]);
  });

  it('initializes the Better Auth service only when an auth request arrives', async () => {
    const response = await getAuth().handler(new Request('http://localhost:3000/api/auth/ok'));

    expect(response.status).toBe(200);
  });

  it('registers, signs in and resolves a session through the auth route contract', async () => {
    await prisma.user.deleteMany({
      where: {
        email: authTestEmail,
      },
    });

    const authHandler = getAuth().handler;
    const baseHeaders = {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    };
    const credentials = {
      email: authTestEmail,
      password: 'wave1-contract-password',
    };
    const signUpResponse = await authHandler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          name: 'Wave 1 Contract',
          ...credentials,
        }),
      }),
    );
    const signInResponse = await authHandler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(credentials),
      }),
    );
    const sessionCookie = signInResponse.headers.get('set-cookie')?.split(';')[0];

    expect(signUpResponse.status).toBe(200);
    expect(signInResponse.status).toBe(200);
    expect(sessionCookie).toBeTruthy();

    const sessionResponse = await authHandler(
      new Request('http://localhost:3000/api/auth/get-session', {
        headers: {
          cookie: sessionCookie ?? '',
        },
      }),
    );
    const session = (await sessionResponse.json()) as {
      user: { email: string };
    };

    expect(sessionResponse.status).toBe(200);
    expect(session.user.email).toBe(authTestEmail);
  });
});
