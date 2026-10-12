<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Hope Mail</h1>
    <p align="center">A simple, responsive email service designed to run on Cloudflare Workers 🎉</p>
    <p align="center">
       <a href="/README.md" style="margin-left: 5px">简体中文</a> | English
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

## Description

Hope Mail (built on top of the open-source project [cloud-mail](https://github.com/maillab/cloud-mail)): with only one domain, you can create multiple different email addresses, similar to major email platforms. Deployed on Cloudflare Workers — no server needed, build your own email service.

## Project Showcase

| ![](/doc/demo/demo1.png) | ![](/doc/demo/demo2.png) |
|--------------------------|--------------------------|
| ![](/doc/demo/demo3.png) | ![](/doc/demo/demo4.png) |

## Features

- **💰 Low-Cost Usage**: No server required — deploy to Cloudflare Workers to reduce costs.

- **💻 Responsive Design**: Automatically adapts to both desktop and most mobile browsers.

- **📧 Email Sending**: Integrated with Resend, supporting bulk email sending and attachments.

- **🛡️ Admin Features**: Admin controls for user and email management with RBAC-based access control.

- **📦 Attachment Support**: Send and receive attachments, stored and downloaded via R2 object storage.

- **🔔 Email Push**: Forward received emails to Telegram bots, other mailboxes, or custom webhooks.

- **🔐 OAuth Login**: Supports LinuxDo, GitHub, Google, Gitea, and DingTalk OAuth2 sign-in.

- **📮 Unified Mailbox**: Integrates with Gitea / Sub2api to match users by real name, batch-generate and assign unified mailboxes.

- **📡 Open API**: Supports batch user creation via API and multi-condition email queries.

- **🔢 Verification Code Recognition**: Auto-detect codes via Workers AI.

- **📈 Data Visualization**: System data and user/mail growth visualized with ECharts.

- **🎨 Personalization**: Custom site title, login background, and transparency.

- **🤖 Bot Verification**: Integrated with Turnstile to prevent bulk registration.

- **🔒 Security Hardening**: PBKDF2 password hashing, sanitized email HTML rendering, webhook signature verification, login rate limiting.

## Tech Stack

- **Platform**: [Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web Framework**: [Hono](https://hono.dev/)

- **ORM**: [Drizzle](https://orm.drizzle.team/)

- **Frontend**: [Vue3](https://vuejs.org/)

- **UI Framework**: [Element Plus](https://element-plus.org/)

- **Email Delivery**: [Resend](https://resend.com/)

- **Cache**: [Cloudflare KV](https://developers.cloudflare.com/kv/)

- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/)

- **File Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)

## Deployment

1. Fork this repository to your GitHub account.
2. Configure the required secrets under Settings → Secrets and variables → Actions (`CUSTOM_DOMAIN`, `DOMAIN`, `ADMIN`, `JWT_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, etc.).
3. Push to the main branch — GitHub Actions builds and deploys automatically.
4. Database initialization runs automatically after deployment.

## Versioning

The version lives in `mail-worker/package.json` (`version` field) as the single source of truth, injected into the frontend at build time — no manual code edits needed.

Run from the `mail-worker` directory:

```bash
pnpm release          # patch (3.4.0 → 3.4.1)
pnpm release:minor    # minor (3.4.0 → 3.5.0)
pnpm release:major    # major (3.4.0 → 4.0.0)
pnpm release 3.6.0    # explicit version
```

The script automatically: bumps the version → collects commits since the last tag, grouped by feat/fix → writes [CHANGELOG.md](CHANGELOG.md) → commits + tags → pushes to GitHub/Gitea → GitHub Actions creates the Release.

## About

- **Version**: [Releases](https://github.com/anonymous99-Rise/cloud-mail/releases)
- **GitHub**: https://github.com/anonymous99-Rise/cloud-mail
- **Gitea**: https://git.nxwysoft.com/zhangz/cloud-mail

## License

This project is licensed under the [MIT](LICENSE) license. Built on top of [maillab/cloud-mail](https://github.com/maillab/cloud-mail) — thanks to the original author.
