#!/usr/bin/env bash
# Run WanderMates.   ./run.sh [up|down|restart|status|logs [service]|upgrade-db|reset]   (default: up)
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "No .env yet. Run ./setup.sh first."; exit 1; }
PORT=${GATEWAY_PORT:-$(grep -E '^GATEWAY_PORT=' .env | cut -d= -f2 || true)}  # a shell variable beats .env, like docker compose
PORT=${PORT:-80}

wait_for_app() {
  echo -n "Waiting for the app"
  for _ in $(seq 1 90); do
    # gateway serves the page, and the auth webhook answers 401 (no token) once api is up
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/auth/hasura" || true)" = "401" ]; then
      echo " ready."
      return 0
    fi
    echo -n "."; sleep 2
  done
  echo " not ready after 3 minutes. Check: ./run.sh logs"
  return 1
}

case "${1:-up}" in
  up)
    docker compose up -d --remove-orphans   # also removes containers of services that no longer exist (auth, actions)
    wait_for_app
    echo
    echo "  App:            http://localhost:$PORT"
    echo "  Hasura console: http://localhost:8080   (admin secret is HASURA_ADMIN_SECRET in .env)"
    echo "  RabbitMQ UI:    http://localhost:15672"
    echo "  Demo login:     sarah@example.com / demo1234"
    echo "  Stop with ./run.sh down, watch logs with ./run.sh logs"
    ;;
  down)    docker compose down ;;
  restart) docker compose restart ;;
  status)  docker compose ps ;;
  logs)    shift; docker compose logs -f --tail=100 "$@" ;;
  upgrade-db)
    # For a database created before pgvector/PostGIS/embeddings: back it up, then apply the three idempotent scripts
    docker compose up -d --remove-orphans postgres
    until docker compose exec -T postgres pg_isready -U wandermate >/dev/null 2>&1; do sleep 1; done
    backup="backup-$(date +%Y%m%d-%H%M%S).sql"
    docker compose exec -T postgres pg_dump -U wandermate wandermate > "$backup"
    echo "Backup written to $backup"
    for f in scripts/upgrade-existing-db.sql db/05-geo-index.sql db/06-embeddings.sql; do
      docker compose exec -T postgres psql -q -U wandermate -d wandermate -v ON_ERROR_STOP=1 < "$f"
      echo "Applied $f"
    done
    echo "Done. Now: ./run.sh up"
    ;;
  reset)
    read -r -p "This deletes the database, queues and Redis data. Type 'yes' to continue: " ok
    [ "$ok" = "yes" ] && docker compose down -v || echo "Cancelled."
    ;;
  *) echo "Usage: ./run.sh [up|down|restart|status|logs [service]|upgrade-db|reset]"; exit 1 ;;
esac
