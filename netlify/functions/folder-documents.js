import { randomUUID } from 'node:crypto';
import { readDb, writeDb, filesStore, toPublicDoc } from '../../src/db.js';
import { requireAuth } from '../../src/auth.js';

export default async (request, context) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const { id: folderId } = context.params;
    const db = await readDb();
    const folder = db.folders.find((f) => f.id === folderId);
    if (!folder) return Response.json({ error: 'Pasta não encontrada.' }, { status: 404 });

    if (request.method === 'GET') {
      const docs = db.documents
        .filter((d) => d.folderId === folderId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(toPublicDoc);
      return Response.json({ documents: docs });
    }

    if (request.method === 'POST') {
      const form = await request.formData();
      const file = form.get('file');
      const name = (form.get('name') || 'Documento').toString().trim().slice(0, 80);

      if (!file || typeof file === 'string') {
        return Response.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
      }
      if (!file.type || !file.type.startsWith('image/')) {
        return Response.json({ error: 'Apenas arquivos de imagem são aceitos.' }, { status: 400 });
      }

      const docId = 'd_' + randomUUID();
      const buffer = Buffer.from(await file.arrayBuffer());
      await filesStore().set(docId, buffer, { metadata: { contentType: file.type || 'image/jpeg' } });

      const doc = { id: docId, folderId, name: name || 'Documento', createdAt: Date.now() };
      db.documents.unshift(doc);
      await writeDb(db);

      return Response.json({ document: toPublicDoc(doc) }, { status: 201 });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || 'Erro inesperado no servidor.' }, { status: 500 });
  }
};

export const config = { path: '/api/folders/:id/documents' };
