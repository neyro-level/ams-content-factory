import {
  createInboundWebhookService,
  createTokenEncryptor,
  InboundWebhookError,
  createRateLimitService,
  RateLimitExceededError,
  rateLimitPolicies,
} from '@ams-content-factory/core';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const topicSchema = z.enum(['research', 'content', 'events']);
const bodySchema = z.record(z.string(), z.unknown());

export async function POST(request: Request, context: { params: Promise<{ topic: string }> }) {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: 'n8n webhooks are not configured' }, { status: 503 });
  }
  const topic = topicSchema.safeParse((await context.params).topic);
  if (!topic.success) return NextResponse.json({ error: 'unknown webhook topic' }, { status: 404 });
  try {
    await createRateLimitService().consume(
      rateLimitPolicies.inboundWebhook,
      request.headers.get('x-ams-key-id') ??
        request.headers.get('x-real-ip') ??
        'unattributed-webhook',
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: 'too many webhook requests' },
        { status: 429, headers: { 'retry-after': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }
  const payload = await request.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const body = bodySchema.safeParse(parsed);
  if (!body.success) {
    return NextResponse.json({ error: 'invalid webhook payload' }, { status: 400 });
  }
  try {
    const run = await createInboundWebhookService({
      encryptor: createTokenEncryptor(encryptionKey),
    }).receive({
      method: request.method,
      topic: topic.data,
      keyId: request.headers.get('x-ams-key-id'),
      brandId: request.headers.get('x-ams-brand-id'),
      signature: request.headers.get('x-ams-signature'),
      idempotencyKey: request.headers.get('idempotency-key'),
      body: payload,
      payload: body.data,
    });
    return NextResponse.json({ workflowRunId: run.id, status: run.status }, { status: 202 });
  } catch (error) {
    if (error instanceof InboundWebhookError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
