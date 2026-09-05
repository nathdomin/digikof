import { readDb, writeDb, filesStore } from '../../src/db.js';
import { requireAuth } from '../../src/auth.js';

export default async (request, context) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const { id } = context.params;
    if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });

    const db = await readDb();
    const folder = db.folders.find((f) => f.id === id);
    if (!folder) return Response.json({ error: 'Pasta não encontrada.' }, { status: 404 });

    const toDelete = db.documents.filter((d) => d.folderId === id);
    const store = filesStore();
    await Promise.all(toDelete.map((d) => store.delete(d.id).catch(() => {})));

    db.folders = db.folders.filter((f) => f.id !== id);
    db.documents = db.documents.filter((d) => d.folderId !== id);
    await writeDb(db);

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || 'Erro inesperado no servidor.' }, { status: 500 });
  }
};

export const config = { path: '/api/folders/:id' };
