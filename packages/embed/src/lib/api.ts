export function getApiBaseUrl(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Invalid Assistly origin. Provide the absolute URL of your Assistly deployment.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid Assistly origin. The URL must use HTTP or HTTPS.');
  }

  return url.origin;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    const url = response.url ? ` from ${response.url}` : '';
    throw new Error(
      `Assistly API returned a non-JSON response (${response.status})${url}. ` +
      'Check that origin is the Assistly deployment URL and that its API routes are deployed.',
    );
  }

  return response.json() as Promise<T>;
}
