#!/usr/bin/env bash
# One-time setup: checks Docker, creates .env with random secrets, builds every image.
# Then start the app with ./run.sh   (SETUP_NO_BUILD=1 skips the build)
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker is not installed: https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (docker compose ...)"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is installed but not running. Start Docker Desktop / the daemon and retry."; exit 1; }

rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [ -f .env ]; then
  echo ".env already exists, leaving it as is."
else
  cp .env.example .env
  for key in POSTGRES_PASSWORD RABBITMQ_PASSWORD HASURA_ADMIN_SECRET JWT_SECRET; do
    sed -i.bak "s|^${key}=.*|${key}=$(rand)|" .env
  done
  rm -f .env.bak
  echo "Created .env with fresh random secrets."
  echo "Optional: fill in EMAIL_* (verification / reset mails) and TWILIO_* (SMS, SOS) in .env."
fi

if [ "${SETUP_NO_BUILD:-}" != "1" ]; then
  docker compose build
fi

echo
echo "Setup done. Start the app with: ./run.sh"
