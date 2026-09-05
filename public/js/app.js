// ================= API helper =================
async function api(path, options = {}) {
  try {
    const res = await fetch('/api' + path, {
      headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...options
    });
    setOnline(true);
    if (res.status === 401) {
      showLogin('Sua sessão expirou. Entre novamente.');
      throw new Error('Sessão expirada.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
    return data;
  } catch (err) {
    if (err instanceof TypeError) setOnline(false); // falha de rede real
    throw err;
  }
}

function setOnline(isOnline) {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.classList.toggle('offline', !isOnline);
  el.innerHTML = `<span class="dot"></span>${isOnline ? 'Conectado' : 'Sem conexão com o servidor'}`;
}

// ================= Toasts =================
function showToast(message, type = 'default') {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'default' ? ' ' + type : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

// ================= State =================
let folders = [];
let currentFolderId = null;
let currentDocs = [];
let docSearch = '';
let pendingFolderColor = '#E1001A';
let lastAddedDocId = null;

const FOLDER_COLORS = ['#E1001A', '#2B2B2B', '#AE0014', '#6E6560', '#181818', '#8C2F2F'];

const foldersWrap = document.getElementById('foldersWrap');
const detailWrap = document.getElementById('detailWrap');
const modalRoot = document.getElementById('modalRoot');

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= Init =================
async function init() {
  renderFolderSkeleton();
  renderWelcome();
  try {
    const { folders: list } = await api('/folders');
    folders = list;
  } catch (e) {
    showToast('Não foi possível carregar as pastas: ' + e.message, 'error');
    folders = [];
  }
  renderFolders();
}

// ================= Folders sidebar =================
function renderFolderSkeleton() {
  foldersWrap.innerHTML = `
    <div class="skeleton-grid folders-skel">
      ${[1, 2, 3].map(() => '<div class="skel"></div>').join('')}
    </div>
  `;
}

function renderFolders() {
  if (folders.length === 0) {
    foldersWrap.innerHTML = `
      <div class="empty">
        <strong>Nenhuma pasta ainda</strong>
        Crie a primeira pasta para começar a organizar seus documentos digitalizados.
      </div>
    `;
    return;
  }
  foldersWrap.innerHTML = `<div class="folder-grid" id="folderGrid"></div>`;
  const grid = document.getElementById('folderGrid');
  folders.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'folder-card' + (f.id === currentFolderId ? ' active' : '');
    card.style.background = f.color;
    card.style.animationDelay = Math.min(i * 30, 180) + 'ms';
    card.innerHTML = `
      <button class="fdel" title="Excluir pasta" data-id="${f.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="fname">${escapeHtml(f.name)}</div>
      <div class="fcount">${f.count || 0} documento${(f.count || 0) === 1 ? '' : 's'}</div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fdel')) return;
      openFolder(f.id);
    });
    card.querySelector('.fdel').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteFolder(f.id, f.name);
    });
    grid.appendChild(card);
  });
}

async function confirmDeleteFolder(id, name) {
  showConfirm(`Excluir "${escapeHtml(name)}"?`, 'Todos os documentos dentro desta pasta serão apagados permanentemente do servidor.', async () => {
    try {
      await api('/folders/' + id, { method: 'DELETE' });
      folders = folders.filter((f) => f.id !== id);
      if (currentFolderId === id) {
        currentFolderId = null;
        document.body.classList.remove('showing-detail');
        renderWelcome();
      }
      renderFolders();
      showToast('Pasta excluída.', 'success');
    } catch (e) {
      showToast('Não foi possível excluir a pasta: ' + e.message, 'error');
    }
  });
}

function openNewFolderModal() {
  pendingFolderColor = FOLDER_COLORS[0];
  modalRoot.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal">
        <h3>Nova pasta</h3>
        <label for="folderNameInput">Nome da pasta</label>
        <input type="text" id="folderNameInput" placeholder="Ex.: Contratos, RH, Notas fiscais" maxlength="40">
        <label>Cor</label>
        <div class="color-row" id="colorRow"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelFolder">Cancelar</button>
          <button class="btn btn-primary" id="createFolder">Criar pasta</button>
        </div>
      </div>
    </div>
  `;
  const colorRow = document.getElementById('colorRow');
  FOLDER_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      pendingFolderColor = c;
      colorRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    colorRow.appendChild(sw);
  });
  document.getElementById('cancelFolder').onclick = closeModal;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  const nameInput = document.getElementById('folderNameInput');
  nameInput.focus();
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreateFolder(); });
  document.getElementById('createFolder').onclick = doCreateFolder;
}

