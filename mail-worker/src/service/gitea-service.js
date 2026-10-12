import BizError from "../error/biz-error";
import settingService from "./setting-service";
import cryptoUtils from "../utils/crypto-utils";
import { t } from '../i18n/i18n';

const giteaService = {

	async assertConfig(c) {
		const setting = await settingService.query(c);
		//数据库配置优先，GitHub Actions 环境变量兜底
		const domain = (setting.giteaDomain || c.env.gitea_domain || '').replace(/\/$/, '');
		const token = setting.giteaAdminToken || c.env.gitea_admin_token || '';
		if (!domain || !token) {
			throw new BizError(t('giteaNotConfigured'));
		}
		return { domain: domain, token: token };
	},

	//把 Gitea 错误响应转成带具体原因的 BizError
	async toError(res) {
		if (res.status === 401) {
			return new BizError(t('giteaUnauthorized'));
		}
		let detail = res.statusText;
		try {
			const body = await res.json();
			if (body && body.message) {
				detail = body.message;
			}
		} catch (e) {
			//响应不是 JSON，保持 statusText
		}
		return new BizError('Gitea: ' + detail);
	},

	//分页拉全 Gitea 用户，过滤离职/禁登录账号
	async listUsers(c) {

		const config = await this.assertConfig(c);
		const list = [];
		let page = 1;

		while (true) {
			const res = await fetch(`${config.domain}/api/v1/admin/users?limit=50&page=${page}`, {
				headers: { Authorization: 'token ' + config.token }
			});

			if (!res.ok) {
				throw await this.toError(res);
			}

			const rows = await res.json();

			rows.forEach(row => {
				if (row.active && !row.prohibit_login) {
					list.push({
						username: row.username,
						fullName: row.full_name || '',
						email: row.email || ''
					});
				}
			});

			if (rows.length < 50) {
				break;
			}
			page++;
		}

		return list;
	},

	async modifyUserEmail(c, username, email) {

		const config = await this.assertConfig(c);

		const res = await fetch(`${config.domain}/api/v1/admin/users/${encodeURIComponent(username)}`, {
			method: 'PATCH',
			headers: {
				Authorization: 'token ' + config.token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email })
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		return await res.json();
	},

	async createUser(c, params) {

		const { username, email, fullName } = params;
		const config = await this.assertConfig(c);

		const res = await fetch(`${config.domain}/api/v1/admin/users`, {
			method: 'POST',
			headers: {
				Authorization: 'token ' + config.token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				username,
				email,
				full_name: fullName,
				login_name: username,
				password: cryptoUtils.genRandomPwd(12),
				must_change_password: false
			})
		});

		if (!res.ok && res.status !== 422) {
			throw await this.toError(res);
		}

		return await res.json();
	},

}

export default giteaService
