import app from '../hono/hono';
import result from "../model/result";
import giteaService from "../service/gitea-service";
import sub2apiService from "../service/sub2api-service";
import settingService from "../service/setting-service";
import accountService from "../service/account-service";
import unifyService from "../service/unify-service";
import { t } from '../i18n/i18n';
import BizError from "../error/biz-error";

//匹配列表：Gitea full_name ↔ Sub2api username，并标注邮箱是否已统一
app.get('/gitea/match', async (c) => {

	const setting = await settingService.query(c);
	const domainList = unifyService.getDomains(setting);

	const [giteaUsers, sub2apiResult] = await Promise.all([
		giteaService.listUsers(c),
		sub2apiService.listUsers(c).then(users => ({ users, error: null })).catch(e => ({ users: [], error: e.message }))
	]);
	const giteaUsersList = giteaUsers;
	const sub2apiUsers = sub2apiResult.users;

	const sub2apiMap = {};
	sub2apiUsers.forEach(user => {
		const username = normalizeName(user.username);
		if (!username) return;
		sub2apiMap[username] = user;
		//实名兼容部门后缀：李锐 ↔ 李锐-行市部；取最后一个 - 切分，避免误切如 张三-丰
		const dashIndex = username.lastIndexOf('-');
		if (dashIndex > 1) {
			const baseName = username.substring(0, dashIndex);
			if (!sub2apiMap[baseName]) {
				sub2apiMap[baseName] = user;
			}
		}
	});

	const list = giteaUsersList.map(gitea => {
		const sub2api = sub2apiMap[normalizeName(gitea.fullName)] || null;
		if (sub2api) {
			delete sub2apiMap[gitea.fullName];
		}
		return {
			fullName: gitea.fullName,
			giteaUsername: gitea.username,
			giteaEmail: gitea.email,
			sub2apiId: sub2api ? sub2api.id : null,
			sub2apiEmail: sub2api ? sub2api.email : '',
			matched: !!sub2api,
			unified: domainList.some(domain => gitea.email.endsWith('@' + domain))
		};
	});

	//Sub2api 有、Gitea 没有（按实名未匹配上）的账号
	Object.values(sub2apiMap).forEach(sub2api => {
		list.push({
			fullName: sub2api.username,
			giteaUsername: '',
			giteaEmail: '',
			sub2apiId: sub2api.id,
			sub2apiEmail: sub2api.email,
			matched: false,
			unified: false
		});
	});

	return c.json(result.ok({ list, sub2apiError: sub2apiResult.error }))
});

//实名匹配归一化：去首尾空白 + 小写，避免 尾随空格/大小写 导致匹配失败
function normalizeName(name) {
	return (name || '').trim().toLowerCase();
}

//给 Gitea 用户指派统一邮箱：自动生成 <gitea用户名>@域名，同时写入 cloud-mail 账号表并修改 Gitea
app.post('/gitea/assign', async (c) => {

	const { giteaUsername, domain: domainParam } = await c.req.json();

	if (!giteaUsername) {
		throw new BizError(t('emptyEmail'));
	}

	const setting = await settingService.query(c);
	const domainList = unifyService.getDomains(setting);
	const domain = domainParam && domainList.includes(domainParam) ? domainParam : domainList[0];
	const email = await unifyService.assignEmail(c, giteaUsername, domain);

	return c.json(result.ok({ email }));
});

//一键批量指派：对所有未统一的 Gitea 用户执行 assign，返回逐个结果
app.post('/gitea/assignAll', async (c) => {

	const { domain: domainParam } = await c.req.json() || {};
	const setting = await settingService.query(c);
	const domainList = unifyService.getDomains(setting);
	const domain = domainParam && domainList.includes(domainParam) ? domainParam : domainList[0];
	const giteaUsers = await giteaService.listUsers(c);

	const targets = giteaUsers.filter(gitea =>
		!domainList.some(d => gitea.email.endsWith('@' + d))
	);

	if (targets.length === 0) {
		throw new BizError(t('assignAllNoTarget'));
	}

	const results = [];
	for (const gitea of targets) {
		try {
			const email = await unifyService.assignEmail(c, gitea.username, domain);
			results.push({ giteaUsername: gitea.username, email, success: true });
		} catch (e) {
			results.push({ giteaUsername: gitea.username, success: false, error: e.message });
		}
	}

	const failCount = results.filter(r => !r.success).length;
	return c.json(result.ok({ total: results.length, failCount, results }));
});

//给未匹配的 Sub2api 实名创建 Gitea 账号并分配邮箱
app.post('/gitea/create', async (c) => {

	const { fullName, domain: domainParam } = await c.req.json();

	if (!fullName) {
		throw new BizError(t('emptyEmail'));
	}

	const setting = await settingService.query(c);
	const domainList = unifyService.getDomains(setting);
	const domain = domainParam && domainList.includes(domainParam) ? domainParam : domainList[0];
	const emailPrefix = await unifyService.genEmailPrefix(c, fullName);
	const email = emailPrefix + '@' + domain;

	await unifyService.ensureAccount(c, email);
	try {
		await giteaService.createUser(c, { username: emailPrefix, email, fullName });
	} catch (e) {
		unifyService.auditLog(c, 'create.fail', fullName, email, e.message);
		throw e;
	}
	unifyService.auditLog(c, 'create', fullName, email);

	return c.json(result.ok({ email }));
});

//邮箱池：cloud-mail 全部账号
app.get('/gitea/pool', async (c) => {
	const list = await accountService.selectAllEmails(c);
	return c.json(result.ok(list))
});

export default app;
