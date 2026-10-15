#!/usr/bin/env bash
# One-shot base setup for a fresh unifolio-staging-N VM
# (Docs/orchestration/leapswitch-staging-plan.html, Phase 2 item 6). Re-runnable:
# every step checks current state before acting, so running this twice is a
# no-op on anything already done. Run as root, once, right after first boot
# and before `deploy/leapswitch/scripts/deploy.sh`.
set -euo pipefail

DATA_DEV="/dev/vdb"
DATA_MOUNT="/srv/data"
SWAP_FILE="/swapfile"
SWAP_SIZE_GB=4

echo "== timezone =="
timedatectl set-timezone Asia/Kolkata

echo "== unattended security updates =="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -yqq unattended-upgrades
dpkg-reconfigure -fnoninteractive unattended-upgrades

echo "== data volume: ${DATA_DEV} -> ${DATA_MOUNT} =="
if ! blkid "${DATA_DEV}" >/dev/null 2>&1; then
  mkfs.ext4 -F "${DATA_DEV}"
fi
mkdir -p "${DATA_MOUNT}"
DATA_UUID=$(blkid -s UUID -o value "${DATA_DEV}")
if ! grep -q "${DATA_UUID}" /etc/fstab; then
  echo "UUID=${DATA_UUID} ${DATA_MOUNT} ext4 defaults 0 2" >> /etc/fstab
fi
mountpoint -q "${DATA_MOUNT}" || mount "${DATA_MOUNT}"

echo "== ${SWAP_SIZE_GB}G swap file =="
if [ ! -f "${SWAP_FILE}" ]; then
  fallocate -l "${SWAP_SIZE_GB}G" "${SWAP_FILE}"
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
  swapon "${SWAP_FILE}"
  grep -q "${SWAP_FILE}" /etc/fstab || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
fi

echo "== ufw (22, 80, 443 only) =="
apt-get install -yqq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban =="
apt-get install -yqq fail2ban
systemctl enable --now fail2ban

echo "== Docker Engine + compose plugin =="
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH=$(dpkg --print-architecture)
  CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -yqq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "== done =="
echo "Data volume: $(findmnt -no SOURCE,FSTYPE,SIZE ${DATA_MOUNT})"
echo "Swap: $(swapon --show)"
echo "Docker: $(docker --version)"
echo "ufw: $(ufw status | head -1)"
