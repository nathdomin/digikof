import { parseCookies, destroySession, clearCookieHeader, SESSION_COOKIE_NAME } from '../../src/auth.js';

export default async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const cookies = parseCookies(request);
  await destroySession(cookies[SESSION_COOKIE_NAME]);
  const isHttps = new URL(request.url).protocol === 'https:';
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookieHeader(isHttps) } });
};

export const config = { path: '/api/auth/logout' };
