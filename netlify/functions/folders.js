import { randomUUID } from 'node:crypto';
import { readDb, writeDb, FOLDER_COLORS, folderWithCount } from '../../src/db.js';
import { requireAuth } from '../../src/auth.js';

export default async (request) => {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const db = await readDb();

    if (request.method === 'GET') {
      const folders = db.folders
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((f) => folderWithCount(f, db.documents));
      return Response.json({ folders });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const name = (body.name || '').trim();
      const color = FOLDER_COLORS.includes(body.color) ? body.color : FOLDER_COLORS[0];
      if (!name) return Response.json({ error: 'Nome da pasta é obrigatório.' }, { status: 400 });
      if (name.length > 60) return Response.json({ error: 'Nome da pasta muito longo.' }, { status: 400 });

      const folder = { id: 'f_' + randomUUID(), name, color, createdAt: Date.now() };
      db.folders.push(folder);
      await writeDb(db);
      return Response.json({ folder: folderWithCount(folder, db.documents) }, { status: 201 });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || 'Erro inesperado no servidor.' }, { status: 500 });
  }
};

export const config = { path: '/api/folders' };
