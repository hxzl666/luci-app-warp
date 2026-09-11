# luci-app-warp

Cloudflare WARP LuCI 插件，使用 usque (MASQUE 协议) 承载 WARP 出站流量。

## 功能

- **MASQUE 协议** — 基于 usque v4.2.1 的 Cloudflare WARP MASQUE (HTTP/3 over QUIC) 代理
- **透明代理** — TPROXY + ipt2socks + dns2socks 全流量劫持，DNS 防泄露
- **LuCI 管理界面** — 状态/设置/日志三页，支持自动注册 WARP 账号
- **OpenClash 兼容** — 自动绕过 OpenClash 端口，互不干扰
- **中国 IP 列表** — 智能分流，国内流量直连
- **多种代理模式** — SOCKS / HTTP / 透明代理三种模式
- **运行时自动下载 usque** — 无需预装二进制，首次启用时自动从 GitHub 下载

## 支持平台

| 格式 | OpenWrt 版本 | 架构 | 安装方式 |
|------|-------------|------|---------|
| `.ipk` | 24.x | all | `opkg install luci-app-warp*.ipk` |
| `.apk` | 25.x | aarch64_cortex-a53 | `apk --allow-untrusted add luci-app-warp*.apk` |

## 安装

### 从源码构建 (ipk)

```sh
git clone https://github.com/hxzl666/luci-app-warp.git
cd luci-app-warp
./scripts/build-ipk.sh
# 产物: luci-app-warp_4.2.1-1_all.ipk
```

### 从源码构建 (apk, 需 Alpine 容器)

```sh
docker run --rm -v "$PWD:/repo" -w /repo alpine:3.20 sh scripts/build-apk.sh
# 产物: luci-app-warp_4.2.1-1_aarch64_cortex-a53.apk
```

### 使用 OpenWrt 构建树

```sh
# 将仓库复制到 feeds/luci/modules/
./scripts/feeds install -a
make package/luci-app-warp/compile -j$(nproc)
```

## 使用

1. LuCI → 服务 → Cloudflare WARP → 设置
2. 点击「注册」获取 WARP 账号（自动调用 usque register）
3. 选择代理模式（推荐：透明代理）
4. 点击「保存并应用」启动服务

## 依赖

- `luci-base` `jsonfilter` `ca-bundle` `jq`
- 运行时: `usque` (自动从 GitHub 下载，无需预装)
- 透明代理模式额外需要: `ipt2socks` `dns2socks`

## 架构

```
luci-app-warp/
├── Makefile                          # OpenWrt BuildPackage 规则
├── root/
│   ├── etc/
│   │   ├── config/warp               # UCI 配置模板
│   │   └── init.d/
│   │       ├── warp                  # procd 主服务 (usque + TPROXY)
│   │       └── warp-cron             # 定时任务
│   └── usr/
│       ├── bin/
│       │   ├── warp-manager          # 核心管理脚本
│       │   ├── warp-log              # 日志查看
│       │   └── warp-update-china     # 中国 IP 列表更新
│       └── share/
│           ├── luci/menu.d/          # LuCI 菜单 (服务 → WARP)
│           └── rpcd/acl.d/           # rpcd ACL
├── htdocs/luci-static/resources/view/
│   └── warp/
│       ├── status.js                 # 状态页
│       ├── settings.js               # 设置页
│       └── log.js                    # 日志页
└── scripts/
    ├── build-ipk.sh                  # 手动 ipk 打包
    └── build-apk.sh                  # apk 打包
```

## License

GPL-3.0-or-later
