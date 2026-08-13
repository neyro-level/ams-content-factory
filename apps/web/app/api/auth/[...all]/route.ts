import {
  createRateLimitService,
  getAuth,
  RateLimitExceededError,
  rateLimitPolicies,
} from '@ams-content-factory/core';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';

const handler = toNextJsHandler((request) => getAuth().handler(request));

function requestSubject(request: Request) {
  return request.headers.get('x-real-ip') ?? 'unattributed-auth-client';
}

export const GET = handler.GET;

export async function POST(request: Request) {
  try {
    await createRateLimitService().consume(rateLimitPolicies.auth, requestSubject(request));
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: 'too many authentication requests' },
        { status: 429, headers: { 'retry-after': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }
  return handler.POST(request);
}
