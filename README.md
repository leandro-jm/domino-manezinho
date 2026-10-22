# Dominó Manezinho — Praça XV

Dominó em duplas na mesa de concreto da Praça XV de Novembro, em Florianópolis. Dá para jogar online com os amigos (criando a sala e chamando a turma, ou entrando numa mesa aberta) ou treinar contra bots, até sem internet. Funciona no desktop e no celular como PWA, com notificações.

*Partnership dominoes on the concrete tables of Praça XV, Florianópolis (Brazil): online multiplayer with friends, offline practice against Monte Carlo bots, 3D scene, installable PWA. Open source (MIT code, CC BY 4.0 art); docs in Portuguese.*

Código aberto: código sob [MIT](LICENSE), arte e falas sob [CC BY 4.0](LICENSE-ASSETS.md). Quer ajudar? Veja o [CONTRIBUTING](CONTRIBUTING.md).

## O que tem

- **Regras da praça**: 4 jogadores em duplas, 7 pedras cada, sem compra. Saída com a carroça de sena. Batida simples 1 ponto, carroça 2, lá-e-ló 3, cruzada 4. Trancado vai para quem tem menos pontos na mão. Partida até 6, até 10, ou modo pontos até 100, com "galo" opcional.
- **Online**: sala privada (código de 5 letras e link para compartilhar no WhatsApp) ou mesa aberta no lobby.
  - Jogo rápido: os bots completam a mesa depois de 20 s.
  - O dono da sala escolhe as cadeiras e põe bots.
  - Tempo por jogada, reconexão automática e bot segurando a vez de quem caiu.
  - Convite pra mesa aparece na tela de quem está com o app aberto; push só pra quem não está olhando.
- **Bots**:
  - **Amador**: joga quase no chute.
  - **Bom de praça**: Monstro de conta curta que às vezes joga no impulso. Ganha do Amador ~72% e perde do Monstro ~75%.
  - **"É um monstro"**: Monte Carlo com mãos sorteadas de forma coerente com os passes. Venceu 87–89% de 1000 partidas contra o Amador.
- **Treino que ensina**: dica 💡 (a jogada que o Monstro faria, tecla D), memória da mesa 🧠 (o que cada um já mostrou não ter) e, no fim da mão, os "lances pra pensar": jogadas que renderam bem menos que a do Monstro, com um peru comentando.
- **Histórico e replay**: as partidas online ficam no Perfil e dá pra rever cada mão jogada a jogada, com as pedras de todo mundo.
- **Social e conta**: perfil de quem aparece no ranking, a própria posição mesmo fora do top 50, silenciar as frases de um jogador, notificações por tipo, medalhas, e baixar os dados ou apagar a conta (LGPD).
- **Ranking**: Elo por dupla (geral, semanal e amigos) e ranking de treino contra bots (informal). Títulos de "Tanso" a "Rei da Praça XV". Vale ranking a partida com pelo menos dois humanos com conta de 24 h ou 5 partidas online; contra o mesmo adversário, só 3 partidas por dia rendem rating.
- **Personagens de Floripa**: 12 avatares de tipos manezinhos e folclore (pescador da Barra, rendeira, benzedeira, Bernunça, Boi de Mamão, bruxa do Cascaes…), com retratos ilustrados. O nome é livre, e alguns personagens são liberados por vitórias online.
- **Gente de verdade na mesa**: os outros três jogadores aparecem sentados nos banquinhos, cada um vestido como o personagem que escolheu (chapéu, lenço, avental, roupa de surfe, fantasia de boi…). Esticam o braço quando jogam e falam quando mandam frase rápida.
- **Cena 3D**:
  - Mesa de granilite com as faixas brancas, sombra das folhas da Figueira e calçada portuguesa em ondas.
  - Figueira Centenária com as escoras de ferro e o Palácio Cruz e Sousa.
  - Catedral Metropolitana baseada em foto: duas torres amarelas, pórtico de colunas, rosácea, relógio e escadaria de granito, com os prédios modernos do entorno.
  - Pombos que andam com o balanço de cabeça e ciscam.
  - Plano de abertura antes de descer para a mesa.
  - Três níveis de qualidade e tabuleiro 2D reserva para aparelho sem WebGL. Na qualidade baixa a cena desenha no máximo 30 quadros por segundo (economiza bateria); nas outras a resolução baixa sozinha se os quadros começam a atrasar. Se os bonecos não baixarem (primeira vez sem rede), a mesa 3D segue sem eles.
