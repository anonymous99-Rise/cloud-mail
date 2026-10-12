<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Hope Mail</h1>
    <p align="center">基于 Cloudflare 的简约响应式邮箱服务，支持邮件发送、附件收发 🎉</p>
    <p align="center">
        简体中文 | <a href="/README-en.md" style="margin-left: 5px">English </a>
    </p>
    <p align="center">
        <a href="LICENSE" target="_blank">
            <img src="https://img.shields.io/badge/license-MIT-green" />
        </a>
        <a href="https://github.com/anonymous99-Rise/cloud-mail/releases" target="_blank">
            <img src="https://img.shields.io/github/v/release/anonymous99-Rise/cloud-mail" alt="releases" />
        </a>
        <a href="https://github.com/anonymous99-Rise/cloud-mail/issues">
            <img src="https://img.shields.io/github/issues/anonymous99-Rise/cloud-mail" alt="issues" />
        </a>
    </p>
</p>

## 项目简介

Hope Mail（基于开源项目 [cloud-mail](https://github.com/maillab/cloud-mail) 二次开发）只需要一个域名，就可以创建多个不同的邮箱，类似各大邮箱平台。项目部署到 Cloudflare Workers，无需服务器，搭建自己的邮箱服务。

## 项目展示

| ![](/doc/demo/demo1.png) | ![](/doc/demo/demo2.png) |
|-----------------------|-----------------------|
| ![](/doc/demo/demo3.png) | ![](/doc/demo/demo4.png) |

## 功能介绍

- **💰 低成本使用**：可部署到 Cloudflare Workers 降低服务器成本

- **💻 响应式设计**：响应式布局自动适配PC和大部分手机端浏览器

- **📧 邮件发送**：集成 Resend 发送邮件，支持群发，内嵌图片和附件发送，发送状态查看

- **🛡️ 管理员功能**：可以对用户、邮件进行管理，RBAC 权限控制对功能及使用资源限制

- **📦 附件收发**：支持收发附件，使用 R2 对象存储保存和下载文件

- **🔔 邮件推送**：接收邮件后可以转发到 TG 机器人、其他邮箱或自定义 Webhook

- **🔐 OAuth 登录**：支持 LinuxDo、GitHub、Google、Gitea、钉钉 五种 OAuth2 登录

- **📮 统一邮箱**：对接 Gitea / Sub2api，按实名自动匹配、批量生成并指派统一邮箱

- **📡 开放API**：支持使用 API 批量生成用户，多条件查询邮件

- **🔢 验证码识别**：使用 Workers AI，自动识别邮件验证码

- **📈 数据可视化**：使用 ECharts 对系统数据、用户邮件增长可视化显示

- **🎨 个性化设置**：可以自定义网站标题、登录背景、透明度

- **🤖 人机验证**：集成 Turnstile 人机验证，防止批量注册

- **🔒 安全加固**：PBKDF2 密码哈希、邮件 HTML 消毒渲染、Webhook 签名校验、登录限速

## 技术栈

- **平台**：[Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web框架**：[Hono](https://hono.dev/)

- **ORM**：[Drizzle](https://orm.drizzle.team/)

- **前端框架**：[Vue3](https://vuejs.org/)

- **UI框架**：[Element Plus](https://element-plus.org/)

- **邮件推送**：[Resend](https://resend.com/)

- **缓存**：[Cloudflare KV](https://developers.cloudflare.com/kv/)

- **数据库**：[Cloudflare D1](https://developers.cloudflare.com/d1/)

- **文件存储**：[Cloudflare R2](https://developers.cloudflare.com/r2/)

## 目录结构

```
cloud-mail
├── mail-worker				    # worker后端项目
│   ├── src
│   │   ├── api	 			    # api接口层
│   │   ├── const  			    # 项目常量
│   │   ├── email			    # 邮件处理接收
│   │   ├── entity			    # 数据库实体
│   │   ├── error			    # 自定义异常
│   │   ├── hono			    # web框架配置、拦截器、全局异常等
│   │   ├── i18n			    # 语言国际化
│   │   ├── init			    # 数据库缓存初始化
│   │   ├── model			    # 响应体数据封装
│   │   ├── security			# 身份权限认证
│   │   ├── service			    # 业务服务层
│   │   ├── template			# 消息模板
│   │   ├── utils			    # 工具类
│   │   └── index.js			# 入口文件
│   ├── package.json			# 项目依赖
│   └── wrangler.toml			# 项目配置
│
├── mail-vue				    # vue前端项目
│   ├── src
│   │   ├── axios 			    # axios配置
│   │   ├── components			# 自定义组件
│   │   ├── i18n			    # 语言国际化
│   │   ├── layout			    # 主体布局组件
│   │   ├── perm			    # 权限认证
│   │   ├── request			    # api接口
│   │   ├── router			    # 路由配置
│   │   ├── store			    # 全局状态管理
│   │   ├── utils			    # 工具类
│   │   ├── views			    # 页面组件
│   │   └── main.js			    # 入口js
│   ├── package.json			# 项目依赖
└── └── env.release				# 项目配置
```

## 部署

1. Fork 本仓库到自己的 GitHub 账号
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置所需 Secrets（`CUSTOM_DOMAIN`、`DOMAIN`、`ADMIN`、`JWT_SECRET`、`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 等）
3. 推送代码到 main 分支，GitHub Actions 自动完成构建和部署
4. 部署完成后 CI 会自动初始化数据库

## 版本发布

版本号以 `mail-worker/package.json` 的 `version` 为单一事实源，前端构建时自动注入，无需手动改代码。

在 `mail-worker` 目录执行：

```bash
pnpm release          # 补丁版本（3.4.0 → 3.4.1）
pnpm release:minor    # 功能版本（3.4.0 → 3.5.0）
pnpm release:major    # 大版本（3.4.0 → 4.0.0）
pnpm release 3.6.0    # 显式指定版本号
```

脚本自动完成：计算新版本 → 从上个 tag 收集 commit 按 feat/fix 分组生成更新说明 → 写入 [CHANGELOG.md](CHANGELOG.md) → commit + tag → 双推 GitHub/Gitea → GitHub Actions 自动创建 Release。

## 关于

- **版本**：[Releases](https://github.com/anonymous99-Rise/cloud-mail/releases)
- **GitHub**：https://github.com/anonymous99-Rise/cloud-mail
- **Gitea**：https://git.nxwysoft.com

## 许可证

本项目采用 [MIT](LICENSE) 许可证。基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 开发，感谢原作者。
# auto-versioned by CI
