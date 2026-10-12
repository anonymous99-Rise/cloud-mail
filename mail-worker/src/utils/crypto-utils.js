const encoder = new TextEncoder();

//PBKDF2 迭代次数：Workers CPU 限制内（实测约 50-100ms）
const PBKDF2_ITERATIONS = 100000;

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async pbkdf2(password, saltBytes) {
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
			key,
			256
		);
		return btoa(String.fromCharCode(...new Uint8Array(bits)));
	},

	//生成新哈希：自描述格式 pbkdf2$<iterations>$<b64salt>$<b64hash>，存入现有 password 字段
	async hashPassword(password) {
		const saltBytes = crypto.getRandomValues(new Uint8Array(16));
		const salt = btoa(String.fromCharCode(...saltBytes));
		const hash = await this.pbkdf2(password, saltBytes);
		return { salt, hash: `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}` };
	},

	//旧算法：单轮 SHA-256（存量用户），verifyPassword 自动兼容
	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (storedHash && storedHash.startsWith('pbkdf2$')) {
			const [, iterations, saltB64, hashB64] = storedHash.split('$');
			try {
				const saltBytes = Uint8Array.from(atob(saltB64), ch => ch.charCodeAt(0));
				const key = await crypto.subtle.importKey('raw', encoder.encode(inputPassword), 'PBKDF2', false, ['deriveBits']);
				const bits = await crypto.subtle.deriveBits(
					{ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: parseInt(iterations, 10) || PBKDF2_ITERATIONS },
					key,
					256
				);
				return btoa(String.fromCharCode(...new Uint8Array(bits))) === hashB64;
			} catch (e) {
				return false;
			}
		}
		const hash = await this.genHashPassword(inputPassword, salt);
		return hash === storedHash;
	},

	//存量用户是否还在用旧 SHA-256 哈希（用于登录后透明升级）
	isLegacyHash(storedHash) {
		return !!storedHash && !storedHash.startsWith('pbkdf2$');
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(array[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
