#!/bin/bash
# Attendre que le réseau et les services soient prêts
sleep 5

# Masquer le curseur
unclutter -idle 0 &

# Désactiver l'économiseur d'écran
xset s off
xset s noblank
xset -dpms




#chromium \
#  --kiosk \
#  --noerrdialogs \
#  --disable-infobars \
#  --disable-translate \
#  --disable-features=TranslateUI \
#  --no-first-run \
#  --disable-pinch \
#  --overscroll-history-navigation=0 \
#  --enable-usermedia-screen-capturing \
#  --auto-select-desktop-capture-source="Charal Screamer" \
#  --use-fake-ui-for-media-stream \
#  --unsafely-treat-insecure-origin-as-secure=https://localhost:3000 \
#  --allow-http-screen-capture \
#  "https://localhost:3000"

