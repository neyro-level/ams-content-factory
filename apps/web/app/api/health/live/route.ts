import { buildHealthPayload } from '@ams-content-factory/config';
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(buildHealthPayload('live'));
}
