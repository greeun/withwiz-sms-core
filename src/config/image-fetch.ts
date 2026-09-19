/**
 * Static values of the policy applied when an MMS image is fetched from a URL supplied by the
 * caller. They live here so that a deployment whose image server sits inside a private network can
 * override the policy without editing the adapter.
 */

/** One network range expressed the way node:net BlockList takes it. */
export interface BlockedSubnet {
  address: string;
  prefix: number;
  type: 'ipv4' | 'ipv6';
}

export interface ImageFetchPolicy {
  /** URL protocols the image may be fetched over. */
  allowedProtocols: readonly string[];
  /** Network ranges an image URL must not resolve to. */
  blockedSubnets: readonly BlockedSubnet[];
  /** Host names that reach the local machine without ever appearing as an address literal. */
  blockedHostnames: readonly string[];
  /** Largest image body the adapter will hold in memory. */
  maxBytes: number;
  /** How long the image request may run before it is abandoned. */
  timeoutMs: number;
}

/**
 * Names reserved for the local machine by RFC 6761. They are checked separately from the subnets
 * because a name is only resolved to an address after the request has already left.
 */
export const DEFAULT_BLOCKED_HOSTNAMES: readonly string[] = ['localhost'];

/**
 * Ranges that never host a public image but do reach infrastructure worth protecting. The
 * link-local range covers the cloud metadata endpoint at 169.254.169.254, which is the single most
 * valuable target of a request the server can be tricked into making.
 */
export const DEFAULT_BLOCKED_SUBNETS: readonly BlockedSubnet[] = [
  // IPv4
  { address: '0.0.0.0', prefix: 8, type: 'ipv4' }, // "this network"
  { address: '10.0.0.0', prefix: 8, type: 'ipv4' }, // private
  { address: '100.64.0.0', prefix: 10, type: 'ipv4' }, // carrier-grade NAT
  { address: '127.0.0.0', prefix: 8, type: 'ipv4' }, // loopback
  { address: '169.254.0.0', prefix: 16, type: 'ipv4' }, // link-local, incl. cloud metadata
  { address: '172.16.0.0', prefix: 12, type: 'ipv4' }, // private
  { address: '192.0.0.0', prefix: 24, type: 'ipv4' }, // IETF protocol assignments
  { address: '192.168.0.0', prefix: 16, type: 'ipv4' }, // private
  { address: '198.18.0.0', prefix: 15, type: 'ipv4' }, // benchmarking
  // IPv6
  { address: '::', prefix: 128, type: 'ipv6' }, // unspecified
  { address: '::1', prefix: 128, type: 'ipv6' }, // loopback
  { address: 'fc00::', prefix: 7, type: 'ipv6' }, // unique local
  { address: 'fe80::', prefix: 10, type: 'ipv6' }, // link-local
];

/**
 * A ceiling generous enough for any MMS image while still bounding what a single send can pull into
 * memory. Providers impose their own, stricter limits on the uploaded file.
 */
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;

export const DEFAULT_IMAGE_FETCH_POLICY: ImageFetchPolicy = {
  allowedProtocols: ['https:', 'http:'],
  blockedSubnets: DEFAULT_BLOCKED_SUBNETS,
  blockedHostnames: DEFAULT_BLOCKED_HOSTNAMES,
  maxBytes: DEFAULT_IMAGE_MAX_BYTES,
  timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS,
};
