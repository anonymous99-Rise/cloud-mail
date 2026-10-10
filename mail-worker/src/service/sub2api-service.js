import BizError from "../error/biz-error";
import settingService from "./setting-service";
import { t } from '../i18n/i18n';

const sub2apiService = {

	async assertConfig(c) {
		const setting = await settingService.query(c);
		//数据库配置优先，GitHub Actions 环境变量兜底
		const url = (setting.sub2apiUrl || c.env.sub2api_url || '').replace(/\/$/, '');
		let account = null;
		try {
			account = JSON.parse(setting.sub2apiAccount || c.env.sub2api_account || '');
		} catch (e) {
			account = null;
		}
		if (!url || !account || !account.email || !account.password) {
			throw new BizError(t('sub2apiNotConfigured'));
		}
		return { url: url, account };
	},

	async getToken(c) {
		const config = await this.assertConfig(c);

		const res = await fetch(`${config.url}/api/v1/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: config.account.email, password: config.account.password })
		});

		if (!res.ok) {
			throw new BizError('Sub2api: ' + res.statusText);
		}

		const data = await res.json();

		if (!data.data || !data.data.access_token) {
			throw new BizError('Sub2api: ' + (data.message || 'login failed'));
		}

		return data.data.access_token;
	},

	//分页拉全 Sub2api 用户，username 即实名
	async listUsers(c) {

		const config = await this.assertConfig(c);
		const token = await this.getToken(c);
		const list = [];
		let page = 1;

		while (true) {
			const res = await fetch(`${config.url}/api/v1/admin/users?page=${page}&page_size=50`, {
				headers: { Authorization: 'Bearer ' + token }
			});

			if (!res.ok) {
				throw new BizError('Sub2api: ' + res.statusText);
			}

			const data = await res.json();
			const items = data.data?.items || [];

			items.forEach(row => {
				list.push({
					id: row.id,
					username: row.username || '',
					email: row.email || '',
					status: row.status
				});
			});

			if (items.length < 50) {
				break;
			}
			page++;
		}

		return list;
	},

}

export default sub2apiService
