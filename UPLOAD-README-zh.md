# JEP Guard for ClawHub 1.2.0 发布修正版

解压后选择直接包含 package.json、openclaw.plugin.json、openclaw.js 的文件夹，在原插件条目发布新版本。类型应显示 Code plugin，版本仍为 1.2.0。

GitHub repository：schchit/jep-guard-clawhub；Tag or branch：main；Package path：.。Commit SHA 必须使用本次交付的新提交号，不能再使用 c69a136 开头的旧号。

此包补齐根目录清单及真实 OpenClaw 入口。原生工具 jep_guard_health 仅按需检查本机记录服务的 /health；浏览器扩展与服务仍须手动配置和启动。健康响应不等于签名验证或执行授权。

先阅读 README.md 的迁移与安装说明。请勿把令牌放入聊天、发布表单或仓库。平台提交后还需复审。