- **Os "perus" da mesa**: até cinco espectadores em pé em volta da mesa.
  - Comentam os lances com nomes e números reais ("Toc-toc! Tião não tem 3 nem 5.", "Lá-e-ló! Que beleza, meu!"), cobram quem demora e de vez em quando jogam conversa fora.
  - O botão 👀 levanta a câmera para ver a roda.
  - As falas são só no aparelho de cada um: online, cada jogador vê os seus.
- **PWA**: instalável, joga offline contra os bots e envia push de convite, sala cheia e "tua vez". No iPhone o push exige o app instalado na tela de início.
- **Acessibilidade**: pedras grandes, alto contraste, narração das jogadas pra leitor de tela, jogo inteiro pelo teclado (1–7 escolhem a pedra, ←/→ a ponta, P passa), volume por canal e respeito a "reduzir movimento".

## Estrutura

```
packages/engine   regras puras (sem I/O): partida, jogadas legais, pontuação, visão por jogador
packages/bots     Amador e Monstro + simulador
packages/shared   protocolo cliente/servidor, avatares, níveis de bot, frases, títulos, validação de apelido
apps/web          React + react-three-fiber + zustand + vite-plugin-pwa
apps/server       Fastify + Socket.IO + Prisma/Postgres + web-push
e2e               Playwright (offline e 4 jogadores online)
infra             docker compose (dev e produção)
```

O servidor é **autoritativo**: o cliente só manda a intenção (`play`/`pass`). O servidor valida com a engine e manda para cada jogador apenas a própria mão.

## Rodando local

Requisitos: Node 24+, pnpm 11 e Docker.

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d          # Postgres na porta 5442
cp apps/server/.env.example apps/server/.env              # ajuste JWT_SECRET
pnpm --filter @domino/server vapid >> apps/server/.env    # chaves de push (opcional)
pnpm --filter @domino/server db:deploy
pnpm dev                                                   # web em :5173, API em :3001
```

O Vite repassa `/api` e `/socket.io` para o servidor. Sem servidor, o app abre do mesmo jeito e o treino contra bots funciona offline.

## Testes

| Comando | O que roda |
| --- | --- |
| `pnpm test` | unidade e integração de todos os pacotes. O servidor usa o banco `domino_test`, criado sozinho |
| `pnpm typecheck` | TypeScript estrito em tudo |
| `pnpm e2e` | Playwright: treino offline, 4 navegadores numa sala com reconexão no meio, partida inteira revista no replay e acessibilidade (axe + uma mão jogada só no teclado). Sobe os servidores de dev se não estiverem rodando |
| `pnpm sim -- --games 1000` | Monstro contra Amador; falha se ficar abaixo de 75%. Outros confrontos: `--a praca --b amador` (e `--min` pro piso) |
| `pnpm --filter @domino/server load -- --rooms 200 --level monstro` | carga com N mesas simultâneas |

## Produção

Dois jeitos: no [Dokploy](#deploy-no-dokploy) (domínio e HTTPS pela tela) ou num servidor com Docker e um proxy HTTPS seu:

```bash
cp infra/.env.prod.example infra/.env.prod   # senhas, JWT_SECRET, PUBLIC_URL, VAPID
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

