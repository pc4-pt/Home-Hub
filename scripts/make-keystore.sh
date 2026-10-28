#!/usr/bin/env bash
# One-off: create a signing key so APK updates install over the old version,
# and store it as GitHub secrets (needs the GitHub CLI, logged in, run inside the repo).
set -euo pipefail
read -rsp "Choose a keystore password: " PW; echo
keytool -genkeypair -v -keystore hub.keystore -alias homehub -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PW" -keypass "$PW" -dname "CN=Home Hub"
base64 < hub.keystore | tr -d '\n' | gh secret set HUB_KEYSTORE_B64
printf '%s' "$PW" | gh secret set HUB_KEYSTORE_PASSWORD
echo "Secrets set. Keep hub.keystore somewhere safe (it's git-ignored) — losing it means reinstalling the app."
