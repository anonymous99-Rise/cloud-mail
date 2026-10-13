//账号开通通知邮件模板：告知用户 Gitea 账号与统一邮箱已创建（新建账号附带明文密码）
export default function accountNoticeTemplate({ giteaUsername, giteaPassword, mailbox, giteaUrl, title = 'Hope Mail' }) {

	const giteaLine = giteaUrl
		? `<p style="margin:8px 0">Gitea 地址：<a href="${giteaUrl}" style="color:#0E70DF">${giteaUrl}</a></p>`
		: '';

	//密码块：仅新建账号时展示
	const passwordBlock = giteaPassword
		? `<p style="margin:6px 0"><b>Gitea 初始密码：</b><span style="font-family:monospace;background:#eef2f7;padding:2px 6px;border-radius:4px;">${giteaPassword}</span>（请登录后尽快修改）</p>`
		: '';

	const giteaTip = giteaPassword
		? `<p style="margin:8px 0">以上 Gitea 账号密码可直接登录 Gitea；登录 Hope Mail 仍使用您原有的账号（Gitea / Sub2api / 钉钉），无需密码，邮箱会自动关联。</p>`
		: `<p style="margin:8px 0">登录 ${title} 请使用您原有的账号（Gitea / Sub2api / 钉钉），无需额外密码，邮箱会自动关联。</p>`;

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:10px;padding:28px 24px;color:#13181D;font-size:14px;line-height:1.7;">
      <h2 style="margin:0 0 16px;font-size:18px;">欢迎使用 ${title}</h2>
      <p style="margin:8px 0">您的统一身份账号已开通，信息如下：</p>
      <div style="background:#f7f9fc;border-radius:8px;padding:14px 16px;margin:14px 0;">
        <p style="margin:6px 0"><b>Gitea 用户名：</b>${giteaUsername}</p>
        ${passwordBlock}
        <p style="margin:6px 0"><b>统一邮箱：</b>${mailbox}</p>
        ${giteaLine}
      </div>
      ${giteaTip}
      <p style="margin:16px 0 0;color:#8a94a6;font-size:12px;">本邮件由系统自动发送，请勿直接回复。</p>
    </div>
  </div>
</body>
</html>`;
}