- A imagem constrói o PWA e empacota o servidor em JS (`pnpm --filter @domino/server build`, com os pacotes do workspace dentro); o runtime leva só as dependências de produção (~860 MB, eram 1,3 GB). Aplica as migrações ao subir e serve app, API e socket na porta 3001.
- Coloque um proxy com **HTTPS** na frente (Caddy, Traefik ou nginx). Instalação do PWA e push exigem HTTPS.
- A porta 3001 é publicada só em `127.0.0.1` (`APP_BIND`) e o servidor confia em 1 salto de proxy (`TRUST_PROXY`) para ler o IP real usado no limite de requisições. Proxy noutra máquina: ajuste os dois.
- O container roda como usuário `node`, com headers de segurança (CSP, HSTS, `frame-ancestors 'none'`) e limite de requisições por IP.
- Cache: arquivos em `/assets` ficam em cache por um ano; `index.html`, `sw.js` e o manifest sempre revalidam.
- **Deploy sem derrubar partida**: no desligamento (e a cada 10 s) o servidor salva mesas em andamento e resultados ainda não gravados no volume `appstate` (`STATE_DIR`). Ao subir, remonta as mesas; os apps reconectam sozinhos e cada jogador volta pra mesma cadeira (60 s de carência antes de um bot assumir).
- **Banco fora**: a partida continua (roda em memória). Resultado que não gravou fica na fila e é gravado quando o banco volta, sem duplicar. `/api/health` responde em até 2 s (503 com banco fora) e mostra `pendingResults`. O health check do container usa `/api/health/live`, que só diz se o processo está de pé, para o banco fora não derrubar as mesas.
- Health check do container no compose, logs com rotação (10 MB × 5) e 30 s para desligar com calma.
- **Métricas**: com `METRICS_TOKEN`, `/api/metrics` responde no formato do Prometheus (`Authorization: Bearer <token>`): mesas, sockets, resultados pendentes, latência do ack por evento, tempo das rotas, atraso do event loop, memória e erros do app. Sem o token o endpoint não existe.
- **Erros do app**: o PWA manda pro servidor (`/api/client-errors`, vai pro log e pra métrica `domino_client_errors_total`) erro de tela, promessa sem tratamento, perda do WebGL e falha ao baixar os bonecos. Cada erro vai uma vez por sessão, no máximo 20.
- **Backup**: `infra/backup.sh` faz `pg_dump` comprimido em `backups/` e guarda os últimos 48. Com `BACKUP_REMOTE` (destino do rclone) manda uma cópia pra fora da máquina, criptografada com GPG se houver `BACKUP_GPG_RECIPIENT`. Agende no cron do servidor (exemplo e comando de restauração no topo do script).

## Deploy no Dokploy

O `docker-compose.dokploy.yml` sobe o app, o Postgres e um backup do banco de hora em hora. O Traefik do Dokploy cuida do domínio, do HTTPS e do WebSocket. O app entra na rede `dokploy-network` (criada pelo Dokploy na instalação) pra o Traefik alcançar; banco e backup ficam numa rede só deles. Fora do Dokploy, use o `infra/docker-compose.prod.yml`.

1. **Criar o serviço**: no projeto, *Create Service → Compose*. Em *Provider*, aponte pro repositório (GitHub ou Git) e o branch. Em *Compose Path*, coloque `./docker-compose.dokploy.yml`.
2. **Variáveis** (aba *Environment*):

   | Variável | Obrigatória | O quê |
   | --- | --- | --- |
   | `POSTGRES_PASSWORD` | sim | Senha do banco. Gere com `openssl rand -base64 24`. |
   | `JWT_SECRET` | sim | Assina a identidade dos jogadores. Gere com `openssl rand -base64 48`. **Trocar depois desloga todo mundo.** |
   | `PUBLIC_URL` | sim | Endereço público com `https://`, igual ao domínio do passo 3. |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | não | Notificações push. Gere o par com `npx web-push generate-vapid-keys`; o subject é `mailto:` com teu e-mail. Sem elas, o jogo funciona sem push. |
   | `TRUST_PROXY` | não | Padrão `1` (o Traefik). Com Cloudflare em modo proxy na frente, use `2`. |
   | `METRICS_TOKEN` | não | Liga `/api/metrics` (Prometheus) com esse token. |
   | `BOT_WORKERS` | não | Threads do bot Monstro (padrão: núcleos − 1, até 4). |
   | `BACKUP_EVERY_SECONDS`, `BACKUP_KEEP` | não | Frequência (padrão 3600) e quantos dumps guardar (padrão 48). |

3. **Domínio** (aba *Domains*): serviço `app`, porta `3001`, path `/`, HTTPS ligado com Let's Encrypt. O DNS do domínio tem que apontar pro servidor antes.
4. **Deploy**. O primeiro build (PWA e servidor) leva alguns minutos e quer pelo menos 2 GB de RAM livres. As migrações do banco rodam sozinhas toda vez que o app sobe.

