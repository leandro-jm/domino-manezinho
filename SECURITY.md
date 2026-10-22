# Segurança

## Como relatar uma falha

**Não abra issue pública.** Use o relato privado do GitHub: aba **Security** do repositório → **Report a vulnerability**. Só quem mantém o projeto vê.

Conte:

- o que dá pra fazer explorando a falha (ex.: ver a mão de outro jogador, subir rating sem jogar, ler dados de outra pessoa);
- como reproduzir, passo a passo;
- a versão (commit) ou o endereço onde viu.

A resposta inicial vem em até 7 dias. Corrigida a falha, a gente combina com você quando e como divulgar, e dá o crédito se você quiser.

## O que conta como falha

- Ver informação escondida do jogo (mão dos outros, pedras ainda não reveladas).
- Jogar no lugar de outra pessoa ou fora da vez.
- Burlar as regras de ranking (rating sem partida de verdade, partidas contra si mesmo).
- Acessar, mudar ou apagar dados de outra conta (perfil, histórico, notificações).
- Fazer o servidor mandar requisição pra endereço arbitrário (push), ler arquivos ou executar código.
- Derrubar o servidor com pouco esforço.

Não contam: spam de cadastro dentro dos limites por IP, ou o resultado do treino offline, que é informado pelo próprio aparelho por desenho (vale só pro ranking informal de treino).

## Quem hospeda

Se você roda uma instância:

- Troque `JWT_SECRET`, `POSTGRES_PASSWORD` e as chaves VAPID pelos seus (veja o [README](README.md#produção)).
- Sirva só por HTTPS.
- Ajuste `TRUST_PROXY` ao número de proxies na frente, senão o limite de requisições por IP não funciona.
- Deixe `METRICS_TOKEN` vazio ou use um token longo.
