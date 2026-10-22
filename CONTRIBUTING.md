# Como contribuir

Valeu por querer ajudar, mané! Bug, ideia, regra da praça que ficou de fora, arte, fala nova: tudo é bem-vindo.

## Antes de começar

- **Bug ou ideia**: abra uma [issue](../../issues) usando o modelo. Pra mudança grande (regra nova, tela nova, troca de biblioteca), abra a issue antes do código, pra combinar o caminho.
- **Falha de segurança**: não abra issue pública. Veja [SECURITY.md](SECURITY.md).
- Ao participar, você concorda com o [código de conduta](CODE_OF_CONDUCT.md).

## Rodando local

Precisa de Node 24+, pnpm 11 e Docker. O passo a passo está no [README](README.md#rodando-local). Resumo:

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp apps/server/.env.example apps/server/.env
pnpm --filter @domino/server db:deploy
pnpm dev
```

## Onde fica cada coisa

| Pasta | O quê |
| --- | --- |
| `packages/engine` | Regras puras (sem I/O). Qualquer regra nova começa aqui, com teste. |
| `packages/bots` | Amador, Bom de praça e Monstro; simulador (`pnpm sim`). |
| `packages/shared` | Protocolo cliente/servidor e catálogos (personagens, frases, níveis, medalhas). |
| `apps/server` | Fastify + Socket.IO + Prisma. O servidor é quem manda: o cliente só pede a jogada. |
| `apps/web` | React + react-three-fiber. Cena 3D em `src/three`, telas em `src/screens`. |
| `e2e` | Playwright. |

## Jeito do código

- **Português** nos nomes de domínio, nos textos do app e nos comentários (o jeito manezinho dos textos é parte do jogo).
- Comentário explica o **porquê**, não o que a linha faz.
- TypeScript estrito; sem `any` e sem `as` à toa.
- Mudou o protocolo do socket de um jeito que app antigo não entende? Suba `PROTOCOL_VERSION` (`packages/shared/src/protocol.ts`) e o `MIN_PROTOCOL_VERSION` do servidor.
- Mudou o banco? `pnpm --filter @domino/server db:migrate` gera a migração; mande o arquivo junto.
- Texto novo na tela? Confira contraste e leitor de tela (o `pnpm e2e` roda o axe).

## Antes de abrir o PR

```bash
pnpm typecheck
pnpm test
pnpm e2e          # sobe os servidores de dev sozinho se precisar
```

Mexeu nos bots? Rode também `pnpm sim -- --games 1000` (o Monstro tem que seguir acima de 75% contra o Amador).

No PR, conte o que mudou, por quê, e como você testou. Mudança visual vai melhor com print (celular e desktop).

## Arte, falas e modelos

- Arte e falas entram sob [CC BY 4.0](LICENSE-ASSETS.md). Só mande o que é seu (ou gerado por você) e que pode ser redistribuído.
- Não use foto ou voz de pessoa real sem autorização, nem imagem com licença que não permita redistribuir.
- Como regerar retratos, fundos, bonecos e falas: veja o [README](README.md#personagens-retratos-e-3d).

## Licença

Ao contribuir, você concorda que o código entra sob a [licença MIT](LICENSE) e a arte e as falas sob [CC BY 4.0](LICENSE-ASSETS.md).
