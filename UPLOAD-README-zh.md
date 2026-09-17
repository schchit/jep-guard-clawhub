# JEP Guard for ClawHub 1.2.0 候选安装与上传包

## 上传 ClawHub
解压后，在原 jep-guard-clawhub 插件的新版本页面选择 jep-guard-clawhub 文件夹，版本为 1.2.0。它是插件包，不要上传到普通 Skill 发布页。

本包包含浏览器扩展、手动启动的本地记录服务和 agent host 的 setup skill。原有错误原生插件入口已移除，包采用技能 bundle 布局。平台原条目是 Code Plugin；平台可能要求先确认 Bundle Plugin 类型迁移，不能保证直接覆盖旧类型成功。

ClawHub 插件发布页还要求真实 GitHub 仓库和对应提交 SHA；安装包不能替代这两项来源信息。下面的来源清单记录的是本地修复提交，不代表它已经存在于任何 GitHub 远程仓库，请勿把它配到不对应的仓库。

## 本地安装
使用 Node.js 22+ 和支持私有 POSIX 文件权限的环境。先阅读 README.md，再手动运行 node daemon.js。浏览器扩展管理页选择 Load unpacked/加载已解压扩展，并选择本文件夹。

配置令牌只在本机按 README.md 操作；不要把令牌发到聊天、表单或仓库。本包不含可用令牌。Chrome/Edge 实际安装联调和 Windows ACL 支持尚未验证，不保证所有浏览器兼容。

现有 11 项单元/请求处理测试通过；静态 Plugin Inspector 为 PASS、0 warnings。真实网络服务、已安装浏览器扩展及宿主集成尚未验证。此包是待审候选，不是已验证的生产安装包；上传后仍需平台复审。
