export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body ? 'POST' : 'GET',
): Promise<T> {
  const r = await fetch('/api/v1' + path, {
    method,
    credentials: 'same-origin',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  if (!r.ok) {
    let message;
    try {
      const error: unknown = await r.json();
      message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : r.statusText;
    } catch {
      message = r.statusText;
    }
    throw new ApiError(message, r.status);
  }
  return r.json();
}