async function doCreateFolder() {
  const nameInput = document.getElementById('folderNameInput');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const btn = document.getElementById('createFolder');
  btn.disabled = true;
  try {
    const { folder } = await api('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color: pendingFolderColor })
    });
    folders.push(folder);
    closeModal();
    renderFolders();
    showToast('Pasta criada.', 'success');
  } catch (e) {
    showToast('Não foi possível criar a pasta: ' + e.message, 'error');
    btn.disabled = false;
  }
}

function closeModal() { modalRoot.innerHTML = ''; }

function showConfirm(title, body, onConfirm) {
  modalRoot.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal">
        <h3>${title}</h3>
        <p style="color:var(--ink-soft);font-size:14px;line-height:1.5;">${body}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelConfirm">Cancelar</button>
          <button class="btn" style="background:var(--danger);color:#fff;" id="okConfirm">Excluir</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cancelConfirm').onclick = closeModal;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('okConfirm').onclick = async () => { closeModal(); await onConfirm(); };
}

// ================= Detail pane (documents) =================
function renderWelcome() {
  detailWrap.innerHTML = `
    <div class="welcome">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3"/><circle cx="12" cy="12" r="3"/></svg>
      <strong>Selecione uma pasta</strong>
      <p>Escolha uma pasta ao lado para ver os documentos digitalizados, ou crie uma nova pasta para começar.</p>
    </div>
  `;
}

async function openFolder(id) {
  currentFolderId = id;
  docSearch = '';
  document.body.classList.add('showing-detail');
  renderFolders(); // atualiza o destaque da pasta ativa
  renderDetailSkeleton();

  try {
    const { documents } = await api('/folders/' + id + '/documents');
    currentDocs = documents;
    renderFolderDetail();
  } catch (e) {
    detailWrap.innerHTML = `<div class="empty"><strong>Não foi possível carregar esta pasta</strong>${escapeHtml(e.message)}</div>`;
  }
}

function renderDetailSkeleton() {
  const folder = folders.find((f) => f.id === currentFolderId);
  detailWrap.innerHTML = `
    <div class="section-head"><h2>${folder ? escapeHtml(folder.name) : ''}</h2></div>
    <div class="skeleton-grid" style="grid-template-columns:repeat(2,1fr);">
      ${[1, 2, 3, 4].map(() => '<div class="skel" style="height:150px;"></div>').join('')}
    </div>
  `;
}

function renderFolderDetail() {
  const folder = folders.find((f) => f.id === currentFolderId);
  detailWrap.innerHTML = `
    <div class="section-head">
      <h2>${escapeHtml(folder.name)}</h2>
    </div>
    <div class="toolbar">
      <input type="text" id="searchInput" placeholder="Buscar nesta pasta…" value="${escapeHtml(docSearch)}">
    </div>
    <div id="docGridWrap"></div>
    <button class="btn btn-primary fab" id="scanBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3"/><circle cx="12" cy="12" r="3"/></svg>
      Digitalizar
    </button>
  `;
  document.getElementById('scanBtn').onclick = openCaptureModal;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    docSearch = e.target.value;
    renderDocGrid();
  });
  renderDocGrid();
}

document.getElementById('backBtn').onclick = () => {
  document.body.classList.remove('showing-detail');
};

