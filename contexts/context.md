# 项目核心上下文

## 1. 项目概述
- **项目名称**: `luci-app-warp`
- **项目类型**: OpenWrt LuCI 插件 (LuCI2 接口，基于 JavaScript)
- **原始功能**: 使用官方 `cloudflare-warp` 客户端连接 Cloudflare WARP 节点，并通过 `ipt2socks` 与 `nftables` 提供全局透明代理服务。
- **目标功能**:
  1. 替换核心引擎，改用 `sing-box` 的 `wireguard` 模块进行出站，剔除原有的官方客户端二进制文件依赖。
  2. WARP 配置信息通过 `https://warp.xijp.eu.org` 动态获取（私钥、IPv6 地址、reserved 数组）。
  3. 支持前置代理（即通过本机的 SOCKS5 或 HTTP 代理中转 WARP 出站，以保障在国内的连通性）。
  4. 检查是否安装了 PassWall 等代理插件。如果系统中已经有 `sing-box`，则做到核心复用，不要重复下载。
  5. 记住不要删除已有的 `sing-box` 配置文件，以增量方式更新或添加 warp 模块出站。

## 2. 关键路径与设计
- **设置配置**: `/etc/config/warp`
- **服务控制**: `/etc/init.d/warp`
- **后台管理**: `/usr/bin/warp-manager`
- **前端页面**:
  - `status.js` (状态与管理操作)
  - `settings.js` (基础与前置代理配置)
- **更新脚本**: `/usr/bin/warp-update-china` (中国 IP 列表更新)
