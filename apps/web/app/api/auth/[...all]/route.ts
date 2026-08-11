import { getAuth } from '@ams-content-factory/core';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
