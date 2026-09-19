import { BlockList, isIP } from 'node:net';
import {
  DEFAULT_IMAGE_FETCH_POLICY,
  type BlockedSubnet,
  type ImageFetchPolicy,
} from './config/image-fetch';

/** BlockList instances are reused per subnet list so that repeated sends do not rebuild them. */
const blockListCache = new WeakMap<readonly BlockedSubnet[], BlockList>();

function blockListFor(subnets: readonly BlockedSubnet[]): BlockList {
  const cached = blockListCache.get(subnets);
  if (cached) return cached;

  const list = new BlockList();
  for (const subnet of subnets) {
    list.addSubnet(subnet.address, subnet.prefix, subnet.type);
  }
  blockListCache.set(subnets, list);
  return list;
}

/** A reserved name covers its subdomains too: api.localhost resolves to the local machine as well. */
function isBlockedHostname(host: string, blocked: readonly string[]): boolean {
  const lower = host.toLowerCase();
  return blocked.some((name) => lower === name || lower.endsWith(`.${name}`));
}

/**
 * Validates an MMS image URL before anything fetches it.
 *
 * The URL reaches the adapter from the caller, so without this check a value that originated in
 * user input could make the server issue a request of the attacker's choosing.
 */
export function assertAllowedImageUrl(
  url: string,
  policy: ImageFetchPolicy = DEFAULT_IMAGE_FETCH_POLICY,
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Image URL is not a valid absolute URL: ${url}`);
  }

  if (!policy.allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Image URL protocol is not allowed: ${parsed.protocol}`);
  }

  // An IPv6 host keeps its brackets in hostname, which isIP does not accept.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const version = isIP(host);

  if (version === 0) {
    if (isBlockedHostname(host, policy.blockedHostnames)) {
      throw new Error(`Image URL points to a blocked host name: ${host}`);
    }
    return parsed;
  }

  // BlockList checks an IPv4-mapped IPv6 address against the IPv4 rules as well, so a mapped
  // loopback such as ::ffff:127.0.0.1 is covered by the IPv4 subnets above. The URL parser
  // likewise normalizes an integer host such as 2130706433 into 127.0.0.1 before it reaches here.
  if (blockListFor(policy.blockedSubnets).check(host, version === 4 ? 'ipv4' : 'ipv6')) {
    throw new Error(`Image URL points to a blocked network address: ${host}`);
  }

  return parsed;
}

/**
 * Fetches an MMS image under the policy.
 *
 * Validating the URL alone is not enough: a permitted address can answer with a redirect to a
 * blocked one, and a permitted server can answer with a body large enough to exhaust memory. The
 * request therefore refuses redirects outright, carries a timeout, and the body is measured as it
 * arrives rather than after it has all been buffered.
 */
export async function fetchImage(
  url: string,
  doFetch: typeof fetch,
  policy: ImageFetchPolicy = DEFAULT_IMAGE_FETCH_POLICY,
): Promise<Blob> {
  const target = assertAllowedImageUrl(url, policy);

  const res = await doFetch(target.href, {
    redirect: 'error',
    signal: AbortSignal.timeout(policy.timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Failed to load the image: HTTP ${res.status}`);
  }

  const declaredLength = Number(res.headers.get('content-length'));
  if (declaredLength > policy.maxBytes) {
    throw new Error(
      `The image is too large: ${declaredLength} bytes declared, limit is ${policy.maxBytes}.`,
    );
  }

  return readWithinLimit(res, policy.maxBytes);
}

/** Reads the body chunk by chunk so that an oversized response is abandoned mid-transfer. */
async function readWithinLimit(res: Response, maxBytes: number): Promise<Blob> {
  const type = res.headers.get('content-type') ?? '';
  if (!res.body) {
    const blob = await res.blob();
    if (blob.size > maxBytes) {
      throw new Error(`The image is too large: over ${maxBytes} bytes.`);
    }
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`The image is too large: over ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return new Blob(chunks as BlobPart[], { type });
}
