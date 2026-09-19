import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_FETCH_POLICY } from '../src/config/image-fetch';
import { assertAllowedImageUrl, fetchImage } from '../src/image-fetch';

describe('assertAllowedImageUrl', () => {
  it('returns the parsed URL for an ordinary https address', () => {
    expect(assertAllowedImageUrl('https://cdn.example.com/a.jpg').hostname).toBe('cdn.example.com');
  });

  it('rejects a protocol outside the allowed list', () => {
    expect(() => assertAllowedImageUrl('file:///etc/passwd')).toThrow(/protocol/i);
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(() => assertAllowedImageUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects a loopback address', () => {
    expect(() => assertAllowedImageUrl('http://127.0.0.1:8080/a.jpg')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects a private network address', () => {
    expect(() => assertAllowedImageUrl('http://10.0.0.5/a.jpg')).toThrow(
      /blocked network address/i,
    );
    expect(() => assertAllowedImageUrl('http://192.168.1.1/a.jpg')).toThrow(
      /blocked network address/i,
    );
    expect(() => assertAllowedImageUrl('http://172.16.0.1/a.jpg')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects an IPv6 loopback address written in brackets', () => {
    expect(() => assertAllowedImageUrl('http://[::1]/a.jpg')).toThrow(/blocked network address/i);
  });

  it('accepts a public IP address literal', () => {
    expect(assertAllowedImageUrl('https://8.8.8.8/a.jpg').hostname).toBe('8.8.8.8');
  });

  it('rejects a host name that refers to the local machine', () => {
    expect(() => assertAllowedImageUrl('http://localhost:3000/a.jpg')).toThrow(
      /blocked host name/i,
    );
  });

  it('rejects an IPv4 loopback address mapped into IPv6', () => {
    expect(() => assertAllowedImageUrl('http://[::ffff:127.0.0.1]/a.jpg')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects an IPv4 mapping written in hexadecimal form', () => {
    expect(() => assertAllowedImageUrl('http://[::ffff:7f00:1]/a.jpg')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects a loopback address written as a single integer', () => {
    expect(() => assertAllowedImageUrl('http://2130706433/a.jpg')).toThrow(
      /blocked network address/i,
    );
  });

  it('rejects a subdomain of the name reserved for the local machine', () => {
    expect(() => assertAllowedImageUrl('http://api.localhost/a.jpg')).toThrow(
      /blocked host name/i,
    );
  });

  it('lets a policy permit an image server inside a private network', () => {
    const policy = { ...DEFAULT_IMAGE_FETCH_POLICY, blockedSubnets: [] };

    expect(assertAllowedImageUrl('http://10.0.0.5/a.jpg', policy).hostname).toBe('10.0.0.5');
  });
});

describe('policy re-exports', () => {
  it('exposes the default policy from each adapter subpath, so overriding it needs no extra import', async () => {
    const aligo = await import('../src/providers/aligo');
    const solapi = await import('../src/providers/solapi');

    expect(aligo.DEFAULT_IMAGE_FETCH_POLICY).toBe(DEFAULT_IMAGE_FETCH_POLICY);
    expect(solapi.DEFAULT_IMAGE_FETCH_POLICY).toBe(DEFAULT_IMAGE_FETCH_POLICY);
  });
});

describe('fetchImage', () => {
  it('rejects a blocked address before issuing any request', async () => {
    const doFetch = vi.fn();

    await expect(fetchImage('http://169.254.169.254/a.jpg', doFetch as never)).rejects.toThrow(
      /blocked network address/i,
    );
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('asks fetch to fail rather than follow a redirect', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response(new Blob(['image'])));

    await fetchImage('https://cdn.example.com/a.jpg', doFetch as never);

    expect(doFetch.mock.calls[0][1].redirect).toBe('error');
  });

  it('rejects a response whose declared length exceeds the limit', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['image']), { headers: { 'content-length': '99999999' } }),
      );

    await expect(fetchImage('https://cdn.example.com/a.jpg', doFetch as never)).rejects.toThrow(
      /too large/i,
    );
  });

  it('rejects a body that outgrows the limit while it is being read', async () => {
    const policy = { ...DEFAULT_IMAGE_FETCH_POLICY, maxBytes: 4 };
    const doFetch = vi.fn().mockResolvedValue(new Response(new Blob(['far too many bytes'])));

    await expect(
      fetchImage('https://cdn.example.com/a.jpg', doFetch as never, policy),
    ).rejects.toThrow(/too large/i);
  });

  it('returns the image when the response stays within the limit', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['image']), { headers: { 'content-type': 'image/jpeg' } }),
      );

    const blob = await fetchImage('https://cdn.example.com/a.jpg', doFetch as never);

    expect(blob.size).toBe(5);
    expect(blob.type).toBe('image/jpeg');
  });

  it('reports a failed HTTP status instead of returning an empty image', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(fetchImage('https://cdn.example.com/a.jpg', doFetch as never)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
