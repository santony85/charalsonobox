#!/bin/bash

USER_HOME="/home/asantero"
APP_DIR="$USER_HOME/charalsonobox-main"
SYSTEMD_DIR="$USER_HOME/.config/systemd/user"

mkdir -p "$SYSTEMD_DIR"

##############################################
# Sonometer Service (Node + Electron)
##############################################
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
cat > "$SYSTEMD_DIR/webcam.service" << 'EOF'
[Unit]
Description=Webcam MJPEG Streamer
After=graphical-session.target

[Service]
Type=simple

ExecStart=/usr/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 1280x720 -f 30" -o "output_http.so -p 8080"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

##############################################
# Reload + Enable
##############################################
systemctl --user daemon-reload
systemctl --user enable sonometer.service
systemctl --user enable webcam.service

echo "✔ Services générés et activés."
echo "→ Lance : systemctl --user start sonometer"
echo "→ Lance : systemctl --user start webcam"
