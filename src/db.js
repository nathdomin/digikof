// Persistência via Netlify Blobs (armazenamento de objetos nativo da Netlify).
// Trocamos o arquivo local (data/db.json + uploads/) por dois "stores":
//  - digikof-meta: um único JSON com { folders, documents }
//  - digikof-files: os bytes de cada imagem, indexados pelo id do documento
//
// Atenção: não há travas/transações aqui. Duas escritas simultâneas no
// metadado (ex.: dois uploads no mesmíssimo instante) podem, em teoria,
// sobrescrever uma à outra. Para o volume de um app departamental isso
// raramente é um problema; se virar um, migrar para o Netlify DB (Postgres)
// resolve com pouca mudança nas funções.

import { getStore } from '@netlify/blobs';

const META_KEY = 'db';

export function metaStore() {
  return getStore({ name: 'digikof-meta', consistency: 'strong' });
}

export function filesStore() {
  return getStore({ name: 'digikof-files', consistency: 'strong' });
}

export async function readDb() {
  const data = await metaStore().get(META_KEY, { type: 'json' });
  return data || { folders: [], documents: [] };
}

export async function writeDb(db) {
  await metaStore().setJSON(META_KEY, db);
}

export function toPublicDoc(doc) {
  return {
    id: doc.id,
    folderId: doc.folderId,
    name: doc.name,
    url: '/api/documents/' + doc.id + '/file',
    createdAt: doc.createdAt
  };
}

export const FOLDER_COLORS = ['#E1001A', '#2B2B2B', '#AE0014', '#6E6560', '#181818', '#8C2F2F'];

export function folderWithCount(folder, documents) {
  return { ...folder, count: documents.filter((d) => d.folderId === folder.id).length };
}
