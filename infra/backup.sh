#!/bin/sh
# Backup do Postgres de produção: dump comprimido com data no nome, guarda os últimos N.
# Uso (de hora em hora, por exemplo, no crontab do servidor):
#   0 * * * * cd /caminho/do/projeto && infra/backup.sh >> /var/log/domino-backup.log 2>&1
# Restaurar:
#   gunzip -c backups/domino-AAAAMMDD-HHMMSS.sql.gz | docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec -T postgres psql -U domino domino
#
# Cópia fora da máquina (opcional; disco do servidor que morre leva o backup local junto):
#   BACKUP_REMOTE=b2:domino-backups      destino do rclone (S3, B2, Google Drive, SFTP...; configure com `rclone config`)
#   BACKUP_GPG_RECIPIENT=voce@exemplo    criptografa antes de mandar (o dump tem dados dos jogadores)
# A retenção lá fora fica com a regra de ciclo de vida do próprio serviço.
# Restaurar de lá: rclone copy b2:domino-backups/domino-....sql.gz.gpg . && gpg -d ... | gunzip -c | (psql como acima)
set -eu

cd "$(dirname "$0")/.."
# A cópia remota pode vir do ambiente ou do infra/.env.prod (só lê essas chaves; não executa o arquivo).
envval() { sed -n "s/^$1=//p" infra/.env.prod 2>/dev/null | tail -1; }
BACKUP_REMOTE="${BACKUP_REMOTE:-$(envval BACKUP_REMOTE)}"
BACKUP_GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-$(envval BACKUP_GPG_RECIPIENT)}"
DIR="${BACKUP_DIR:-backups}"
KEEP="${BACKUP_KEEP:-48}"
mkdir -p "$DIR"
FILE="$DIR/domino-$(date +%Y%m%d-%H%M%S).sql.gz"

# Escreve num temporário e só renomeia se o dump terminou: backup pela metade nunca fica com nome de bom.
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec -T postgres \
  pg_dump -U domino --no-owner --clean --if-exists domino | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "$(date -Iseconds) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "$(date -Iseconds) ERRO: BACKUP_REMOTE definido mas o rclone não está instalado; ficou só a cópia local" >&2
    exit 1
  fi
  UPLOAD="$FILE"
  if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE.gpg" --encrypt "$FILE"
    UPLOAD="$FILE.gpg"
  fi
  # Falhou o envio: a cópia local fica e o script sai com erro (o cron registra).
  if rclone copy "$UPLOAD" "$BACKUP_REMOTE"; then
    echo "$(date -Iseconds) cópia remota ok: $BACKUP_REMOTE/$(basename "$UPLOAD")"
  else
    echo "$(date -Iseconds) ERRO: não deu pra mandar pra $BACKUP_REMOTE; ficou só a cópia local" >&2
    [ "$UPLOAD" = "$FILE" ] || rm -f "$UPLOAD"
    exit 1
  fi
  [ "$UPLOAD" = "$FILE" ] || rm -f "$UPLOAD"
fi

# Apaga os mais antigos além dos últimos $KEEP.
ls -1t "$DIR"/domino-*.sql.gz | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old"; done
