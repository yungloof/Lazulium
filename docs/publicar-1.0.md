# Publicar o Lazulium 1.0: o que só o dono pode fazer

Checklist em ordem. Cada passo usa contas e credenciais suas, por isso não está automatizado. Onde aparece `SEU-USUARIO`, use o seu usuário do GitHub.

- [ ] 1. Gerar e conferir os instaladores
- [ ] 2. Criar o repositório e a Release no GitHub
- [ ] 3. Publicar a página do projeto (GitHub Pages)
- [ ] 4. Tirar o login do Google do modo de teste
- [ ] 5. Ligar os preços de outras lojas (GG.deals)
- [ ] 6. (Opcional) Assinar o instalador
- [ ] 7. (Depois) Atualização automática

---

## 1. Gerar e conferir os instaladores

1. Confira que o `.env` tem `MAIN_VITE_GOOGLE_CLIENT_ID` e `MAIN_VITE_GOOGLE_CLIENT_SECRET` (sem eles o botão *Entrar com Google* some).
2. Gere:

   ```powershell
   npm run typecheck
   npm run build:win
   ```

   O `build:win` roda `scripts/check-package.mjs` antes do electron-builder: ele para o build se o processo principal usar uma biblioteca que ficou fora do pacote ou se faltar ícone ou imagem do instalador.
3. Em `dist/` devem aparecer `Lazulium-Setup-1.0.0.exe` e `Lazulium-Portable-1.0.0.exe`.
4. Teste rápido num PC (ou usuário do Windows) limpo:
   - instalar com **Apenas para mim**, conferir os atalhos da Área de Trabalho e do Menu Iniciar e o app abrindo no fim;
   - instalar por cima de uma versão antiga e conferir que a biblioteca continua lá;
   - desinstalar e conferir que `%APPDATA%\Lazulium` **continua existindo**;
   - abrir a versão portátil.
5. Anote as somas SHA-256 para pôr na Release (quem quiser pode conferir se o arquivo é o mesmo):

   ```powershell
   Get-FileHash dist\Lazulium-Setup-1.0.0.exe, dist\Lazulium-Portable-1.0.0.exe -Algorithm SHA256
   ```

## 2. Criar o repositório e a Release no GitHub

**Público ou privado?** Para os amigos baixarem pela página de Releases, o repositório precisa ser **público**. Se não quiser abrir o código, crie um segundo repositório público só para as Releases (por exemplo `lazulium-downloads`) e publique os `.exe` lá. A assinatura gratuita da SignPath (passo 6) e a atualização automática (passo 7) ficam mais simples com o código público.

1. Antes de subir, confira que nada pessoal vai junto:

   ```powershell
   git status --ignored --short .env web/profile/lazulium-perfil.json
   git ls-files .env web/profile/lazulium-perfil.json
   ```

   O primeiro comando deve mostrar os dois como ignorados (`!!`) e o segundo não deve mostrar nada.
2. Junte o trabalho na `main`, se ainda não estiver lá: `git checkout main` e `git merge feat/phase-5-achievements`.
3. Crie o repositório vazio em <https://github.com/new> (nome sugerido: `lazulium`, sem README nem licença, que já existem aqui) e suba:

   ```powershell
   git remote add origin https://github.com/SEU-USUARIO/lazulium.git
   git push -u origin main
   git tag -a v1.0.0 -m "Lazulium 1.0.0"
   git push origin v1.0.0
   ```

4. Em **Releases → Draft a new release**: escolha a tag `v1.0.0`, título **Lazulium 1.0.0**, cole a seção 1.0.0 do `CHANGELOG.md` e as somas SHA-256, anexe os dois `.exe` e clique em **Publish release**. Pelo terminal, com o GitHub CLI:

   ```powershell
   gh release create v1.0.0 dist\Lazulium-Setup-1.0.0.exe dist\Lazulium-Portable-1.0.0.exe --title "Lazulium 1.0.0" --notes-file notas-1.0.0.md
   ```

5. No `package.json`, acrescente os endereços do projeto (aparecem nos metadados do app):

   ```json
   "homepage": "https://SEU-USUARIO.github.io/lazulium/",
   "repository": "github:SEU-USUARIO/lazulium",
   ```

