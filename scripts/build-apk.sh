#!/bin/sh
# Build luci-app-warp .apk (OpenWrt 25.x) — requires apk-tools.
# Best run inside Alpine container: docker run --rm -v $PWD:/repo -w /repo alpine:3.20 sh scripts/build-apk.sh
# Or set APK_BIN=/path/to/apk on any system with apk-tools.
set -e

PKG_NAME=luci-app-warp
PKG_VERSION=4.2.1-r1
ARCH=${APK_ARCH:-${ARCH:-aarch64_cortex-a53}}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
PKG_ROOT=$(mktemp -d)
OUTPUT="${REPO_DIR}/${PKG_NAME}_${PKG_VERSION}_${ARCH}.apk"

echo "Building $OUTPUT (arch=$ARCH) ..."

# Check mkpkg availability (support both standalone mkpkg and apk mkpkg)
if command -v mkpkg >/dev/null 2>&1; then
    MKGPKG_CMD="mkpkg"
elif command -v apk >/dev/null 2>&1; then
    MKGPKG_CMD="apk mkpkg"
else
    echo "ERROR: neither 'mkpkg' nor 'apk mkpkg' found. Install apk-tools."
    exit 1
fi
# Verify mkpkg works (without args it should error with "required info field")
$MKGPKG_CMD 2>&1 | grep -q "required info field\|Usage\|invalid" || { echo "ERROR: mkpkg not functional."; exit 1; }

# 1. Prepare package root
cp -r "$REPO_DIR/root/etc" "$PKG_ROOT/"
mkdir -p "$PKG_ROOT/etc/warp"
cp -r "$REPO_DIR/root/usr" "$PKG_ROOT/"
cp -r "$REPO_DIR/htdocs" "$PKG_ROOT/www"

# 2. Set permissions
chmod 755 "$PKG_ROOT/etc/init.d/warp" "$PKG_ROOT/etc/init.d/warp-cron"
chmod 755 "$PKG_ROOT/usr/bin/warp-manager" "$PKG_ROOT/usr/bin/warp-log" "$PKG_ROOT/usr/bin/warp-update-china"
chmod 644 "$PKG_ROOT/etc/config/warp"
chmod 644 "$PKG_ROOT/usr/share/luci/menu.d/luci-app-warp.json"
chmod 644 "$PKG_ROOT/usr/share/rpcd/acl.d/luci-app-warp.json"
find "$PKG_ROOT/www" -name '*.js' -exec chmod 644 {} \;

# 3. Generate file list
cd "$PKG_ROOT"
mkdir -p lib/apk/packages
find . -type f -not -path './lib/apk/packages/*' -printf "/%P\n" | sort > "lib/apk/packages/$PKG_NAME.list"

# 4. Create post-install script
cat > /tmp/post-install.sh << 'POSTINSTALL'
#!/bin/sh
chmod 755 /etc/init.d/warp /etc/init.d/warp-cron 2>/dev/null || true
chmod 755 /usr/bin/warp-manager /usr/bin/warp-log /usr/bin/warp-update-china 2>/dev/null || true
chmod 644 /etc/config/warp 2>/dev/null || true
chmod 644 /usr/share/luci/menu.d/luci-app-warp.json 2>/dev/null || true
chmod 644 /usr/share/rpcd/acl.d/luci-app-warp.json 2>/dev/null || true
find /www/luci-static/resources/view/warp -name '*.js' -exec chmod 644 {} \; 2>/dev/null || true
POSTINSTALL
chmod 755 /tmp/post-install.sh

# 5. Build apk
$MKGPKG_CMD \
  --info "name:$PKG_NAME" \
  --info "version:$PKG_VERSION" \
  --info "description:LuCI support for Cloudflare WARP (MASQUE via usque)" \
  --info "arch:$ARCH" \
  --info "license:GPL-3.0-or-later" \
  --info "depends:libc luci-base jsonfilter ca-bundle jq" \
  --info "provides:$PKG_NAME-any" \
  --info "tags:openwrt:section=luci" \
  --script "post-install:/tmp/post-install.sh" \
  --files "$PKG_ROOT" \
  --output "$OUTPUT"

echo "Done: $OUTPUT"
ls -la "$OUTPUT"

rm -rf "$PKG_ROOT" /tmp/post-install.sh
