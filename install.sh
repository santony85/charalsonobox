#!/bin/bash
set -e

USER_HOME="/home/asantero"
APP_DIR="$USER_HOME/charalsonobox-main"
SYSTEMD_DIR="$USER_HOME/.config/systemd/user"

echo "=== Installation des dépendances Linux Mint ==="
sudo apt update
sudo apt install -y \
  git build-essential cmake libjpeg-dev \
  libv4l-dev imagemagick \
  nodejs npm \
  libgl1-mesa-dri libgl1-mesa-glx \
  libx11-dev libxkbcommon-dev \
  libwayland-dev libxkbcommon-x11-0 \
  ffmpeg

echo "=== Installation de mjpg-streamer ==="
cd /tmp
git clone https://github.com/jacksonliam/mjpg-streamer.git
cd mjpg-streamer/mjpg-streamer-experimental
make
sudo make install

echo "=== Création du dossier systemd user ==="
mkdir -p "$SYSTEMD_DIR"

##############################################
# Sonometer Service (Node + Electron)
##############################################
echo "=== Génération du service sonometer ==="
cat > "$SYSTEMD_DIR/sonometer.service" << 'EOF'
[Unit]
Description=Sonometer (Wayland + GPU OFF stable)
After=graphical-session.target

[Service]
Type=simple

ExecStart=/bin/bash -c "sleep 6 && npm start --prefix /home/asantero/charalsonobox-main"
WorkingDirectory=/home/asantero/charalsonobox-main

# Wayland session
Environment=XDG_SESSION_TYPE=wayland
Environment=WAYLAND_DISPLAY=wayland-0
Environment=DISPLAY=:0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
Environment=XDG_RUNTIME_DIR=/run/user/1000

# Electron GPU OFF (stabilité ++)
Environment=ELECTRON_DISABLE_GPU=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=ELECTRON_ENABLE_WAYLAND=1

Environment=PATH=/usr/local/bin:/usr/bin:/bin

Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

##############################################
# Webcam Service (MJPEG Streamer)
##############################################
echo "=== Génération du service webcam ==="
cat > "$SYSTEMD_DIR/webcam.service" << 'EOF'
[Unit]
Description=Webcam MJPEG Streamer
After=graphical-session.target

[Service]
Type=simple

ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 1280x720 -f 30" -o "output_http.so -p 8080"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

echo "=== Activation des services ==="
systemctl --user daemon-reload
systemctl --user enable sonometer.service
systemctl --user enable webcam.service

echo "=== Installation terminée ==="
echo "→ Démarrer sonometer : systemctl --user start sonometer"
echo "→ Démarrer webcam : systemctl --user start webcam"
