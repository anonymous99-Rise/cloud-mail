import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import verifyRecordService from "./verify-record-service";
import sub2apiService from "./sub2api-service";
import unifyService from "./unify-service";
import {t} from '../i18n/i18n';

const oauthService = {

	async bindUser(c, params) {

		const { email, oauthUserId, code } = params;

		const oauthRow = await this.getById(c, oauthUserId);

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'linuxdoSwitch');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.linuxdoClientId)
		reqParams.append('client_secret', setting.linuxdoClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		const token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'linuxdo';

		return await this.saveAndLogin(c, userInfo)
	},

	async githubLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'githubSwitch');

		const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json"
			},
			body: JSON.stringify({
				client_id: setting.githubClientId,
				client_secret: setting.githubClientSecret,
				code: code,
				redirect_uri: redirectUri
			})
		});

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText);
		}

		const token = await tokenRes.json();

		if (token.error) {
			throw new BizError(token.error_description || token.error);
		}

		const userRes = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token,
				'User-Agent': 'cloud-mail'
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText);
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.username = userInfo.login;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'github';

		return await this.saveAndLogin(c, userInfo);
	},

	async googleLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'googleSwitch');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.googleClientId)
		reqParams.append('client_secret', setting.googleClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		});

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText);
		}

		const token = await tokenRes.json();

		const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText);
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.sub);
		userInfo.username = userInfo.email;
		userInfo.name = userInfo.name;
		userInfo.avatar = userInfo.picture;
		userInfo.platform = 'google';

		return await this.saveAndLogin(c, userInfo);
	},

	async giteaLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'giteaSwitch');

		const giteaDomain = (setting.giteaDomain || '').replace(/\/$/, '');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.giteaClientId)
		reqParams.append('client_secret', setting.giteaClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch(giteaDomain + '/login/oauth/access_token', {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		const token = await tokenRes.json()

		const userRes = await fetch(giteaDomain + '/api/v1/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.username = userInfo.login;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'gitea';

		return await this.saveAndLogin(c, userInfo)
	},

	async dingtalkLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'dingtalkSwitch');

		const tokenRes = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grantType: "authorization_code",
				code: code,
				appid: setting.dingtalkClientId,
				appsecret: setting.dingtalkClientSecret
			})
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		const token = await tokenRes.json()

		const userRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/userInfo', {
			headers: {
				'x-dingtalk-access-token': token.accessToken
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.unionId || userInfo.openId);
		userInfo.username = userInfo.nick;
		userInfo.name = userInfo.name || userInfo.nick;
		userInfo.avatar = userInfo.pic;
		userInfo.platform = 'dingtalk';

		return await this.saveAndLogin(c, userInfo);
	},

	async saveAndLogin(c, userInfo) {

		const oauthRow = await this.saveUser(c, userInfo);
		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			//已绑定：主邮箱不是统一邮箱（早期绑定表单注册的老用户）→ 补一个统一邮箱（幂等）
			await unifyService.ensureUnifiedMailboxForUser(c, oauthRow, userRow, userInfo.username || userInfo.name);
		} else {
			//Gitea 平台：按「统一邮箱前缀 == gitea 用户名」认领管理员预分配的无主邮箱
			if (userInfo.platform === 'gitea' && userInfo.username) {
				userRow = await unifyService.claimAssignedAccount(c, oauthRow, userInfo.username);
			}

			//Sub2api / 钉钉：JIT 供给——自动建 Gitea 身份 + 统一邮箱 + 登录用户
			if (!userRow && (userInfo.platform === 'sub2api' || userInfo.platform === 'dingtalk')) {
				//sub2api: username 即实名；dingtalk: name 是实名(username 是昵称)
				const realName = userInfo.platform === 'sub2api'
					? (userInfo.username || userInfo.name)
					: (userInfo.name || userInfo.username);
				userRow = await unifyService.jitProvision(c, oauthRow, {
					realName,
					preferredUsername: userInfo.preferredUsername || null
				});
			}
		}

		if (!userRow) {
			return { userInfo: oauthRow, token: null };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	//Sub2api 账号密码登录：转发 Sub2api 登录 API 验证，成功后 JIT 供给身份（Gitea+邮箱+用户）
	async sub2apiLogin(c, params) {

		const { email, password } = params;

		if (!email || !password) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		//登录限速：与主登录共用同 IP 失败计数
		const failCount = await verifyRecordService.getLoginFailCount(c);
		if (failCount >= 10) {
			throw new BizError(t('loginRateLimit'), 429);
		}

		const verified = await sub2apiService.verifyUser(c, email, password);
		if (!verified) {
			await verifyRecordService.increaseLoginFailCount(c);
			throw new BizError(t('IncorrectPwd'));
		}

		//定位 Sub2api 用户拿实名和稳定 ID（oauthUserId 带平台前缀，避免与其他平台数字 ID 撞）
		const users = await sub2apiService.listUsers(c);
		const su = users.find(u => (u.email || '').toLowerCase() === email.trim().toLowerCase());
		const realName = su?.username || email.split('@')[0];
		const oauthUserId = su ? `sub2api_${su.id}` : `sub2api_${email.trim().toLowerCase()}`;

		const userInfo = {
			oauthUserId,
			username: realName,
			name: realName,
			avatar: null,
			platform: 'sub2api'
		};

		return await this.saveAndLogin(c, userInfo);
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	assertEnabled(setting, switchKey) {
		if (setting[switchKey] !== 0) {
			throw new BizError(t('oauthDisabled'));
		}
	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
