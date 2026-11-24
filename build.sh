#!/usr/bin/env bash
# Render build step: install, collect static files, migrate the database.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Create the admin account once, from DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD.
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
  python manage.py createsuperuser --no-input || echo "Admin account already exists, skipping."
fi