function renderDocGrid() {
  const wrap = document.getElementById('docGridWrap');
  if (!wrap) return;
  const filtered = currentDocs.filter((d) => d.name.toLowerCase().includes(docSearch.toLowerCase()));

  if (currentDocs.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <strong>Esta pasta está vazia</strong>
        Toque em "Digitalizar" para adicionar o primeiro documento, pela câmera ou enviando um arquivo.
      </div>
    `;
    return;
  }
  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty">Nenhum documento encontrado para "${escapeHtml(docSearch)}".</div>`;
    return;
  }

  wrap.innerHTML = `<div class="doc-grid" id="docGrid"></div>`;
  const grid = document.getElementById('docGrid');
  filtered.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'doc-card' + (d.id === lastAddedDocId ? ' new-item' : '');
    card.style.animationDelay = Math.min(i * 25, 150) + 'ms';
    card.innerHTML = `<div class="thumb"><img src="${d.url}" alt="${escapeHtml(d.name)}" loading="lazy"></div><div class="dname">${escapeHtml(d.name)}</div>`;
    card.addEventListener('click', () => openViewer(d.id));
    grid.appendChild(card);
  });
  lastAddedDocId = null;
}

// ================= Capture modal =================
function openCaptureModal() {
  modalRoot.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal">
        <h3>Adicionar documento</h3>
        <div class="modal-actions" style="justify-content:stretch;flex-direction:column;">
          <button class="btn btn-primary" id="btnCam" style="justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3"/><circle cx="12" cy="12" r="3"/></svg>
            Usar a câmera
          </button>
          <button class="btn btn-ghost" id="btnUp" style="justify-content:center;margin-top:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>
            Enviar arquivo da galeria
          </button>
        </div>
        <label class="scan-toggle"><input type="checkbox" id="scanFilterToggle" checked> Aplicar efeito de digitalização (fundo branco uniforme, texto nítido)</label>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelCap">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cancelCap').onclick = closeModal;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('btnCam').onclick = () => { document.getElementById('fileInputCamera').click(); };
  document.getElementById('btnUp').onclick = () => { document.getElementById('fileInputUpload').click(); };
}

document.getElementById('fileInputCamera').addEventListener('change', async (e) => {
  const toggle = document.getElementById('scanFilterToggle');
  const applyScan = toggle ? toggle.checked : true;
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (files.length) await handleNewFiles(files, applyScan);
});
document.getElementById('fileInputUpload').addEventListener('change', async (e) => {
  const toggle = document.getElementById('scanFilterToggle');
  const applyScan = toggle ? toggle.checked : true;
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (files.length) await handleNewFiles(files, applyScan);
});

async function handleNewFiles(files, applyScan) {
  closeModal();
  const wrap = document.getElementById('docGridWrap');
  if (wrap) {
    wrap.insertAdjacentHTML('afterbegin', `
      <div class="loading-row" id="processingRow">
        <div class="spinner"></div> Digitalizando e enviando…
        <div class="progress-bar" style="flex:1;"><div class="fill"></div></div>
      </div>
    `);
  }

  for (const file of files) {
    try {
      const blob = await processImage(file, applyScan);
      const name = file.name.replace(/\.[^.]+$/, '') || 'Documento';
      const form = new FormData();
      form.append('file', blob, name + '.jpg');
      form.append('name', name);
      const { document: doc } = await api('/folders/' + currentFolderId + '/documents', { method: 'POST', body: form });
      currentDocs.unshift(doc);
      lastAddedDocId = doc.id;
      const f = folders.find((f) => f.id === currentFolderId);
      if (f) f.count = currentDocs.length;
    } catch (err) {
      showToast('Falha ao enviar documento: ' + err.message, 'error');
    }
  }

  const pr = document.getElementById('processingRow');
  if (pr) pr.remove();
  renderDocGrid();
  renderFolders();
}

