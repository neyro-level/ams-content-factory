import { checkApplicationReadiness } from '@ams-content-factory/core';
import { NextResponse } from 'next/server';

export async function GET() {
  const payload = await checkApplicationReadiness();
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
