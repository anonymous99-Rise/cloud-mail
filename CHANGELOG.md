# Changelog

所有显著变更记录在此文件。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)，通过 `pnpm release`（mail-worker 目录）自动生成。

## v3.3.0（2026-10-10）

### ✨ 新功能

- Gitea / 钉钉 OAuth2 登录
- 统一邮箱：Gitea 与 Sub2api 实名匹配、批量指派
- Webhook 收件推送

## v3.4.0（2026-10-12）

### 🐛 问题修复

- 统一邮箱健壮性修复（脱敏 token 覆盖、匹配归一化、域名空校验）
- 全项目安全加固（PBKDF2、邮件 HTML 消毒、Webhook 验签、登录限速等）
- 统一邮箱侧边栏图标缺失与菜单排序
