import { describe, expect, it } from 'vitest';
import { getApiBaseUrl, readApiJson } from './api';

describe('Assistly API helpers', () => {
  it('uses the deployment origin even if the supplied URL has a path', () => {
    expect(getApiBaseUrl('https://assistly.example/chatbot/42?preview=true'))
      .toBe('https://assistly.example');
  });

  it('rejects invalid or non-HTTP origins', () => {
    expect(() => getApiBaseUrl('/chatbot/42')).toThrow('absolute URL');
    expect(() => getApiBaseUrl('ftp://assistly.example')).toThrow('HTTP or HTTPS');
  });

  it('parses JSON API responses', async () => {
    const response = new Response('{"name":"Assistant"}', {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    await expect(readApiJson<{ name: string }>(response))
      .resolves.toEqual({ name: 'Assistant' });
  });

  it('reports when an API URL returns an HTML page', async () => {
    const response = new Response('<!DOCTYPE html>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });
    await expect(readApiJson(response)).rejects.toThrow(
      'Assistly API returned a non-JSON response (404)',
    );
  });
});