**Atualizar**: um novo deploy recria o app. As mesas em andamento ficam no volume `appstate` e voltam no app novo; os jogadores reconectam sozinhos e voltam pra mesma cadeira.

**Uma instância só**: as mesas vivem na memória de um processo. Não aumente as réplicas nem use deploy com duas versões no ar ao mesmo tempo.

**Backup**: o serviço `backup` grava `pg_dump` comprimido no volume `pgbackups`. Pra ter cópia fora do servidor, ligue o *Volume Backups* do Dokploy nesse volume com um destino S3. Pra restaurar um dump (pelo terminal do serviço `backup` no Dokploy):

```bash
ls -1t /backups                                   # escolhe o arquivo
gunzip -c /backups/domino-AAAAMMDD-HHMMSS.sql.gz | psql
```

**Cloudflare**: com o proxy laranja ligado, deixe o WebSocket ativo (vem ligado) e use `TRUST_PROXY=2`.

## Personagens (retratos e 3D)

- **Retratos**: as ilustrações originais ficam em `apps/web/art/avatares/<id>.jpg`. O comando `node apps/web/scripts/make-avatars.mjs` recorta cada uma em círculo e gera `public/avatars/<id>.webp`. O enquadramento por personagem fica no `TUNE` do script; `--sheet arquivo.png` gera uma folha de contato para conferir.
- **Bonecos 3D**: corpos, cabelos e animações vêm de dois pacotes **CC0** da Quaternius, nas versões Standard gratuitas: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) e [Universal Animation Library](https://quaternius.itch.io/universal-animation-library). Para regerar `public/models/`, descompacte os dois numa pasta e rode `node apps/web/scripts/build-characters.mjs <pasta>`. O script converte o FBX das animações, ajusta-as aos corpos e otimiza tudo (~3 MB).
- **Figurinos**: ficam em `apps/web/src/three/gente/looks.ts`. A roupa é pintada no corpo pelo shader (`clothes.ts`); chapéus, lenços, bigodes e cabeças de fantasia são peças presas aos ossos (`acessorios.ts`). Em dev, `?cena=desfile` mostra os 12 personagens lado a lado.

## Trocando a arte

Tudo visual é gerado em código (canvas, SVG e geometria low-poly), para não depender de imagens sem licença. Para deixar mais realista:

- **Panorama 360° da praça**: defina `VITE_PANORAMA_URL` (HDR ou JPG equirretangular) e ele substitui o céu procedural.
- **Texturas**: em `apps/web/src/three/textures.ts` (tampo da mesa, calçada, faces das pedras).
- **Modelos glTF** da Figueira e da Catedral: substitua os componentes em `apps/web/src/three/Praca.tsx`.
- **Avatares**: troque o SVG em `apps/web/src/components/Avatar.tsx` pela arte final. O catálogo fica em `packages/shared/src/avatars.ts`.
- **Sons**: são sintetizados em `apps/web/src/lib/sound.ts` e podem virar gravações reais da praça.

Use só fotos próprias ou licenciadas, e não use a imagem de pessoas reais sem autorização.

## Música e vozes

As duas funcionam sem nenhum arquivo e podem ser substituídas por gravações quando quiser. Os arquivos são achados no build: basta colocar na pasta, sem registrar em lugar nenhum. Eles baixam na primeira vez que tocam e ficam no cache para jogar offline.

- **Música de fundo** (`apps/web/src/lib/music.ts`): sem arquivo, toca um violão dedilhado sintetizado. Para usar música de verdade, coloque `.mp3` ou `.m4a` em `apps/web/src/assets/musica/`. As faixas tocam embaralhadas, em sequência, e uma faixa sozinha fica em laço sem emenda. Cada faixa é decodificada inteira na memória, então prefira laços de 1 a 2 minutos. Evite `.ogg`, que não toca em iPhones antigos.
- **Vozes** (`apps/web/src/lib/voice.ts`): sem gravação, cada personagem fala um blablablá no tom definido em `voice` no catálogo (`packages/shared/src/avatars.ts`). Para gravar uma fala, salve em `apps/web/src/assets/falas/<avatarId>/<emoteId>.mp3`, com os ids de `avatars.ts` e de `EMOTES` em `flavor.ts`. Exemplo: `falas/mane/olholho.mp3`. Dá para gravar só algumas falas; as outras continuam no blablablá. As falas atuais são vozes sintéticas da OpenAI (veja abaixo); a primeira versão foi feita com as vozes em português do macOS por `node apps/web/scripts/make-voices.mjs`. A voz e a velocidade de cada personagem ficam no `CAST` do script, e o jeito de pronunciar cada frase no `SPOKEN`. O script não sobrescreve arquivos que já existem; para refazer, use `--force`, e para limitar, `--only mane` ou `--emote olholho`. Para vozes melhores, com sotaque pedido por instrução, use `node apps/web/scripts/make-voices-openai.mjs`. Ele precisa de `OPENAI_API_KEY` no ambiente ou em `apps/web/scripts/.env` (modelo em `apps/web/scripts/.env.example`), e com `--dry` mostra o que vai gerar sem chamar a API. O sotaque fica em `SOTAQUE` e cada personagem tem voz e jeito de falar no `CAST`. Ele substitui as falas feitas pelo Mac e mantém as gravadas à mão. O arquivo `falas/geradas.json` anota quem gerou cada fala: o que não está nele é tratado como gravação manual. Pelas regras de uso da OpenAI, o jogo precisa avisar os jogadores que as vozes são geradas por IA. A boca do boneco mexe pelo tempo do áudio, e a música abaixa enquanto alguém fala.

Use só músicas com licença livre (CC0 ou equivalente) ou próprias, e vozes de quem autorizou.

## Decisões e limites conhecidos

- **Socket.IO em vez de Colyseus**: as salas são um gerenciador próprio sobre Socket.IO. Como a engine já cuida do estado e da visão por jogador, ficou mais simples e testável.
- **Um processo só**: salas, presença e limites de taxa vivem em memória. As mesas sobrevivem a reinício pelo arquivo de estado (`STATE_DIR`), mas não dá pra rodar dois servidores ao mesmo tempo.
  - Para escalar horizontalmente: adapter Redis do Socket.IO mais roteamento fixo por código de sala.
  - O teste de carga passou com 200 mesas simultâneas, inclusive só com Monstros, num processo: p99 do ack abaixo de 10 ms e nenhum erro.
  - O Monstro pensa em `worker_threads` (`BOT_WORKERS`, padrão núcleos − 1, até 4), para uma mesa pensando não atrasar as outras.
- **Versão do protocolo**: o app manda `PROTOCOL_VERSION` (`packages/shared/src/protocol.ts`) ao conectar. Ao mudar o socket de um jeito que app antigo em cache não entende, suba a versão e o `MIN_PROTOCOL_VERSION` do servidor: o app velho é recusado com `update_required` e se atualiza sozinho.
- **Sem login**: a identidade é por aparelho (token guardado no navegador). Dá para levar o perfil para outro aparelho com um código de 8 letras (uso único, vale 10 minutos; o aparelho antigo perde o acesso ao resgatar). A tabela `Player` já tem `authProvider` para plugar Google ou Apple depois.
- **Treino confiado ao cliente**: resultados de treino offline são aceitos como vierem. Valem só para o ranking de treino (informal); não desbloqueiam personagens.
- **Partida abandonada não é gravada**: só partidas terminadas entram no ranking.
- **Jogada por toque ou teclado**: não dá para arrastar a pedra até a ponta. Toque na pedra (ou tecla 1–7) e, se ela servir nas duas pontas, toque na ponta destacada, no botão ou use ←/→.

## Licença

- Código: [MIT](LICENSE).
- Ilustrações e falas: [CC BY 4.0](LICENSE-ASSETS.md). As falas são vozes sintéticas, geradas por IA.
- Bonecos 3D: CC0, da [Quaternius](https://quaternius.com).
- Os escudos e nomes do Avaí e do Figueirense são marcas dos clubes e não entram nessas licenças. O projeto não tem vínculo com eles. Detalhes em [LICENSE-ASSETS.md](LICENSE-ASSETS.md).
