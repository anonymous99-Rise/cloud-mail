import app from '../hono/hono';
import result from "../model/result";
import giteaService from "../service/gitea-service";
import sub2apiService from "../service/sub2api-service";
import settingService from "../service/setting-service";
import accountService from "../service/account-service";
import userService from "../service/user-service";
import roleService from "../service/role-service";
import cryptoUtils from "../utils/crypto-utils";
import emailUtils from "../utils/email-utils";
import { pinyin } from 'pinyin-pro';
import { t } from '../i18n/i18n';
import BizError from "../error/biz-error";

//匹配列表：Gitea full_name ↔ Sub2api username，并标注邮箱是否已统一
app.get('/gitea/match', async (c) => {

	const setting = await settingService.query(c);
	const domainList = getDomains(setting);

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
	const domainList = getDomains(setting);
	const domain = domainParam && domainList.includes(domainParam) ? domainParam : domainList[0];
	const email = await assignEmail(c, giteaUsername, domain);

	return c.json(result.ok({ email }));
});

//一键批量指派：对所有未统一的 Gitea 用户执行 assign，返回逐个结果
app.post('/gitea/assignAll', async (c) => {

	const { domain: domainParam } = await c.req.json() || {};
	const setting = await settingService.query(c);
	const domainList = getDomains(setting);
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
			const email = await assignEmail(c, gitea.username, domain);
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
	const domainList = getDomains(setting);
	const domain = domainParam && domainList.includes(domainParam) ? domainParam : domainList[0];
	const emailPrefix = await genEmailPrefix(c, fullName);
	const email = emailPrefix + '@' + domain;

	await createAccountIfMissing(c, email);
	try {
		await giteaService.createUser(c, { username: emailPrefix, email, fullName });
	} catch (e) {
		auditLog(c, 'create.fail', fullName, email, e.message);
		throw e;
	}
	auditLog(c, 'create', fullName, email);

	return c.json(result.ok({ email }));
});

//邮箱池：cloud-mail 全部账号
app.get('/gitea/pool', async (c) => {
	const list = await accountService.selectAllEmails(c);
	return c.json(result.ok(list))
});

//取去除 @ 前缀的域名列表，为空时直接报错而非 TypeError
function getDomains(setting) {
	if (!setting.domainList || setting.domainList.length === 0) {
		throw new BizError(t('noDomainVariable'));
	}
	return setting.domainList.map(item => item.substring(1));
}

//assign 主体：建 cloud-mail 账号 → 建/关联登录用户 → 改 Gitea 邮箱，失败带上明确步骤
async function assignEmail(c, giteaUsername, domain) {
	const email = giteaUsername + '@' + domain;
	await createAccountIfMissing(c, email);
	await ensureUserWithAccount(c, email);
	try {
		await giteaService.modifyUserEmail(c, giteaUsername, email);
	} catch (e) {
		auditLog(c, 'assign.fail', giteaUsername, email, e.message);
		throw new BizError(t('giteaCreateStepFail') + '：' + e.message);
	}
	auditLog(c, 'assign', giteaUsername, email);
	return email;
}

//确保邮箱有可登录的用户：无主则建 user（密码随机废弃，登录走 Gitea OAuth）并绑定 account
async function ensureUserWithAccount(c, email) {
	const accountRow = await accountService.selectByEmailIncludeDel(c, email);

	//已有主或不存在（不存在时 createAccountIfMissing 刚建过 userId=0）都按无主处理
	if (!accountRow || accountRow.userId !== 0) {
		return;
	}

	const userRow = await userService.selectByEmailIncludeDel(c, email);
	if (userRow) {
		//user 存在但 account 未关联（历史数据），补关联
		await accountService.bindUser(c, email, userRow.userId);
		return;
	}

	const roleRow = await roleService.selectDefaultRole(c);
	const { salt, hash } = await cryptoUtils.hashPassword(cryptoUtils.genRandomPwd(24));
	const userId = await userService.insert(c, { email, regKeyId: 0, password: hash, salt, type: roleRow.roleId });
	await accountService.bindUser(c, email, userId);
	await userService.updateUserInfo(c, userId, true);
	auditLog(c, 'user.create', email, email);
}

//操作审计日志：进 Cloudflare Workers observability（结构化单行 JSON）
function auditLog(c, action, target, email, error) {
	const operator = c.get('user')?.email || 'unknown';
	console.log(JSON.stringify({
		audit: 'email-unify',
		action,
		operator,
		target,
		email,
		error: error || undefined,
		time: new Date().toISOString()
	}));
}

async function createAccountIfMissing(c, email) {

	const accountRow = await accountService.selectByEmailIncludeDel(c, email);

	if (accountRow && accountRow.isDel === 0) {
		return;
	}

	if (accountRow) {
		await accountService.restoreByEmail(c, email);
		return;
	}

	await accountService.insert(c, { userId: 0, email, name: emailUtils.getName(email) });
}

//根据实名生成邮箱前缀：全字母/数字直接用，中文转全拼（如 李锐 → lirui），非中文字符丢弃
async function genEmailPrefix(c, fullName) {

	const cleaned = fullName.trim();
	let prefix;
	if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
		prefix = cleaned.toLowerCase();
	} else {
		const pinyinName = pinyin(cleaned, { toneType: 'none', type: 'array', nonZh: 'removed' })
			.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
		//极端兜底：过滤后无有效字符（如全符号实名），用时间戳保证唯一
		prefix = pinyinName || ('u' + Date.now().toString(36));
	}

	//重名加数字后缀：lirui → lirui2 → lirui3
	const giteaUsers = await giteaService.listUsers(c);
	const used = new Set(giteaUsers.map(u => u.username.toLowerCase()));
	if (!used.has(prefix)) {
		return prefix;
	}
	for (let i = 2; ; i++) {
		if (!used.has(prefix + i)) {
			return prefix + i;
		}
	}
}

export default app;
