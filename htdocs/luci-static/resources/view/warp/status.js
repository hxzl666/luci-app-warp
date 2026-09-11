'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require poll';
'require rpc';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('warp'),
            L.resolveDefault(callServiceList('warp'), {}),
            L.resolveDefault(fs.stat('/etc/warp/config.json'), null),
            L.resolveDefault(fs.exec('/bin/netstat', ['-tln']), { stdout: '' })
        ]);
    },

    pollStatus: function () {
        return Promise.all([
            L.resolveDefault(callServiceList('warp'), {}),
            L.resolveDefault(fs.stat('/etc/warp/config.json'), null),
            L.resolveDefault(fs.exec('/bin/netstat', ['-tln']), { stdout: '' })
        ]).then(L.bind(function (data) {
            this.updateStatusDisplay(data);
        }, this));
    },

    serviceIsRunning: function (serviceData) {
        var service = serviceData ? serviceData.warp : null;
        var instances = service ? service.instances : null;

        if (!instances)
            return false;

        for (var name in instances) {
            if (instances[name] && instances[name].running)
                return true;
        }

        return false;
    },

    updateStatusDisplay: function (data) {
        var serviceData = data[0] || {};
        var accountExists = data[1] !== null;
        var netstatOutput = data[2].stdout || '';

        var isRunning = this.serviceIsRunning(serviceData);
        var mode = uci.get('warp', 'config', 'mode') || 'socks';
        var socksPort = uci.get('warp', 'config', 'socks_port') || '1080';
        var httpPort = uci.get('warp', 'config', 'http_port') || '8118';

        var socksRunning = netstatOutput.indexOf(':' + socksPort) !== -1;
        var httpRunning = netstatOutput.indexOf(':' + httpPort) !== -1;

        var modeNames = {
            'socks': 'SOCKS5 代理',
            'http-proxy': 'HTTP 代理',
            'nativetun': '原生隧道'
        };
        var modeDisplay = modeNames[mode] || mode;

        var statusEl = document.getElementById('warp-status');
        var modeEl = document.getElementById('warp-mode');
        var accountEl = document.getElementById('warp-account');
        var socksEl = document.getElementById('warp-socks');
        var httpEl = document.getElementById('warp-http');

        if (statusEl) {
            statusEl.innerHTML = isRunning
                ? '<span class="badge success">运行中</span>'
                : '<span class="badge error">已停止</span>';
        }

        if (modeEl) {
            modeEl.innerHTML = '<span class="badge info">' + modeDisplay + '</span>';
        }

        if (accountEl) {
            accountEl.innerHTML = accountExists
                ? '<span class="badge success">已注册</span>'
                : '<span class="badge warning">未注册</span>';
        }

        if (socksEl) {
            socksEl.innerHTML = socksRunning
                ? '<span class="badge success">运行中 (端口 ' + socksPort + ')</span>'
                : '<span class="badge warning">未启动</span>';
        }

        if (httpEl) {
            httpEl.innerHTML = httpRunning
                ? '<span class="badge success">运行中 (端口 ' + httpPort + ')</span>'
                : '<span class="badge warning">未启动</span>';
        }
    },

    handleAction: function (action) {
        var self = this;

        if (action === 'reset') {
            if (!confirm(_('确定要重置所有 WARP 账户数据？此操作不可撤销。')))
                return;
        }

        var cmdMap = {
            'register': 'register',
            'start': 'start',
            'stop': 'stop',
            'restart': 'restart',
            'test': 'test',
            'reset': 'reset'
        };

        if (!cmdMap[action]) {
            ui.hideModal();
            return;
        }

        var isQuick = (action === 'start' || action === 'stop' || action === 'restart');
        var waitText = isQuick ? _('正在执行操作，请稍候...') :
                       action === 'test' ? _('正在测试 WARP 连接，可能需要 15 秒...') :
                       action === 'register' ? _('正在注册 WARP 账户...') :
                       _('正在重置账户数据...');

        ui.showModal(_('请稍候...'), [
            E('p', { 'class': 'spinning' }, _(waitText))
        ]);

        var logFile = '/tmp/warp_action_' + action + '.log';
        var doneFile = '/tmp/warp_action_' + action + '_done';

        /* Background the command: redirect all FDs so rpcd returns immediately,
           then poll for the done file. This prevents LuCI XHR timeout. */
        fs.exec('/bin/sh', ['-c',
            'rm -f ' + doneFile + ' ' + logFile + '; ' +
            '(/usr/bin/warp-manager ' + cmdMap[action] +
            ' > ' + logFile + ' 2>&1; echo $?) > ' + doneFile +
            ' < /dev/null > /dev/null 2>&1 &'
        ]);

        var attempts = 0;
        var maxAttempts = isQuick ? 10 : 40;
        var interval = isQuick ? 500 : 1000;

        var pollResult = function () {
            attempts++;

            return L.resolveDefault(fs.stat(doneFile), null).then(function (stat) {
                if (!stat) {
                    if (attempts < maxAttempts) {
                        /* Update modal text to show progress */
                        var dots = '.'.repeat(Math.min(attempts, 10));
                        var el = document.querySelector('.spinning');
                        if (el) {
                            el.textContent = waitText.replace('...', dots);
                        }
                        return new Promise(function (resolve) {
                            setTimeout(resolve, interval);
                        }).then(pollResult);
                    }

                    /* Timeout */
                    ui.hideModal();
                    ui.showModal(_('操作超时'), [
                        E('p', {}, _('操作未在预期时间内完成，请查看日志。')),
                        E('div', { 'class': 'right' }, [
                            E('button', { 'class': 'btn', 'click': ui.hideModal }, _('关闭'))
                        ])
                    ]);
                    fs.exec('/bin/rm', ['-f', logFile, doneFile]);
                    return;
                }

                /* Done — read exit code + log */
                return L.resolveDefault(fs.read(doneFile), '1').then(function (exitStr) {
                    var exitCode = parseInt(exitStr.trim(), 10) || 0;
                    return L.resolveDefault(fs.read(logFile), '').then(function (output) {
                        fs.exec('/bin/rm', ['-f', logFile, doneFile]);

                        if (exitCode !== 0) {
                            ui.hideModal();
                            ui.showModal(_('操作失败'), [
                                E('pre', { 'style': 'white-space: pre-wrap;' }, output || _('命令执行失败')),
                                E('div', { 'class': 'right' }, [
                                    E('button', { 'class': 'btn', 'click': ui.hideModal }, _('关闭'))
                                ])
                            ]);
                            return;
                        }

                        if (action === 'test') {
                            var warpStatus = output.match(/(?:warp=|WARP\s+Status:\s*)([^\n\r]+)/i);
                            var ip = output.match(/(?:ip=|Exit\s+IP:\s*)([^\n\r]+)/i);
                            var loc = output.match(/(?:loc=|Location:\s*)([^\n\r]+)/i);

                            var cleanVal = function (match) {
                                if (!match) return null;
                                return match[1].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
                            };

                            var statusStr = cleanVal(warpStatus);
                            var ipStr = cleanVal(ip);
                            var locStr = cleanVal(loc);

                            ui.hideModal();
                            ui.showModal(_('连接测试结果'), [
                                E('div', { 'class': 'cbi-section' }, [
                                    E('p', {}, [
                                        E('strong', {}, 'WARP 状态: '),
                                        statusStr ? statusStr : _('未知')
                                    ]),
                                    E('p', {}, [
                                        E('strong', {}, '出口 IP: '),
                                        ipStr ? ipStr : _('未知')
                                    ]),
                                    E('p', {}, [
                                        E('strong', {}, '位置: '),
                                        locStr ? locStr : _('未知')
                                    ])
                                ]),
                                E('div', { 'class': 'right' }, [
                                    E('button', { 'class': 'btn', 'click': ui.hideModal }, _('关闭'))
                                ])
                            ]);
                        } else {
                            ui.hideModal();
                            ui.addNotification(null, E('pre', { 'style': 'white-space: pre-wrap;' },
                                output || _('操作完成')), 'success');
                            return uci.load('warp').then(function () {
                                return self.pollStatus();
                            });
                        }
                    });
                });
            });
        };

        /* Start polling after a short delay */
        setTimeout(pollResult, isQuick ? 500 : 1000);
    },

    render: function (data) {
        var self = this;
        var serviceData = data[1] || {};
        var accountExists = data[2] !== null;
        var netstatOutput = data[3].stdout || '';

        var isRunning = this.serviceIsRunning(serviceData);
        var mode = uci.get('warp', 'config', 'mode') || 'socks';
        var socksPort = uci.get('warp', 'config', 'socks_port') || '1080';
        var httpPort = uci.get('warp', 'config', 'http_port') || '8118';

        var socksRunning = netstatOutput.indexOf(':' + socksPort) !== -1;
        var httpRunning = netstatOutput.indexOf(':' + httpPort) !== -1;

        var modeNames = {
            'socks': 'SOCKS5 代理',
            'http-proxy': 'HTTP 代理',
            'nativetun': '原生隧道'
        };
        var modeDisplay = modeNames[mode] || mode;

        poll.add(L.bind(this.pollStatus, this), 5);

        var view = E('div', { 'class': 'cbi-map' }, [
            E('style', {}, [
                '.warp-header { background: linear-gradient(135deg, #f48120 0%, #faae2b 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }',
                '.warp-header h2 { margin: 0; }',
                '.warp-header p { margin: 5px 0 0 0; opacity: 0.9; }',
                '.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; margin-bottom: 20px; }',
                '.status-card { background: #fff; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }',
                '.status-card h4 { margin: 0 0 10px 0; border-bottom: 2px solid #f48120; padding-bottom: 8px; }',
                '.status-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }',
                '.status-row:last-child { border-bottom: none; }',
                '.badge { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }',
                '.badge.success { background: #d4edda; color: #155724; }',
                '.badge.error { background: #f8d7da; color: #721c24; }',
                '.badge.warning { background: #fff3cd; color: #856404; }',
                '.badge.info { background: #d1ecf1; color: #0c5460; }',
                '.action-buttons { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }',
                '.action-buttons .btn { padding: 10px 20px; }'
            ].join('\n')),

            E('div', { 'class': 'warp-header' }, [
                E('h2', {}, 'Cloudflare WARP (MASQUE)'),
                E('p', {}, _('通过 usque MASQUE 协议加密您的网络流量，提供更快、更安全的互联网访问'))
            ]),

            E('div', { 'class': 'status-grid' }, [
                E('div', { 'class': 'status-card' }, [
                    E('h4', {}, '🔌 ' + _('连接状态')),
                    E('div', { 'class': 'status-row' }, [
                        E('span', {}, _('服务状态')),
                        E('span', { 'id': 'warp-status' },
                            isRunning ? E('span', { 'class': 'badge success' }, _('运行中'))
                                : E('span', { 'class': 'badge error' }, _('已停止')))
                    ]),
                    E('div', { 'class': 'status-row' }, [
                        E('span', {}, _('MASQUE 模式')),
                        E('span', { 'id': 'warp-mode' },
                            E('span', { 'class': 'badge info' }, modeDisplay))
                    ])
                ]),

                E('div', { 'class': 'status-card' }, [
                    E('h4', {}, '🌐 ' + _('账户信息')),
                    E('div', { 'class': 'status-row' }, [
                        E('span', {}, _('注册状态')),
                        E('span', { 'id': 'warp-account' },
                            accountExists ? E('span', { 'class': 'badge success' }, _('已注册'))
                                : E('span', { 'class': 'badge warning' }, _('未注册')))
                    ])
                ]),

                E('div', { 'class': 'status-card' }, [
                    E('h4', {}, '🧦 ' + _('代理端口')),
                    E('div', { 'class': 'status-row' }, [
                        E('span', {}, 'SOCKS5'),
                        E('span', { 'id': 'warp-socks' },
                            socksRunning ? E('span', { 'class': 'badge success' }, _('运行中 (端口 ') + socksPort + ')')
                                : E('span', { 'class': 'badge warning' }, _('未启动')))
                    ]),
                    E('div', { 'class': 'status-row' }, [
                        E('span', {}, 'HTTP'),
                        E('span', { 'id': 'warp-http' },
                            httpRunning ? E('span', { 'class': 'badge success' }, _('运行中 (端口 ') + httpPort + ')')
                                : E('span', { 'class': 'badge warning' }, _('未启动')))
                    ])
                ])
            ]),

            E('div', { 'class': 'cbi-section' }, [
                E('h3', {}, '⚙️ ' + _('操作')),
                E('div', { 'class': 'action-buttons' }, [
                    E('button', {
                        'class': 'btn cbi-button cbi-button-action',
                        'click': L.bind(this.handleAction, this, 'register')
                    }, '📝 ' + _('注册账户')),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-apply',
                        'click': L.bind(this.handleAction, this, 'start')
                    }, '▶️ ' + _('启动')),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-remove',
                        'click': L.bind(this.handleAction, this, 'stop')
                    }, '⏹️ ' + _('停止')),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-action',
                        'click': L.bind(this.handleAction, this, 'restart')
                    }, '🔄 ' + _('重启')),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-neutral',
                        'click': L.bind(this.handleAction, this, 'test')
                    }, '🧪 ' + _('测试连接')),
                    E('button', {
                        'class': 'btn cbi-button cbi-button-remove',
                        'click': L.bind(this.handleAction, this, 'reset')
                    }, '🗑️ ' + _('重置账户'))
                ])
            ])
        ]);

        this.pollStatus();

        return view;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});