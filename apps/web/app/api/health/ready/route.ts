import { buildHealthPayload } from '@ams-content-factory/config';
import { NextResponse } from 'next/server';

export function GET() {
  const payload = buildHealthPayload('ready');
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
