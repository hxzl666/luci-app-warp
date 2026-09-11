'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('warp'),
            L.resolveDefault(fs.exec('/bin/netstat', ['-tln']), { stdout: '' }),
            L.resolveDefault(fs.stat('/etc/warp/config.json'), null)
        ]);
    },

    render: function (data) {
        var netstatOutput = data[1].stdout || '';
        var accountExists = data[2] !== null;

        var socksPort = uci.get('warp', 'config', 'socks_port') || '1080';
        var httpPort = uci.get('warp', 'config', 'http_port') || '8118';

        var m, s, o;

        m = new form.Map('warp', _('Cloudflare WARP (MASQUE)'),
            _('Cloudflare WARP 是一个免费的VPN服务，本插件通过 usque (MASQUE 协议) 实现，支持 SOCKS5/HTTP 代理和透明代理。'));

        // 运行状态显示
        s = m.section(form.NamedSection, 'config', 'warp', _('运行状态'));
        s.anonymous = true;

        o = s.option(form.DummyValue, '_status', _('服务状态'));
        o.rawhtml = true;
        o.cfgvalue = function () {
            var isRunning = netstatOutput.indexOf(':' + socksPort + ' ') !== -1 || netstatOutput.indexOf(':' + httpPort + ' ') !== -1;

            var status = '<span style="color: ' + (isRunning ? '#28a745' : '#dc3545') + '; font-weight: bold;">';
            status += isRunning ? '✓ 运行中' : '✗ 已停止';
            status += '</span>';

            return status;
        };

        o = s.option(form.DummyValue, '_account', _('账户状态'));
        o.rawhtml = true;
        o.cfgvalue = function () {
            return accountExists
                ? '<span style="color: #28a745; font-weight: bold;">✓ 已注册</span>'
                : '<span style="color: #ffc107; font-weight: bold;">⚠ 未注册</span>';
        };

        // 基本设置
        s = m.section(form.NamedSection, 'config', 'warp', _('基本设置'));
        s.anonymous = true;

        o = s.option(form.Flag, 'enabled', _('启用'));
        o.rmempty = false;
        o.default = '0';

        o = s.option(form.ListValue, 'mode', _('运行模式'));
        o.value('socks', 'SOCKS5 代理');
        o.value('http-proxy', 'HTTP 代理');
        o.value('nativetun', '原生隧道 (透明代理)');
        o.default = 'socks';
        o.description = _('选择 WARP 的运行模式。SOCKS5/HTTP 模式仅提供本地代理端口，原生隧道模式将创建虚拟网卡实现透明代理。');

        o = s.option(form.Value, 'license_key', _('WARP+ 许可证密钥'));
        o.password = true;
        o.rmempty = true;
        o.description = _('可选。填入 WARP+ 许可证密钥以启用 WARP+ 功能。留空则使用免费版 WARP。');

        o = s.option(form.Value, 'mtu', _('MTU'));
        o.datatype = 'uinteger';
        o.default = '1280';
        o.rmempty = false;
        o.description = _('MASQUE 隧道的最大传输单元 (MTU)。');

        o = s.option(form.Flag, 'ipv6', _('启用 IPv6'));
        o.default = '0';
        o.description = _('启用后，MASQUE 隧道将支持 IPv6 流量。');

        o = s.option(form.Flag, 'http2', _('启用 HTTP/2'));
        o.default = '0';
        o.description = _('启用 HTTP/2 多路复用，可提升 MASQUE 连接性能。');

        o = s.option(form.Value, 'sni', _('SNI'));
        o.placeholder = 'cloudflare-quake.com';
        o.rmempty = true;
        o.description = _('MASQUE 连接的 TLS SNI (Server Name Indication)。留空使用默认值。');

        o = s.option(form.Value, 'connect_port', _('连接端口'));
        o.datatype = 'port';
        o.default = '443';
        o.rmempty = false;
        o.description = _('MASQUE 连接 Cloudflare 的目标端口。');

        o = s.option(form.Flag, 'always_reconnect', _('自动重连'));
        o.default = '1';
        o.description = _('连接断开后自动重连。');

        o = s.option(form.Flag, 'insecure', _('跳过证书验证'));
        o.default = '0';
        o.description = _('跳过 TLS 证书验证 (不推荐，仅用于调试)。');

        // SOCKS5 认证
        s = m.section(form.NamedSection, 'config', 'warp', _('SOCKS5 认证'));
        s.anonymous = true;

        o = s.option(form.Value, 'username', _('用户名'));
        o.rmempty = true;
        o.description = _('SOCKS5 代理的用户名认证 (可选)。');

        o = s.option(form.Value, 'password', _('密码'));
        o.password = true;
        o.rmempty = true;
        o.description = _('SOCKS5 代理的密码认证 (可选)。');

        // SOCKS5 本地代理
        s = m.section(form.NamedSection, 'config', 'warp', _('SOCKS5 本地代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'socks_enabled', _('启用 SOCKS5 代理'));
        o.default = '1';
        o.description = _('在本地开启 SOCKS5 代理端口。');

        o = s.option(form.Value, 'socks_port', _('SOCKS5 端口'));
        o.datatype = 'port';
        o.default = '1080';
        o.depends('socks_enabled', '1');

        // HTTP 本地代理
        s = m.section(form.NamedSection, 'config', 'warp', _('HTTP 本地代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'http_enabled', _('启用 HTTP 代理'));
        o.default = '0';
        o.description = _('在本地开启 HTTP 代理端口。');

        o = s.option(form.Value, 'http_port', _('HTTP 端口'));
        o.datatype = 'port';
        o.default = '8118';
        o.depends('http_enabled', '1');

        // 全局透明代理
        s = m.section(form.NamedSection, 'config', 'warp', _('全局透明代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'global_proxy', _('全局代理'));
        o.default = '0';
        o.description = _('启用后，自动切换到 TUN 模式，usque 创建虚拟网卡接管全部流量，无需 ipt2socks/dns2socks。与其它透明代理同时使用时必须关闭。');

        o = s.option(form.Flag, 'bypass_china', _('绕过中国大陆IP'));
        o.default = '0';
        o.description = _('仅在全局代理开启时有效。启用后，访问中国大陆IP将直连不走 WARP。');
        o.depends('global_proxy', '1');

        return m.render();
    }
});