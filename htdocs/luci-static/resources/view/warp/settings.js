'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

return view.extend({
    // 加载配置和依赖环境检查
    load: function () {
        return Promise.all([
            uci.load('warp'),
            L.resolveDefault(fs.exec('/bin/netstat', ['-tln']), { stdout: '' }),
            L.resolveDefault(fs.stat('/etc/warp/reg.json'), null),
            // 检测是否安装了 PassWall 或 PassWall 2 插件
            L.resolveDefault(fs.stat('/etc/config/passwall'), null),
            L.resolveDefault(fs.stat('/etc/config/passwall_dev'), null)
        ]);
    },

    render: function (data) {
        var netstatOutput = data[1].stdout || '';
        var accountExists = data[2] !== null;
        var hasPasswall = data[3] !== null || data[4] !== null;
        
        var socksPort = uci.get('warp', 'config', 'socks_port') || '1080';
        var httpPort = uci.get('warp', 'config', 'http_port') || '8118';

        var m, s, o;

        m = new form.Map('warp', _('Cloudflare WARP'),
            _('Cloudflare WARP 是一个免费的VPN服务，本插件已切换为通过 sing-box (WireGuard) 实现，支持前置代理。'));

        // 状态显示区域
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

        o = s.option(form.Value, 'endpoint', _('服务器地址'));
        o.placeholder = '162.159.193.1:2408';
        o.rmempty = true;
        o.description = _('自定义 WARP 服务器端点地址和端口 (例如: 162.159.193.1:2408)。如留空，将自动使用默认端点。');

        // 前置代理设置
        s = m.section(form.NamedSection, 'config', 'warp', _('前置代理设置'));
        s.anonymous = true;

        o = s.option(form.Flag, 'proxy_enabled', _('启用前置代理'));
        o.default = '0';
        
        var proxyDesc = _('通过本地前置代理连接 WARP 端点，适合在国内无法直连 WARP 的环境。');
        if (hasPasswall) {
            proxyDesc += '<br/><strong style="color: #28a745;">' + _('检测到您的系统已安装 PassWall，推荐启用前置代理并将其设置为 PassWall 的 Socks5 本地代理（默认端口通常为 1081 或 1082）。') + '</strong>';
        }
        o.description = proxyDesc;

        o = s.option(form.ListValue, 'proxy_type', _('前置代理类型'));
        o.value('socks5', 'SOCKS5');
        o.value('http', 'HTTP');
        o.default = 'socks5';
        o.depends('proxy_enabled', '1');

        o = s.option(form.Value, 'proxy_addr', _('前置代理地址'));
        o.default = '127.0.0.1';
        o.depends('proxy_enabled', '1');

        o = s.option(form.Value, 'proxy_port', _('前置代理端口'));
        o.datatype = 'port';
        o.default = '1081';
        o.depends('proxy_enabled', '1');

        // 代理与接管设置
        s = m.section(form.NamedSection, 'config', 'warp', _('全局透明代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'global_proxy', _('全局代理'));
        o.default = '0';
        o.description = _('启用后，通过 nftables TPROXY 透明代理将所有局域网流量转发到 WARP。与 PassWall、OpenClash 等透明代理共存时必须关闭。');

        o = s.option(form.Flag, 'bypass_china', _('绕过中国大陆IP'));
        o.default = '0';
        o.description = _('仅在全局代理开启时有效。启用后，访问中国大陆IP将直连不走 WARP。');
        o.depends('global_proxy', '1');

        // SOCKS5 代理
        s = m.section(form.NamedSection, 'config', 'warp', _('SOCKS5 本地代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'socks_enabled', _('启用 SOCKS5 代理'));
        o.default = '1';
        o.description = _('在本地开启 SOCKS5 代理端口。注意：全局代理功能依赖 SOCKS5 代理。');

        o = s.option(form.Value, 'socks_port', _('SOCKS5 端口'));
        o.datatype = 'port';
        o.default = '1080';
        o.depends('socks_enabled', '1');

        // HTTP 代理
        s = m.section(form.NamedSection, 'config', 'warp', _('HTTP 本地代理'));
        s.anonymous = true;

        o = s.option(form.Flag, 'http_enabled', _('启用 HTTP 代理'));
        o.default = '0';
        o.description = _('在本地开启 HTTP 代理端口。');

        o = s.option(form.Value, 'http_port', _('HTTP 端口'));
        o.datatype = 'port';
        o.default = '8118';
        o.depends('http_enabled', '1');

        return m.render();
    }
});
