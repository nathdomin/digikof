import { filesStore } from '../../src/db.js';
import { requireAuth } from '../../src/auth.js';

export default async (request, context) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const { id } = context.params;
    const result = await filesStore().getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return new Response('Não encontrado', { status: 404 });

    const contentType = (result.metadata && result.metadata.contentType) || 'image/jpeg';
    return new Response(result.data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable'
      }
    });
  } catch (e) {
    console.error(e);
    return new Response('Erro ao carregar arquivo.', { status: 500 });
  }
};

export const config = { path: '/api/documents/:id/file' };
