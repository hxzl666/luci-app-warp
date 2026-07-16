#!/bin/sh
# Cloudflare WARP 核心一键安装脚本，改用 sing-box (WireGuard)
# SPDX-License-Identifier: GPL-3.0-or-later

set -eu

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/hxzlplp7/luci-app-warp/main}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
	printf '%b\n' "${BLUE}==>${NC} $*"
}

ok() {
	printf '%b\n' "${GREEN}OK:${NC} $*"
}

warn() {
	printf '%b\n' "${YELLOW}WARN:${NC} $*"
}

die() {
	printf '%b\n' "${RED}ERROR:${NC} $*" >&2
	exit 1
}

download() {
	url="$1"
	dest="$2"

	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 15 --retry 2 "$url" -o "$dest"
	elif command -v wget >/dev/null 2>&1; then
		wget -O "$dest" "$url"
	else
		die "curl or wget is required"
	fi
}

check_system() {
	[ "$(id -u)" = "0" ] || die "run this installer as root"
	[ -f /etc/openwrt_release ] || die "this installer only supports OpenWrt"

	. /etc/openwrt_release
	ok "detected ${DISTRIB_DESCRIPTION:-OpenWrt}"
}

# 查找已安装的 sing-box
find_singbox() {
	if command -v sing-box >/dev/null 2>&1; then
		command -v sing-box
		return 0
	fi
	for path in "/usr/bin/sing-box" "/usr/sbin/sing-box" "/usr/local/bin/sing-box" "/usr/share/singbox/sing-box"; do
		if [ -x "$path" ]; then
			echo "$path"
			return 0
		fi
	done
	return 1
}

# 检查 PassWall 状态以用于后续说明
check_passwall() {
	if [ -f "/etc/config/passwall" ] || [ -f "/etc/config/passwall_dev" ]; then
		ok "Detected PassWall installation. You can configure warp to use PassWall local SOCKS5 port (e.g. 1081) as parent proxy later."
	fi
}

install_opkg_packages() {
	log "installing OpenWrt packages"
	if ! opkg update; then
		warn "opkg update reported errors; continuing with the package lists that are available"
	fi

	install_opkg_package luci-base
	install_opkg_package ca-bundle
	install_opkg_package jsonfilter
	install_opkg_package unzip
	install_opkg_package curl optional || \
		warn "curl was not installed; WARP connection test commands may be unavailable"

	install_opkg_package kmod-nft-tproxy optional || \
		warn "kmod-nft-tproxy was not installed; global transparent proxy mode may be unavailable"
}

opkg_package_installed() {
	opkg status "$1" 2>/dev/null | grep -q "^Status: .* installed"
}

install_opkg_package() {
	pkg="$1"
	mode="${2:-required}"

	if opkg_package_installed "$pkg"; then
		return 0
	fi

	if opkg install "$pkg" >/dev/null; then
		return 0
	fi

	if [ "$mode" = "optional" ]; then
		return 1
	fi
	die "failed to install required package: $pkg"
}

# 安装 sing-box 及其所需的依赖
install_dependencies() {
	# 1. 自动安装 jq 以合并配置
	log "Installing jq dependency..."
	install_opkg_package jq || warn "jq was not installed; please install it manually via opkg"

	# 2. 检测并复用 sing-box
	if find_singbox >/dev/null; then
		ok "sing-box binary is already installed at $(find_singbox). Reusing existing core."
	else
		log "sing-box not found. Trying to install via opkg..."
		if ! install_opkg_package sing-box optional; then
			if ! install_opkg_package sing-box-non-geoip optional; then
				warn "Failed to install sing-box via opkg. You must install/download sing-box binary manually."
			else
				ok "sing-box-non-geoip successfully installed."
			fi
		else
			ok "sing-box successfully installed."
		fi
	fi

	# 3. 检测并安装 ipt2socks
	if command -v ipt2socks >/dev/null 2>&1 || [ -x "/usr/bin/ipt2socks" ]; then
		ok "ipt2socks is already installed"
	else
		log "ipt2socks not found. Trying to install via opkg..."
		if ! install_opkg_package ipt2socks optional; then
			warn "Failed to install ipt2socks via opkg. You may need to compile/download ipt2socks manually."
		else
			ok "ipt2socks successfully installed."
		fi
	fi
}

install_app() {
	log "installing luci-app-warp files"

	mkdir -p /etc/warp
	mkdir -p /etc/config
	mkdir -p /etc/init.d
	mkdir -p /usr/bin
	mkdir -p /usr/share/luci/menu.d
	mkdir -p /usr/share/rpcd/acl.d
	mkdir -p /www/luci-static/resources/view/warp

	download "$REPO_RAW/root/usr/bin/warp-manager" /usr/bin/warp-manager
	download "$REPO_RAW/root/usr/bin/warp-update-china" /usr/bin/warp-update-china
	download "$REPO_RAW/root/usr/bin/warp-log" /usr/bin/warp-log
	download "$REPO_RAW/root/etc/init.d/warp" /etc/init.d/warp
	download "$REPO_RAW/root/etc/init.d/warp-cron" /etc/init.d/warp-cron

	if [ ! -f /etc/config/warp ]; then
		download "$REPO_RAW/root/etc/config/warp" /etc/config/warp
	else
		warn "kept existing /etc/config/warp"
	fi

	download "$REPO_RAW/root/usr/share/luci/menu.d/luci-app-warp.json" /usr/share/luci/menu.d/luci-app-warp.json
	download "$REPO_RAW/root/usr/share/rpcd/acl.d/luci-app-warp.json" /usr/share/rpcd/acl.d/luci-app-warp.json
	download "$REPO_RAW/htdocs/luci-static/resources/view/warp/status.js" /www/luci-static/resources/view/warp/status.js
	download "$REPO_RAW/htdocs/luci-static/resources/view/warp/settings.js" /www/luci-static/resources/view/warp/settings.js
	download "$REPO_RAW/htdocs/luci-static/resources/view/warp/log.js" /www/luci-static/resources/view/warp/log.js

	chmod 0755 /usr/bin/warp-manager /usr/bin/warp-update-china /usr/bin/warp-log
	chmod 0755 /etc/init.d/warp /etc/init.d/warp-cron

	/etc/init.d/warp enable >/dev/null 2>&1 || true
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
	/etc/init.d/rpcd restart >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

	ok "luci-app-warp files installed"
}

register_account() {
	[ -t 0 ] || {
		warn "skipping interactive registration because stdin is not a terminal"
		return
	}

	printf 'Register a WARP account now? [y/N] '
	read -r choice
	case "$choice" in
		y|Y|yes|YES)
			/usr/bin/warp-manager register
			;;
		*)
			warn "skipped registration; run 'warp-manager register' later"
			;;
	esac
}

main() {
	check_system
	install_opkg_packages
	install_dependencies
	check_passwall
	install_app
	register_account

	printf '\n%b\n' "${GREEN}Installation complete.${NC}"
	printf '%s\n' "LuCI: Services -> Cloudflare WARP"
	printf '%s\n' "CLI : warp-manager register && /etc/init.d/warp start"
}

main "$@"
