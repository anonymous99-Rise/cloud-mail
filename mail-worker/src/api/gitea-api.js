import app from '../hono/hono';
import result from "../model/result";
import giteaService from "../service/gitea-service";
import sub2apiService from "../service/sub2api-service";
import settingService from "../service/setting-service";
import accountService from "../service/account-service";
import emailUtils from "../utils/email-utils";
import { t } from '../i18n/i18n';
import BizError from "../error/biz-error";

//匹配列表：Gitea full_name ↔ Sub2api username，并标注邮箱是否已统一
app.get('/gitea/match', async (c) => {

	const setting = await settingService.query(c);
	const domainList = setting.domainList.map(item => item.substring(1));

	const [giteaUsers, sub2apiResult] = await Promise.all([
		giteaService.listUsers(c),
		sub2apiService.listUsers(c).then(users => ({ users, error: null })).catch(e => ({ users: [], error: e.message }))
	]);
	const giteaUsersList = giteaUsers;
	const sub2apiUsers = sub2apiResult.users;

	const sub2apiMap = {};
	sub2apiUsers.forEach(user => {
		sub2apiMap[user.username] = user;
		//实名兼容部门后缀：李锐 ↔ 李锐-行市部
		const dashIndex = user.username.indexOf('-');
		if (dashIndex > 0 && !sub2apiMap[user.username.substring(0, dashIndex)]) {
			sub2apiMap[user.username.substring(0, dashIndex)] = user;
		}
	});

	const list = giteaUsersList.map(gitea => {
		const sub2api = sub2apiMap[gitea.fullName] || null;
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

//给 Gitea 用户指派统一邮箱：自动生成 <gitea用户名>@域名，同时写入 cloud-mail 账号表并修改 Gitea
app.post('/gitea/assign', async (c) => {

	const { giteaUsername } = await c.req.json();

	if (!giteaUsername) {
		throw new BizError(t('emptyEmail'));
	}

	const setting = await settingService.query(c);
	const domain = setting.domainList[0].substring(1);
	const email = giteaUsername + '@' + domain;

	await createAccountIfMissing(c, email);
	await giteaService.modifyUserEmail(c, giteaUsername, email);

	return c.json(result.ok({ email }));
});

//给未匹配的 Sub2api 实名创建 Gitea 账号并分配邮箱
app.post('/gitea/create', async (c) => {

	const { fullName } = await c.req.json();

	if (!fullName) {
		throw new BizError(t('emptyEmail'));
	}

	const setting = await settingService.query(c);
	const domain = setting.domainList[0].substring(1);
	const emailPrefix = await genEmailPrefix(c, fullName);
	const email = emailPrefix + '@' + domain;

	await createAccountIfMissing(c, email);
	await giteaService.createUser(c, { username: emailPrefix, email, fullName });

	return c.json(result.ok({ email }));
});

//邮箱池：cloud-mail 全部账号
app.get('/gitea/pool', async (c) => {
	const list = await accountService.selectAllEmails(c);
	return c.json(result.ok(list))
});

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

//根据实名生成邮箱前缀：全字母/数字直接用，含中文则用拼音不可行，改用时间戳保证唯一
async function genEmailPrefix(c, fullName) {

	if (/^[a-zA-Z0-9_-]+$/.test(fullName)) {
		return fullName.toLowerCase();
	}

	const { num } = await accountService.countUserAccount(c, 0);
	return 'u' + Date.now().toString(36) + (num % 10);
}

export default app;
