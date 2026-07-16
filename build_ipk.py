import os
import tarfile
import io

def create_ipk():
    print("开始打包构建 luci-app-warp_0.0.1_all.ipk...")
    
    # 1. 准备并打包 control.tar.gz
    control_buf = io.BytesIO()
    with tarfile.open(fileobj=control_buf, mode="w:gz") as tar:
        # 写入 control 元数据
        control_data = (
            "Package: luci-app-warp\n"
            "Version: 0.0.1-1\n"
            "Depends: luci-base, jsonfilter, ca-bundle, jq\n"
            "Section: luci\n"
            "Category: LuCI\n"
            "Architecture: all\n"
            "Maintainer: hxzlplp7\n"
            "Description: LuCI support for Cloudflare WARP using sing-box.\n"
        ).encode("utf-8")
        
        info = tarfile.TarInfo(name="./control")
        info.size = len(control_data)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(control_data))
        
        # 写入 postinst 脚本
        postinst_data = (
            "#!/bin/sh\n"
            "[ -n \"${IPKG_INSTROOT}\" ] || {\n"
            "\t/etc/init.d/warp enable 2>/dev/null\n"
            "\trm -rf /tmp/luci-indexcache /tmp/luci-modulecache\n"
            "\t(/etc/init.d/rpcd restart >/dev/null 2>&1; /etc/init.d/uhttpd restart >/dev/null 2>&1) &\n"
            "}\n"
            "exit 0\n"
        ).encode("utf-8")
        
        info = tarfile.TarInfo(name="./postinst")
        info.size = len(postinst_data)
        info.mode = 0o755
        tar.addfile(info, io.BytesIO(postinst_data))
        
        # 写入 postrm 脚本
        postrm_data = (
            "#!/bin/sh\n"
            "[ -n \"${IPKG_INSTROOT}\" ] || {\n"
            "\trm -rf /tmp/luci-indexcache /tmp/luci-modulecache\n"
            "\t(/etc/init.d/rpcd restart >/dev/null 2>&1; /etc/init.d/uhttpd restart >/dev/null 2>&1) &\n"
            "}\n"
            "exit 0\n"
        ).encode("utf-8")
        
        info = tarfile.TarInfo(name="./postrm")
        info.size = len(postrm_data)
        info.mode = 0o755
        tar.addfile(info, io.BytesIO(postrm_data))
        
    control_bytes = control_buf.getvalue()
    
    # 2. 准备并打包 data.tar.gz
    data_buf = io.BytesIO()
    with tarfile.open(fileobj=data_buf, mode="w:gz") as tar:
        # 文件列表映射：(源文件路径, 包内安装路径, 是否是可执行脚本)
        files = [
            ("root/etc/config/warp", "./etc/config/warp", False),
            ("root/etc/init.d/warp", "./etc/init.d/warp", True),
            ("root/etc/init.d/warp-cron", "./etc/init.d/warp-cron", True),
            ("root/usr/bin/warp-manager", "./usr/bin/warp-manager", True),
            ("root/usr/bin/warp-update-china", "./usr/bin/warp-update-china", True),
            ("root/usr/bin/warp-log", "./usr/bin/warp-log", True),
            ("htdocs/luci-static/resources/view/warp/settings.js", "./www/luci-static/resources/view/warp/settings.js", False),
            ("htdocs/luci-static/resources/view/warp/status.js", "./www/luci-static/resources/view/warp/status.js", False),
            ("htdocs/luci-static/resources/view/warp/log.js", "./www/luci-static/resources/view/warp/log.js", False),
            ("root/usr/share/rpcd/acl.d/luci-app-warp.json", "./usr/share/rpcd/acl.d/luci-app-warp.json", False),
            ("root/usr/share/luci/menu.d/luci-app-warp.json", "./usr/share/luci/menu.d/luci-app-warp.json", False),
        ]
        
        # 预先添加各层级目录
        dirs = [
            "./etc/config", "./etc/init.d", "./etc/warp",
            "./usr/bin", "./www/luci-static/resources/view/warp",
            "./usr/share/rpcd/acl.d", "./usr/share/luci/menu.d"
        ]
        for d in dirs:
            info = tarfile.TarInfo(name=d)
            info.type = tarfile.DIRTYPE
            info.mode = 0o755
            tar.addfile(info)

        # 添加实际文件并赋予精确模式
        for src, dest, is_exec in files:
            if os.path.exists(src):
                with open(src, "rb") as f:
                    file_data = f.read()
                info = tarfile.TarInfo(name=dest)
                info.size = len(file_data)
                info.mode = 0o755 if is_exec else 0o644
                tar.addfile(info, io.BytesIO(file_data))
                print(f"已添加: {src} -> {dest} (模式: {oct(info.mode)})")
            else:
                print(f"错误: 找不到文件: {src}")
                
    data_bytes = data_buf.getvalue()
    
    # 3. 将它们打包为最后的 .ipk 文件
    debian_binary = b"2.0\n"
    with tarfile.open("luci-app-warp_0.0.1_all.ipk", "w:gz") as tar:
        # debian-binary
        info = tarfile.TarInfo(name="debian-binary")
        info.size = len(debian_binary)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(debian_binary))
        
        # control.tar.gz
        info = tarfile.TarInfo(name="control.tar.gz")
        info.size = len(control_bytes)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(control_bytes))
        
        # data.tar.gz
        info = tarfile.TarInfo(name="data.tar.gz")
        info.size = len(data_bytes)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data_bytes))
        
    print("成功构建并输出 luci-app-warp_0.0.1_all.ipk!")

if __name__ == "__main__":
    create_ipk()
