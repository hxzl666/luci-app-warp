# luci-app-warp

[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![OpenWrt](https://img.shields.io/badge/OpenWrt-22.03%2B-green.svg)](https://openwrt.org/)

OpenWrt 平台的 Cloudflare WARP LuCI 管理界面，改用 `sing-box` (WireGuard 协议出站) 接入 Cloudflare 网络，支持前置代理中转，并配合 `nftables` 与 `ipt2socks` 实现 TPROXY 全局透明代理。

## ✨ 功能特性

- 🚀 **一键安装** - 自动安装所有依赖，检测并智能复用系统已有的核心
- 🔐 **免注册客户端** - 自动从 `warp.xijp.eu.org` 动态注册并提取凭据（私钥、IPv6 和 reserved）
- 🧲 **前置代理** - 支持通过本地 SOCKS5 或 HTTP 代理（例如 PassWall 插件提供的本地中转端口）中转 WARP 握手与数据流量，解决国内直连困难的问题
- 🔄 **核心复用** - 自动查找并复用系统已有 `sing-box`，无须重复下载；对 `>= 1.11` (endpoints 节点) 和 `< 1.11` (outbounds 节点) 版本的 `sing-box` 配置格式进行自动兼容
- 🌍 **全局代理** - 支持基于 `nftables` 和 `ipt2socks` 的 TPROXY 透明全局代理接管
- 🇨🇳 **绕过中国IP** - 支持原生 `nftables` set 绕过中国大陆 IP，优化国内访问速度
- 🔑 **增量修改** - 更改配置时不抹除 `/etc/warp/sing-box.json` 中用户手动添加的其它节点/出站

## 📦 依赖

- OpenWrt 22.03 或更高版本 (需要 nftables / firewall4 支持)
- `sing-box` (或者 `sing-box-non-geoip`)
- `ipt2socks` (用于 TPROXY 透明转发)
- `jq` (用于解析与合并 JSON 配置文件)
- `jsonfilter`
- `ca-bundle`
- `kmod-nft-tproxy` (开启全局透明代理需要)

## 🛠️ 本地打包

如果您是在 Windows 或其它非 OpenWrt 编译环境下开发，可以使用项目根目录下的 `build_ipk.py` 辅助脚本，直接在本地生成符合 Unix 权限标准的安装包：

```bash
python build_ipk.py
```
这会在当前目录下输出 `luci-app-warp_0.0.1_all.ipk`。您可直接将此安装包上传至 OpenWrt 路由器执行 `opkg install` 进行安装。

## 🚀 安装指南

### 方法一：一键安装脚本

```bash
wget -O- https://raw.githubusercontent.com/hxzlplp7/luci-app-warp/main/install.sh | sh
```
*脚本会自动运行 `opkg` 安装 `jq`、`sing-box`、`ipt2socks`。如检测到系统已通过 PassWall 等插件安装了 `sing-box`，则会自动复用而不会重复下载。*

### 方法二：手动安装

1. **安装系统依赖**

```bash
opkg update
opkg install luci-base jsonfilter ca-bundle kmod-nft-tproxy ipt2socks jq
# 检查是否已安装 sing-box，如无则安装：
opkg install sing-box || opkg install sing-box-non-geoip
```

2. **部署插件文件**

```bash
# 克隆仓库
git clone https://github.com/hxzlplp7/luci-app-warp.git /tmp/luci-app-warp

# 复制文件到对应系统目录
cp -r /tmp/luci-app-warp/root/* /
cp -r /tmp/luci-app-warp/htdocs/* /www/

# 赋予脚本执行权限
chmod +x /usr/bin/warp-manager
chmod +x /usr/bin/warp-update-china
chmod +x /usr/bin/warp-log
chmod +x /etc/init.d/warp
chmod +x /etc/init.d/warp-cron

# 启用服务并重置 LuCI 缓存
/etc/init.d/warp enable
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
```

## 📖 使用说明

### Web 界面 (LuCI)

1. 打开路由器管理界面，导航到 **服务 → Cloudflare WARP**。
2. 在 **状态** 页面点击 **注册账户**。系统将自动调用接口生成私钥、IPv6 及 reserved 值并存入配置。
3. 如果您在国内直连 WARP 节点遇到握手失败、延迟高的情况，可前往 **设置** 页面：
   - 勾选 **启用前置代理**。
   - 输入您已有的本地代理端口（例如 PassWall 的默认 SOCKS5 本地端口 `1081` 或 `1082`）。
4. 在 **状态** 页面点击 **启动** 开始使用。
5. 点击 **测试连接**，若 WARP 状态显示 `on` 或 `plus`，说明连接成功。

### 命令行管理 (`warp-manager`)

```bash
# 注册/申请 WARP 凭据并保存
warp-manager register

# 启动 WARP 代理服务
warp-manager start

# 停止 WARP 代理服务
warp-manager stop

# 重启 WARP 代理服务
warp-manager restart

# 查看当前运行及账户状态
warp-manager status

# 测试连通性及获取出口 IP 信息
warp-manager test

# 重置并清除所有注册账户及配置
warp-manager reset

# 导出当前 sing-box.json 配置文件
warp-manager export
```

## ⚙️ 配置选项 (`/etc/config/warp`)

以下是关键的配置参数：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `enabled` | 是否启用 WARP | `0` |
| `endpoint` | WARP 服务器 Endpoint (格式 `IP:端口`) | 空 (自动使用优选 Endpoint) |
| `proxy_enabled` | 是否启用前置代理中转 | `0` |
| `proxy_type` | 前置代理协议类型 (`socks5` / `http`) | `socks5` |
| `proxy_addr` | 前置代理本地 IP 地址 | `127.0.0.1` |
| `proxy_port` | 前置代理本地监听端口 | `1081` |
| `socks_enabled` | 是否启用本地 SOCKS5 代理端口 | `1` |
| `socks_port` | SOCKS5 本地代理端口 | `1080` |
| `http_enabled` | 是否启用本地 HTTP 代理端口 | `0` |
| `http_port` | HTTP 本地代理端口 | `8118` |
| `global_proxy` | 是否开启 nftables TPROXY 全局代理 | `0` |
| `bypass_china` | 开启全局代理时，是否绕过中国大陆 IP | `0` |

### 示例配置

```uci
config warp 'config'
	option enabled '1'
	option endpoint '162.159.193.1:2408'
	option proxy_enabled '1'
	option proxy_type 'socks5'
	option proxy_addr '127.0.0.1'
	option proxy_port '1081'
	option socks_enabled '1'
	option socks_port '1080'
	option global_proxy '1'
	option bypass_china '1'
```

## ❓ 常见问题

### Q: 注册失败怎么办？
A: 请确保您的路由器能正常连接外网。若因为网络阻断无法注册，请先尝试在已有的科学上网插件中启用本地 SOCKS5 代理，然后手动把临时凭据或前置代理信息配置后再尝试。

### Q: 为什么全局代理开启后无法访问网络？
A: 
1. 检查是否安装了 `kmod-nft-tproxy`，并且系统内核支持 TPROXY。
2. 检查您的防火墙是否为 `firewall4` (nftables)。
3. 如果您同时开启了 OpenClash 或 PassWall 的全局透明代理，会导致 nftables 规则发生严重冲突，**强烈建议不要同时开启多个全局代理服务**。若要与它们共存，请关闭本插件的“全局代理”，只将本插件作为本地的 SOCKS5 代理（如 `127.0.0.1:1080`），然后在 PassWall/OpenClash 中将该端口作为一个 Socks5 节点添加使用。

## 🙏 致谢

- [Cloudflare WARP](https://1.1.1.1/) - 免费的安全加速网络
- [sing-box](https://github.com/SagerNet/sing-box) - 通用的网络代理平台
- [ipt2socks](https://github.com/zfl9/ipt2socks) - 轻量高效的透明代理桥接工具
- [甬哥侃侃侃 (yonggekkk)](https://github.com/yonggekkk) - WARP 注册 API 与脚本思路参考

## 📄 许可证

本项目基于 [GPL-3.0](LICENSE) 开源许可证。
