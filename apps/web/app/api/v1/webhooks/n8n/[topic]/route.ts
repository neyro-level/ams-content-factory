import { enqueueWorkflowRun, verifyHmacSignature } from '@ams-content-factory/core';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const topicSchema = z.enum(['research', 'content', 'events']);
const bodySchema = z.record(z.string(), z.unknown());

export async function POST(request: Request, context: { params: Promise<{ topic: string }> }) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'n8n webhooks are not configured' }, { status: 503 });
  }
  const topic = topicSchema.safeParse((await context.params).topic);
  if (!topic.success) return NextResponse.json({ error: 'unknown webhook topic' }, { status: 404 });
  const payload = await request.text();
  const signature = request.headers.get('x-ams-signature');
  if (!signature || !verifyHmacSignature({ secret, payload, signature })) {
    return NextResponse.json({ error: 'invalid webhook signature' }, { status: 401 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const body = bodySchema.safeParse(parsed);
  const organizationId = request.headers.get('x-ams-organization-id');
  if (!body.success || !organizationId) {
    return NextResponse.json({ error: 'invalid webhook payload' }, { status: 400 });
  }
  const brandId = request.headers.get('x-ams-brand-id') ?? undefined;
  const suppliedKey = request.headers.get('idempotency-key');
  const idempotencyKey =
    suppliedKey ?? `n8n:${topic.data}:${createHash('sha256').update(payload).digest('hex')}`;
  const run = await enqueueWorkflowRun({
    organizationId,
    ...(brandId !== undefined ? { brandId } : {}),
    type: `n8n.${topic.data}`,
    idempotencyKey,
    payload: body.data,
  });
  return NextResponse.json({ workflowRunId: run.id, status: run.status }, { status: 202 });
}
