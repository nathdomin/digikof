import { readDb, writeDb, filesStore, toPublicDoc } from '../../src/db.js';
import { requireAuth } from '../../src/auth.js';

export default async (request, context) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const { id } = context.params;
    const db = await readDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) return Response.json({ error: 'Documento não encontrado.' }, { status: 404 });

    if (request.method === 'PATCH') {
      const body = await request.json();
      const name = (body.name || '').trim();
      if (!name) return Response.json({ error: 'Nome não pode ser vazio.' }, { status: 400 });
      doc.name = name.slice(0, 80);
      await writeDb(db);
      return Response.json({ document: toPublicDoc(doc) });
    }

    if (request.method === 'DELETE') {
      db.documents = db.documents.filter((d) => d.id !== id);
      await writeDb(db);
      await filesStore().delete(id).catch(() => {});
      return Response.json({ ok: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || 'Erro inesperado no servidor.' }, { status: 500 });
  }
};

export const config = { path: '/api/documents/:id' };
