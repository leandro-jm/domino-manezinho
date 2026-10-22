# Licenças da arte, das vozes e dos modelos

O **código** do Dominó Manezinho é MIT (veja [`LICENSE`](LICENSE)). A arte e as vozes têm licença própria, descrita aqui.

| O quê | Onde | Licença |
| --- | --- | --- |
| Ilustrações dos personagens (originais e retratos recortados) | `apps/web/art/avatares/`, `apps/web/public/avatars/` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt_BR) |
| Ilustrações da Praça XV (originais e fundos do app) | `apps/web/art/fundos/`, `apps/web/public/fundos/` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt_BR) |
| Falas dos personagens | `apps/web/src/assets/falas/` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt_BR) |
| Bonecos 3D e animações | `apps/web/public/models/` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.pt_BR) — [Quaternius](https://quaternius.com) |
| Ícones do app | `apps/web/public/icons/` | MIT (gerados em código por `apps/web/scripts/make-icons.mjs`) |
| Cena 3D, sons, música sintetizada, faces das pedras, avatares em SVG | código em `apps/web/src/` | MIT (desenhados e sintetizados em código) |

## Como dar o crédito (CC BY 4.0)

Pode copiar, adaptar e usar inclusive comercialmente, desde que dê o crédito, indique se mudou alguma coisa e aponte a licença. Por exemplo:

> Ilustrações e falas do Dominó Manezinho, © 2026 Leandro Martins, sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Vozes sintéticas

As falas em `apps/web/src/assets/falas/` foram geradas por síntese de voz da OpenAI (o gerador de cada arquivo está anotado em `geradas.json`). **Não são gravações de pessoas reais.** Quem regerar ou acrescentar falas com `apps/web/scripts/make-voices-openai.mjs` precisa da própria chave (`OPENAI_API_KEY` em `apps/web/scripts/.env`) e deve seguir os termos e as políticas de uso da OpenAI, inclusive avisar que as vozes são geradas por IA.

## Marcas de terceiros

Os nomes e os escudos do **Avaí Futebol Clube** e do **Figueirense Futebol Clube**, desenhados na mesa (`apps/web/src/game/teams.ts`) e citados nas falas dos perus, são marcas dos respectivos clubes. Eles **não** estão cobertos pelas licenças acima e aparecem só como referência à cultura da praça. O projeto não tem vínculo com os clubes nem é endossado por eles. Se for usar o jogo comercialmente, troque os escudos.
