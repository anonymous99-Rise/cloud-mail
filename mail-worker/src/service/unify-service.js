import giteaService from "./gitea-service";
import accountService from "./account-service";
import userService from "./user-service";
import roleService from "./role-service";
import settingService from "./setting-service";
import account from "../entity/account";
import orm from "../entity/orm";
import { oauth } from "../entity/oauth";
import { eq, and, sql } from 'drizzle-orm';
import cryptoUtils from "../utils/crypto-utils";
import emailUtils from "../utils/email-utils";
import { pinyin } from 'pinyin-pro';
import { t } from '../i18n/i18n';
import BizError from "../error/biz-error";

//统一身份供给：Gitea 账号 / 统一邮箱 / 登录用户的创建与关联
//所有登录入口（Gitea OAuth / Sub2api 密码登录 / 钉钉 OAuth）最终都汇聚到 jitProvision
const unifyService = {

	//取去除 @ 前缀的域名列表，为空时直接报错而非 TypeError
	getDomains(setting) {
		if (!setting.domainList || setting.domainList.length === 0) {
			throw new BizError(t('noDomainVariable'));
		}
		return setting.domainList.map(item => item.substring(1));
	},

	//操作审计日志：进 Cloudflare Workers observability（结构化单行 JSON）
	auditLog(c, action, target, email, error) {
		const operator = c.get('user')?.email || 'system';
		console.log(JSON.stringify({
			audit: 'email-unify',
			action,
			operator,
			target,
			email,
			error: error || undefined,
			time: new Date().toISOString()
		}));
	},

	//确保邮箱账号存在（不存在则建无主，已删除则恢复）
	async ensureAccount(c, email) {
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === 0) {
			return;
		}

		if (accountRow) {
			await accountService.restoreByEmail(c, email);
			return;
		}

		await accountService.insert(c, { userId: 0, email, name: emailUtils.getName(email) });
	},

	//确保邮箱有可登录的用户：无主则建 user（密码随机废弃，登录走 OAuth）并绑定 account
	async ensureUserWithAccount(c, email) {
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

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
		this.auditLog(c, 'user.create', email, email);
	},

	//根据基础名生成唯一 Gitea 用户名：全字母/数字直接用，中文转拼音，冲突加数字后缀
	uniqueUsername(giteaUsers, base) {
		const cleaned = (base || '').trim();
		let prefix;
		if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
			prefix = cleaned.toLowerCase();
		} else {
			const p = pinyin(cleaned, { toneType: 'none', type: 'array', nonZh: 'removed' })
				.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
			prefix = p || ('u' + Date.now().toString(36));
		}

		const used = new Set(giteaUsers.map(u => u.username.toLowerCase()));
		if (!used.has(prefix)) {
			return prefix;
		}
		for (let i = 2; ; i++) {
			if (!used.has(prefix + i)) {
				return prefix + i;
			}
		}
	},

	//生成邮箱前缀（/gitea/create 用）：中文转全拼（如 李锐 → lirui），重名自动加后缀
	async genEmailPrefix(c, fullName) {
		const giteaUsers = await giteaService.listUsers(c);
		return this.uniqueUsername(giteaUsers, fullName);
	},

	//assign 主体：建 cloud-mail 账号 → 建/关联登录用户 → 改 Gitea 邮箱，失败带上明确步骤
	async assignEmail(c, giteaUsername, domain) {
		const email = giteaUsername + '@' + domain;
		await this.ensureAccount(c, email);
		await this.ensureUserWithAccount(c, email);
		try {
			await giteaService.modifyUserEmail(c, giteaUsername, email);
		} catch (e) {
			this.auditLog(c, 'assign.fail', giteaUsername, email, e.message);
			throw new BizError(t('giteaCreateStepFail') + '：' + e.message);
		}
		this.auditLog(c, 'assign', giteaUsername, email);
		return email;
	},

	//Gitea OAuth 登录认领：管理员预分配的无主邮箱（前缀==gitea用户名 && userId=0）
	async claimAssignedAccount(c, oauthRow, giteaUsername) {

		const prefix = (giteaUsername || '').trim().toLowerCase();
		if (!prefix) {
			return null;
		}

		//前缀匹配：<gitea用户名>@任意域名，且必须无主
		const accountRow = await orm(c).select().from(account)
			.where(and(
				sql`lower(${account.email}) LIKE ${prefix + '@%'}`,
				eq(account.userId, 0),
				eq(account.isDel, 0)
			))
			.get();

		if (!accountRow) {
			return null;
		}

		let userRow = await userService.selectByEmailIncludeDel(c, accountRow.email);
		if (!userRow) {
			const roleRow = await roleService.selectDefaultRole(c);
			const { salt, hash } = await cryptoUtils.hashPassword(cryptoUtils.genRandomPwd(24));
			const userId = await userService.insert(c, { email: accountRow.email, regKeyId: 0, password: hash, salt, type: roleRow.roleId });
			userRow = await userService.selectById(c, userId);
		}

		await accountService.bindUser(c, accountRow.email, userRow.userId);
		await this.bindOauth(c, oauthRow.oauthUserId, userRow.userId);
		this.auditLog(c, 'oauth.claim', accountRow.email, accountRow.email);

		return userRow;
	},

	//JIT 供给：登录入口（Sub2api/钉钉）用户在 Hope Mail 首次登录时
	//自动补齐 Gitea 身份 → 统一邮箱 → 登录用户，返回 userRow（失败/无法确定返回 null）
	//JIT 是增强流程：任何异常都降级返回 null，绝不阻塞用户登录
	async jitProvision(c, oauthRow, { realName, preferredUsername }) {

		const name = (realName || '').trim();
		if (!name) {
			return null;
		}

		try {
			return await this.doJitProvision(c, oauthRow, name, preferredUsername);
		} catch (e) {
			this.auditLog(c, 'jit.fail', name, '', e.message);
			return null;
		}
	},

	async doJitProvision(c, oauthRow, name, preferredUsername) {

		const setting = await settingService.query(c);
		const domainList = this.getDomains(setting);
		//默认用第一个域名（如 dfyx.click，MX 在 CF 可收信）；hopeless99.top 仅发信不自动分配
		const defaultDomain = domainList[0];

		//1. 定位或创建 Gitea 身份：优先实名精确匹配已有账号
		const giteaUsers = await giteaService.listUsers(c);
		const norm = s => (s || '').trim().toLowerCase();
		let giteaUser = giteaUsers.find(u => norm(u.fullName) === norm(name))
			|| (preferredUsername ? giteaUsers.find(u => norm(u.username) === norm(preferredUsername)) : null);

		if (!giteaUser) {
			const username = this.uniqueUsername(giteaUsers, preferredUsername || name);
			const giteaEmail = username + '@' + defaultDomain;
			await giteaService.createUser(c, { username, email: giteaEmail, fullName: name });
			giteaUser = { username, fullName: name, email: giteaEmail };
			this.auditLog(c, 'jit.gitea.create', name, giteaEmail);
		}

		//2. 确保统一邮箱：Gitea 邮箱已统一且未被他人占用则直接用，否则生成空闲的 <前缀>@默认域名
		const giteaEmail = (giteaUser.email || '').toLowerCase();
		const unified = domainList.some(d => giteaEmail.endsWith('@' + d));
		const mailboxEmail = await this.resolveFreeMailbox(
			c, unified ? giteaEmail : giteaUser.username + '@' + defaultDomain, oauthRow
		);

		//空闲邮箱被重命名过（原前缀被占）时同步回写 Gitea
		if (mailboxEmail !== giteaEmail) {
			await this.ensureAccount(c, mailboxEmail);
			try {
				await giteaService.modifyUserEmail(c, giteaUser.username, mailboxEmail);
			} catch (e) {
				this.auditLog(c, 'jit.mailbox.fail', giteaUser.username, mailboxEmail, e.message);
			}
		}

		//3. 确保登录用户并绑定本次 OAuth 身份
		//resolveFreeMailbox 已保证该邮箱空闲或归本 oauth 所有，此处的 userRow 必为本人
		await this.ensureUserWithAccount(c, mailboxEmail);
		const userRow = await userService.selectByEmailIncludeDel(c, mailboxEmail);

		if (userRow) {
			await this.bindOauth(c, oauthRow.oauthUserId, userRow.userId);
			this.auditLog(c, 'jit.done', name, mailboxEmail);
		}

		return userRow;
	},

	//解析出可用邮箱：目标空闲(不存在/无主/已属本 oauth)则原样，否则加数字后缀
	async resolveFreeMailbox(c, email, oauthRow) {
		if (await this.mailboxAvailable(c, email, oauthRow.oauthUserId)) {
			return email;
		}

		const at = email.lastIndexOf('@');
		const base = email.slice(0, at);
		const domain = email.slice(at);
		for (let i = 2; i < 1000; i++) {
			const candidate = base + i + domain;
			if (await this.mailboxAvailable(c, candidate, oauthRow.oauthUserId)) {
				return candidate;
			}
		}
		throw new BizError('无法分配空闲邮箱前缀');
	},

	//邮箱是否可归本 oauth 使用：不存在、无主、或已绑定到本 oauth 对应的 user
	async mailboxAvailable(c, email, oauthUserId) {
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);
		if (!accountRow || accountRow.userId === 0) {
			return true;
		}
		return await this.isOwnedByOauth(c, email, oauthUserId);
	},

	//该邮箱当前是否绑定到本 oauth 身份对应的 user
	async isOwnedByOauth(c, email, oauthUserId) {
		const oauthRow = await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
		if (!oauthRow || !oauthRow.userId) {
			return false;
		}
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);
		return !!accountRow && accountRow.userId === oauthRow.userId;
	},

	//oauth 身份绑定到用户
	async bindOauth(c, oauthUserId, userId) {
		await orm(c).update(oauth).set({ userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
	}

};

export default unifyService;