// ================= Image processing: real "scan" look =================
// Normaliza a iluminação da página contra um fundo estimado localmente
// (em vez de só aplicar um filtro de foto), e passa por uma curva de
// contraste — o mesmo princípio de scanners e apps de digitalização.
function processImage(file, applyScan) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      img.onload = () => {
        const maxW = 1300;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        if (applyScan) applyScanEffect(ctx, w, h);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob); else reject(new Error('Falha ao gerar a imagem.'));
        }, 'image/jpeg', 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function applyScanEffect(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  const bg = estimateBackground(gray, w, h);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const ratio = gray[i] / Math.max(bg[i], 8);
    let v = ratio * 255;
    v = 255 / (1 + Math.exp(-0.05 * (v - 200)));
    v = Math.max(0, Math.min(255, v));
    data[o] = v; data[o + 1] = v; data[o + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

function estimateBackground(gray, w, h) {
  const sw = Math.max(10, Math.round(w / 22));
  const sh = Math.max(10, Math.round(h / 22));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d');
  const simg = sctx.createImageData(sw, sh);
  const scaleX = w / sw, scaleY = h / sh;

  for (let sy = 0; sy < sh; sy++) {
    const y0 = Math.floor(sy * scaleY), y1 = Math.max(y0 + 1, Math.floor((sy + 1) * scaleY));
    for (let sx = 0; sx < sw; sx++) {
      const x0 = Math.floor(sx * scaleX), x1 = Math.max(x0 + 1, Math.floor((sx + 1) * scaleX));
      let sum = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        const rowBase = y * w;
        for (let x = x0; x < x1; x++) { sum += gray[rowBase + x]; count++; }
      }
      const avg = count ? sum / count : 200;
      const idx = (sy * sw + sx) * 4;
      simg.data[idx] = simg.data[idx + 1] = simg.data[idx + 2] = avg;
      simg.data[idx + 3] = 255;
    }
  }
  sctx.putImageData(simg, 0, 0);

  const big = document.createElement('canvas');
  big.width = w; big.height = h;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, w, h);
  const bigData = bctx.getImageData(0, 0, w, h).data;

  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bigData[i * 4];
  return out;
}

// ================= Document viewer =================
function openViewer(docId) {
  const d = currentDocs.find((x) => x.id === docId);
  if (!d) return;
  modalRoot.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal viewer-modal">
        <div class="viewer-img-wrap"><img src="${d.url}"></div>
        <div class="viewer-body">
          <input type="text" id="docNameInput" value="${escapeHtml(d.name)}" maxlength="60">
          <div class="viewer-actions">
            <a class="btn btn-primary" id="downloadBtn" download="${escapeHtml(d.name)}.jpg" href="${d.url}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>
              Baixar
            </a>
            <button class="btn btn-ghost" id="saveNameBtn">Salvar nome</button>
            <button class="btn btn-danger" id="deleteDocBtn">Excluir</button>
            <button class="btn btn-ghost" id="closeViewer" style="margin-left:auto;">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('closeViewer').onclick = closeModal;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('saveNameBtn').onclick = async () => {
    const newName = document.getElementById('docNameInput').value.trim();
    if (!newName) return;
    try {
      const { document: updated } = await api('/documents/' + d.id, { method: 'PATCH', body: JSON.stringify({ name: newName }) });
      d.name = updated.name;
      closeModal();
      renderDocGrid();
      showToast('Nome atualizado.', 'success');
    } catch (e) {
      showToast('Não foi possível renomear: ' + e.message, 'error');
    }
  };
  document.getElementById('deleteDocBtn').onclick = () => {
    showConfirm('Excluir este documento?', 'Esta ação não pode ser desfeita.', async () => {
      try {
        await api('/documents/' + d.id, { method: 'DELETE' });
        currentDocs = currentDocs.filter((x) => x.id !== d.id);
        const f = folders.find((f) => f.id === currentFolderId);
        if (f) f.count = currentDocs.length;
        renderDocGrid();
        renderFolders();
        showToast('Documento excluído.', 'success');
      } catch (e) {
        showToast('Não foi possível excluir: ' + e.message, 'error');
      }
    });
  };
}

document.getElementById('btnAddFolder').onclick = openNewFolderModal;

// ================= Auth gate =================
function showLogin(message) {
  document.getElementById('appShell').hidden = true;
  document.getElementById('loginScreen').hidden = false;
  const err = document.getElementById('loginError');
  if (message) {
    err.textContent = message;
    err.hidden = false;
  } else {
    err.hidden = true;
  }
  document.getElementById('loginPass').value = '';
}

function showApp() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginSubmit');
  const err = document.getElementById('loginError');
  err.hidden = true;
  btn.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha no login.');
    showApp();
    init();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logoutBtn').onclick = async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* segue o baile */ }
  location.reload();
};

async function bootstrap() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      showApp();
      init();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin('Não foi possível verificar a sessão. Tente novamente.');
  }
}

bootstrap();
