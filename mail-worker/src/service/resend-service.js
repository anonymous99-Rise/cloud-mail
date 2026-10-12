import emailService from './email-service';
import settingService from './setting-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

//Svix (Resend webhook) 签名校验：HMAC-SHA256(secret, "{id}.{timestamp}.{payload}")
async function verifySvixSignature(secret, headers, rawBody) {

	const svixId = headers.get('svix-id');
	const svixTimestamp = headers.get('svix-timestamp');
	const svixSignature = headers.get('svix-signature');

	if (!svixId || !svixTimestamp || !svixSignature) {
		return false;
	}

	//时间容差 5 分钟，防重放
	const timestamp = parseInt(svixTimestamp, 10);
	if (isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
		return false;
	}

	let secretBytes;
	try {
		const secretRaw = secret.replace(/^whsec_/, '');
		const bin = atob(secretRaw);
		secretBytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
	} catch (e) {
		return false;
	}

	const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
	const key = await crypto.subtle.importKey(
		'raw',
		secretBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
	const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

	//svix-signature 可能是 "v1,xxx" 或多个空格分隔的版本，取全部比对
	return svixSignature.split(' ').some(sig => {
		const [version, signature] = sig.split(',');
		return version === 'v1' && signature === expected;
	});
}

const resendService = {

	async webhooks(c, body) {

		const setting = await settingService.query(c);
		const secret = setting.resendWebhookSecret;

		if (!secret) {
			throw new BizError('Resend webhook 验签密钥未配置，请在系统设置中配置 resendWebhookSecret', 403);
		}

		const rawBody = await c.req.text();
		const valid = await verifySvixSignature(secret, c.req.raw.headers, rawBody);
		if (!valid) {
			throw new BizError('webhook signature verification failed', 401);
		}

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
