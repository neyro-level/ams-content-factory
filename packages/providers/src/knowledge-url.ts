import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export type FetchedKnowledgeSource = {
  content: string;
  contentType: string;
  finalUrl: string;
};

export interface KnowledgeUrlProvider {
  fetchText(sourceUrl: string): Promise<FetchedKnowledgeSource>;
}

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;

export class UnsafeKnowledgeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeKnowledgeUrlError';
  }
}

export class NodeKnowledgeUrlProvider implements KnowledgeUrlProvider {
  async fetchText(sourceUrl: string): Promise<FetchedKnowledgeSource> {
    let currentUrl = sourceUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const target = await resolveSafeKnowledgeUrl(currentUrl);
      const response = await requestPinnedText(target.url, target.address, target.family);
      const location = response.headers.location;

      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        currentUrl = new URL(location, target.url).toString();
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new UnsafeKnowledgeUrlError(`Knowledge URL returned HTTP ${response.statusCode}.`);
      }

      const contentType = response.headers['content-type'] ?? '';
      if (!isTextContentType(contentType)) {
        throw new UnsafeKnowledgeUrlError('Knowledge URL must return a textual content type.');
      }
      if (
        response.headers['content-encoding'] &&
        response.headers['content-encoding'] !== 'identity'
      ) {
        throw new UnsafeKnowledgeUrlError('Knowledge URL must not use content encoding.');
      }

      const contentLength = Number(response.headers['content-length'] ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new UnsafeKnowledgeUrlError('Knowledge URL response exceeds the size limit.');
      }

      return {
        content: new TextDecoder('utf-8', { fatal: true }).decode(response.body),
        contentType,
        finalUrl: target.url,
      };
    }

    throw new UnsafeKnowledgeUrlError('Knowledge URL exceeded the redirect limit.');
  }
}

export async function assertSafeKnowledgeUrl(sourceUrl: string) {
  return (await resolveSafeKnowledgeUrl(sourceUrl)).url;
}

async function resolveSafeKnowledgeUrl(sourceUrl: string) {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new UnsafeKnowledgeUrlError('Knowledge URL must be a valid absolute URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeKnowledgeUrlError('Knowledge URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) {
    throw new UnsafeKnowledgeUrlError('Knowledge URL contains an unsupported authority component.');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIpv4(hostname)) {
    throw new UnsafeKnowledgeUrlError('Knowledge URL must not target a private network.');
  }
  if (isIP(hostname) === 6) {
    throw new UnsafeKnowledgeUrlError('Knowledge URL does not support literal IPv6 addresses.');
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => family !== 4 || isPrivateIpv4(address))
  ) {
    throw new UnsafeKnowledgeUrlError('Knowledge URL resolves to a non-public address.');
  }
  const firstAddress = addresses[0];
  if (!firstAddress) {
    throw new UnsafeKnowledgeUrlError('Knowledge URL did not resolve to a public address.');
  }

  return { url: url.toString(), address: firstAddress.address, family: firstAddress.family as 4 };
}

function requestPinnedText(urlString: string, address: string, family: 4) {
  const url = new URL(urlString);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<{
    statusCode: number;
    headers: Record<string, string | undefined>;
    body: Uint8Array;
  }>((resolve, reject) => {
    const requestHandle = request(
      {
        hostname: address,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'text/plain, text/html, application/json, application/xml',
          Host: url.host,
        },
        ...(url.protocol === 'https:' ? { servername: url.hostname } : {}),
        lookup: (_hostname, _options, callback) => callback(null, address, family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            requestHandle.destroy(
              new UnsafeKnowledgeUrlError('Knowledge URL response exceeds the size limit.'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            headers: {
              'content-encoding': response.headers['content-encoding'],
              'content-length': response.headers['content-length'],
              'content-type': response.headers['content-type'],
              location: response.headers.location,
            },
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    requestHandle.setTimeout(10_000, () => {
      requestHandle.destroy(new UnsafeKnowledgeUrlError('Knowledge URL request timed out.'));
    });
    requestHandle.once('error', reject);
    requestHandle.end();
  });
}

function isTextContentType(contentType: string) {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    mediaType?.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType === 'application/xml' ||
    mediaType === 'application/xhtml+xml'
  );
}

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) {
    return false;
  }
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}