O link de download do `README.md` (`../../releases/latest`) passa a funcionar sozinho dentro do GitHub.

## 3. Publicar a página do projeto (GitHub Pages)

O Google exige uma página inicial e uma política de privacidade públicas. A pasta `docs/` já serve como site:

1. No repositório: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/docs`, **Save**.
2. Em alguns minutos ficam no ar:
   - página inicial: `https://SEU-USUARIO.github.io/lazulium/`
   - política de privacidade: `https://SEU-USUARIO.github.io/lazulium/privacidade`
3. Abra os dois endereços e confira.

Se o repositório do código for privado, publique a pasta `docs/` no repositório público de downloads.

## 4. Tirar o login do Google do modo de teste

**Por que é urgente:** em modo de teste, só as contas cadastradas como testadoras conseguem entrar, e o Google **derruba a conexão do Drive a cada 7 dias** (o acesso expira e o amigo precisa entrar de novo).

O Lazulium só pede escopos **não sensíveis** (`openid`, `email` e `drive.file`), então normalmente não há revisão de segurança, só a publicação (e, se o Google pedir, a verificação da marca, que leva poucos dias).

No [Google Cloud Console](https://console.cloud.google.com/), no projeto do client OAuth, abra **Google Auth Platform** (antes chamado de *Tela de permissão OAuth*):

1. **Branding (Identidade da marca):**
   - Nome do app: `Lazulium`; e-mail de suporte: o seu.
   - **Não envie logo por enquanto**: com logo, o Google exige verificação da marca antes de mostrá-la.
   - Página inicial: `https://SEU-USUARIO.github.io/lazulium/`
   - Política de privacidade: `https://SEU-USUARIO.github.io/lazulium/privacidade`
   - Domínios autorizados: `SEU-USUARIO.github.io`
   - Contato do desenvolvedor: o seu e-mail.
2. **Data access (Acesso a dados):** confira que só estão `openid`, `.../auth/userinfo.email` e `.../auth/drive.file`. Se houver outro escopo, remova.
3. **Audience (Público-alvo):** tipo **Externo**, clique em **Publicar app** e confirme. O status deve ficar **Em produção**.
4. Se a **Central de verificação** pedir a verificação da marca, o Google vai querer confirmar que o domínio é seu, pelo [Search Console](https://search.google.com/search-console):
   - adicione a propriedade do tipo **Prefixo de URL** `https://SEU-USUARIO.github.io/` e escolha **Tag HTML** ou **Arquivo HTML**;
   - um site de projeto (`/lazulium/`) não fica na raiz do domínio. Para o arquivo ficar na raiz, crie o repositório `SEU-USUARIO.github.io` com o arquivo de verificação do Google (ele vira `https://SEU-USUARIO.github.io/arquivo.html`);
   - alternativa: um domínio próprio (um `.com.br` custa uns R$ 40 por ano), apontado para o GitHub Pages e verificado pelo DNS.
5. Teste com uma conta Google que **não** é testadora: *Configurações → Entrar com Google* deve chegar à tela de permissão do Google sem o aviso "app não verificado" e o backup deve aparecer na pasta *Lazulium Backups* do Drive.

O client ID e o secret do `.env` **não mudam**: os instaladores já gerados passam a funcionar para todo mundo assim que o app é publicado.

## 5. Ligar os preços de outras lojas (GG.deals)

O código do `/v1/prices` já está no servidor (`server/igdb-proxy`), mas só responde com a chave do GG.deals guardada nele. Sem ela, a lista de desejos mostra só os preços da Steam.

1. Entre no [GG.deals](https://gg.deals/), abra a página da API (*gg.deals/api*) e gere a sua chave.
2. Na pasta do servidor:

   ```powershell
   cd server\igdb-proxy
   npx wrangler@latest secret put GGDEALS_API_KEY
   npx wrangler@latest deploy
   ```

   O primeiro comando pede a chave: cole quando pedir. Não ponha a chave em nenhum arquivo.
3. Confira no navegador: <https://lazulium-igdb.yungloof.workers.dev/v1/prices?steamAppIds=620>. A resposta deve ter `"source":"gg.deals"` e, em `prices["620"]`, `currency` `BRL` com valores em centavos. Se vier `{"error":"not_configured"}`, a chave não foi salva; se vier `upstream_unavailable`, veja os logs com `npx wrangler@latest tail` (o formato da resposta do GG.deals pode ter mudado).
4. Confira também o tempo para zerar: `node smoke.mjs https://lazulium-igdb.yungloof.workers.dev`.

## 6. (Opcional) Assinar o instalador

Sem assinatura, o Windows mostra o aviso do SmartScreen e alguns antivírus desconfiam. Opções (preços aproximados de 2025–2026; confira antes de comprar):

| Opção | Custo aproximado | Observações |
|---|---|---|
| **SignPath Foundation** | Grátis | Para projetos de código aberto: repositório público com licença (MIT já serve), build feito por CI (GitHub Actions) e aprovação da fundação. O certificado sai em nome da SignPath Foundation, não no seu. |
| **Certum Open Source Code Signing** | ~€ 30 a 70 por ano | Certificado em seu nome para desenvolvedor de código aberto, com cartão físico ou assinatura na nuvem (SimplySign). |
| **Azure Trusted Signing** (Artifact Signing) | ~US$ 10 por mês | Serviço da Microsoft, sem token físico; exige validação de identidade e, até 2025, só atendia alguns países (EUA, Canadá, Europa). Confira se já atende o Brasil. O electron-builder 25 suporta em `win.azureSignOptions`. |
| **Certificado OV** (Sectigo, SSL.com, Certum…) | ~US$ 200 a 400 por ano | Validação da sua identidade ou empresa; chave obrigatoriamente em token USB ou na nuvem. |
| **Certificado EV** | ~US$ 300 a 600 por ano | Validação mais rígida (em geral exige empresa). Desde 2024 **não tira mais o aviso na hora**: como o OV, ganha reputação no SmartScreen com o tempo e com os downloads. |

Com qualquer opção, a reputação no SmartScreen cresce com os downloads; o aviso some depois de um tempo, não no primeiro dia. Para configurar, use `win.signtoolOptions` (certificado em arquivo ou token) ou `win.azureSignOptions` no bloco `build` do `package.json`, e guarde senhas em variáveis de ambiente (`CSC_LINK`, `CSC_KEY_PASSWORD`), nunca no repositório.

## 7. (Depois) Atualização automática

Hoje o amigo precisa baixar o instalador novo a cada versão. Para o Lazulium se atualizar sozinho pelo GitHub:

1. **Dependência:** `npm install electron-updater` (em `dependencies`, porque roda no processo principal; não a coloque nas exclusões de `build.files`, o `check-package` acusa se isso acontecer).
2. **`package.json` → `build`:** acrescente

   ```json
   "publish": [{ "provider": "github", "owner": "SEU-USUARIO", "repo": "lazulium" }]
   ```

   O electron-builder passa a gerar o `latest.yml` junto com o instalador. Cada Release precisa ter **o `Lazulium-Setup-x.y.z.exe`, o `.blockmap` e o `latest.yml`**. Dá para publicar direto com `npx electron-builder --win --x64 --publish always` e a variável `GH_TOKEN` (token do GitHub com permissão de escrita no repositório).
3. **Código** (seguindo o passo a passo de IPC do `CLAUDE.md`): um serviço em `src/main/services/` que, só no app instalado (`app.isPackaged`, e fora da versão portátil, que não se atualiza), chama `autoUpdater.checkForUpdates()` ao abrir e a cada poucas horas; e um aviso na interface "Versão nova pronta: reiniciar agora", que chama `autoUpdater.quitAndInstall()`.
4. **Regras:** as Releases precisam estar publicadas (não rascunho) num repositório público; a versão do `package.json` precisa subir a cada lançamento (1.0.1, 1.1.0…); o `artifactName` atual (`Lazulium-Setup-${version}.${ext}`, sem espaços) já serve.
5. **Assinatura:** funciona sem, mas, quando o instalador for assinado, configure `publisherName` para o electron-updater conferir que a atualização veio de você.
