import { parseCookies, validateSession, SESSION_COOKIE_NAME } from '../../src/auth.js';

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const cookies = parseCookies(request);
  const session = await validateSession(cookies[SESSION_COOKIE_NAME]);
  return Response.json({ authenticated: !!session, username: session ? session.username : null });
};

export const config = { path: '/api/auth/me' };
