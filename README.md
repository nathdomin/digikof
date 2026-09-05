# DigiKof — versão Netlify

Mesma interface do projeto original, mas o backend foi adaptado para rodar como
**Netlify Functions** (serverless) em vez de um servidor Express contínuo — porque
a Netlify não mantém um processo Node ligado nem um disco persistente entre
requisições. Os dados agora ficam no **Netlify Blobs** (armazenamento de objetos
nativo da plataforma, sem precisar configurar nenhum banco separado).

## O que mudou em relação à versão Node/Express

| | Versão Node/Express | Versão Netlify |
|---|---|---|
| Servidor | `server.js` sempre rodando | Funções sob demanda em `netlify/functions/` |
| Metadados (pastas/documentos) | `data/db.json` em disco | Netlify Blobs, store `digikof-meta` |
| Imagens digitalizadas | `uploads/*.jpg` em disco | Netlify Blobs, store `digikof-files` |
| Front-end (`/public`) | Servido pelo próprio Express | Servido diretamente pela Netlify (hospedagem estática) |

O front-end (`public/index.html`, `css/styles.css`, `js/app.js`) é **exatamente o
mesmo** — ele já falava com a API por `fetch('/api/...')`, então não precisou mudar.

## Configurando o login (obrigatório antes do primeiro deploy)

O app agora exige usuário e senha — sem isso configurado, ninguém entra (inclusive
você). O acesso é validado num usuário/senha único, guardado como variável de
ambiente (nada de senha em texto puro no código ou no repositório).

1. Gere o hash da senha localmente:

   ```bash
   node scripts/hash-password.mjs "a-senha-que-voce-quer-usar"
   ```

2. O script imprime 3 variáveis. Adicione-as em **Netlify → Site settings →
   Environment variables**:

   - `DIGIKOF_USERNAME`
   - `DIGIKOF_PASSWORD_SALT`
   - `DIGIKOF_PASSWORD_HASH`

3. Faça (ou refaça) o deploy — as funções só leem essas variáveis quando sobem.

Como funciona por baixo dos panos:
- A senha nunca fica salva — só um hash (PBKDF2, 100.000 iterações) é comparado a cada login.
- Login bem-sucedido cria uma sessão (guardada no Blobs) e devolve um cookie `httpOnly`, `Secure`, `SameSite=Strict` — inacessível a JavaScript malicioso e não enviado entre sites.
- Toda rota de dados (`/api/folders/*`, `/api/documents/*`, inclusive o endpoint que serve a imagem) exige essa sessão válida — sem cookie de sessão, a API responde `401` e o front-end manda de volta pra tela de login.
- Depois de **5 tentativas de senha erradas** para o mesmo usuário, novas tentativas ficam bloqueadas por 15 minutos.
- A sessão expira sozinha em 12h — depois disso, é preciso logar de novo.

Se quiser um usuário por pessoa (em vez de uma credencial compartilhada) ou login
via conta corporativa da KOF, a troca natural é usar o **Netlify Identity** ou um
provedor de SSO — dá mais trabalho de configurar, mas o `requireAuth()` em
`src/auth.js` é o único lugar que precisaria mudar.



### Opção A — pelo painel da Netlify (mais simples)

1. Suba esta pasta para um repositório no GitHub/GitLab/Bitbucket.
2. Na Netlify: **Add new site → Import an existing project** e aponte pro repositório.
3. A Netlify já vai detectar o `netlify.toml` (publish = `public`, functions = `netlify/functions`) — não precisa configurar build command, é um site estático + funções.
4. Deploy.

### Opção B — pela CLI

```bash
npm install
npx netlify-cli login
npx netlify-cli init      # ou: npx netlify-cli link, se o site já existir
npx netlify-cli deploy --prod
```

## Testando localmente antes do deploy

Como agora depende de Netlify Functions e Netlify Blobs, `node server.js` não existe
mais nessa versão — o jeito certo de testar localmente é com o próprio CLI da Netlify,
que emula funções e Blobs na sua máquina:

```bash
npm install
npx netlify-cli dev
```

Isso sobe o site em algo como `http://localhost:8888`, com `/api/*` já roteado para as
funções em `netlify/functions/`.

## HTTPS e câmera

Depois do deploy, a Netlify já serve tudo em HTTPS automaticamente (certificado
gratuito incluso) — então a câmera do celular (`capture="environment"`) funciona
direto, sem configuração extra. Em `localhost` durante o desenvolvimento também
funciona, por ser exceção de contexto seguro.

## Limites que valem saber

- **Tamanho de upload**: funções da Netlify (modo síncrono) aceitam corpos de
  requisição de até alguns MB. As imagens já saem do navegador comprimidas em
  JPEG (~1300px de largura, qualidade 0.85), então na prática costuma ficar bem
  abaixo do limite — mas se digitalizar fotos muito grandes/alta resolução sem
  esse pré-processamento, pode esbarrar nisso.
- **Sem transação entre escritas simultâneas**: os metadados ficam num único
  JSON no Blobs. Duas pessoas criando pasta ou enviando documento no mesmíssimo
  instante, em teoria, podem sobrescrever uma a outra (é uma limitação de usar
  um blob de objeto único como "banco"). Para o volume normal de uso departamental
  isso raramente aparece; se virar um problema real, migrar `src/db.js` para o
  Netlify DB (Postgres gerenciado pela própria Netlify) resolve, sem precisar
  tocar nas funções de rota.
- **Sem autenticação por usuário individual**: existe um único usuário/senha
  compartilhado (ver seção de login acima). Suficiente pra restringir acesso
  de quem não deveria estar ali, mas não dá pra saber *quem* fez cada ação —
  se isso for necessário, é o gatilho pra evoluir pra login individual (Netlify
  Identity/SSO).

## Estrutura

```
digikof-netlify/
  netlify.toml
  package.json
  scripts/
    hash-password.mjs         # gera as credenciais de login
  src/
    db.js                      # acesso ao Netlify Blobs (metadados + arquivos)
    auth.js                    # sessões, hash de senha, bloqueio por tentativas
  netlify/functions/
    auth-login.js               # POST /api/auth/login
    auth-logout.js              # POST /api/auth/logout
    auth-me.js                  # GET /api/auth/me
    folders.js                  # GET/POST /api/folders
    folder-item.js               # DELETE /api/folders/:id
    folder-documents.js          # GET/POST /api/folders/:id/documents
    document-item.js             # PATCH/DELETE /api/documents/:id
    document-file.js             # GET /api/documents/:id/file
  public/
    index.html
    css/styles.css
    js/app.js
```
