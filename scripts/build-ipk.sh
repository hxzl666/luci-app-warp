#!/bin/sh
# Build luci-app-warp .ipk — manual tar packaging, no OpenWrt SDK needed.
# Works on any Linux with standard tar/gzip.
set -e

PKG_NAME=luci-app-warp
PKG_VERSION=4.2.1
PKG_RELEASE=1
ARCH=${ARCH:-all}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
BUILD_DIR=$(mktemp -d)
WORK_DIR=$(mktemp -d)
OUTPUT="${REPO_DIR}/${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_${ARCH}.ipk"

echo "Building $OUTPUT (arch=$ARCH) ..."

# 1. Prepare data directory
# root/etc -> BUILD_DIR/etc (config, init.d, etc.)
cp -r "$REPO_DIR/root/etc" "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/etc/warp"
# root/usr -> BUILD_DIR/usr (bin, share)
cp -r "$REPO_DIR/root/usr" "$BUILD_DIR/"
# htdocs -> BUILD_DIR/www (luci-static views)
cp -r "$REPO_DIR/htdocs" "$BUILD_DIR/www"

# 2. Set permissions
chmod 755 "$BUILD_DIR/etc/init.d/warp" "$BUILD_DIR/etc/init.d/warp-cron"
chmod 755 "$BUILD_DIR/usr/bin/warp-manager" "$BUILD_DIR/usr/bin/warp-log" "$BUILD_DIR/usr/bin/warp-update-china"
chmod 644 "$BUILD_DIR/etc/config/warp"
chmod 644 "$BUILD_DIR/usr/share/luci/menu.d/luci-app-warp.json"
chmod 644 "$BUILD_DIR/usr/share/rpcd/acl.d/luci-app-warp.json"
find "$BUILD_DIR/www" -name '*.js' -exec chmod 644 {} \;

# 3. Build data.tar.gz (write outside BUILD_DIR to avoid tar race)
DATA_TAR=/tmp/luci-app-warp-data.tar.gz
cd "$BUILD_DIR"
tar --numeric-owner --owner=0 --group=0 -czf "$DATA_TAR" .
INSTALLED_SIZE=$(find . -type f -exec wc -c {} + 2>/dev/null | awk '{s+=$1} END {print int(s/1024)}')

# 4. Prepare work directory
cp "$DATA_TAR" "$WORK_DIR/data.tar.gz"
echo "2.0" > "$WORK_DIR/debian-binary"

# 5. Write control file
cat > "$WORK_DIR/control" << EOF
Package: $PKG_NAME
Version: ${PKG_VERSION}-${PKG_RELEASE}
Architecture: $ARCH
Maintainer: hxzl666
Source: https://github.com/hxzl666/luci-app-warp
Installed-Size: $INSTALLED_SIZE
Depends: luci-base, jsonfilter, ca-bundle, jq
Description: LuCI support for Cloudflare WARP (MASQUE via usque).
 Transparent proxy with TPROXY + ipt2socks + dns2socks for DNS leak protection.
 Supports OpenClash bypass, China IP list, and multiple proxy modes.
EOF

# 6. Build control.tar.gz (control must be in tar root!)
cd "$WORK_DIR"
tar --numeric-owner --owner=0 --group=0 -czf control.tar.gz control

# 7. Build ipk (outer gzip tar)
tar --numeric-owner --owner=0 --group=0 -czf "$OUTPUT" ./debian-binary ./control.tar.gz ./data.tar.gz

echo "Done: $OUTPUT ($(stat --format=%s "$OUTPUT" 2>/dev/null || wc -c < "$OUTPUT") bytes)"

# Verify
echo "--- Verification ---"
tar tzf "$OUTPUT"
echo "debian-binary: $(tar xOzf "$OUTPUT" ./debian-binary)"
echo "control:"
tar xOzf "$OUTPUT" ./control.tar.gz | tar xOz control | head -5

rm -rf "$BUILD_DIR" "$WORK_DIR" "$DATA_TAR"
