import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/github/login', async (c) => {
	const loginInfo = await oauthService.githubLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/google/login', async (c) => {
	const loginInfo = await oauthService.googleLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/gitea/login', async (c) => {
	const loginInfo = await oauthService.giteaLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/dingtalk/login', async (c) => {
	const loginInfo = await oauthService.dingtalkLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

//Sub2api 账号密码登录（验证代理 + JIT 供给）
app.post('/oauth/sub2api/login', async (c) => {
	const loginInfo = await oauthService.sub2apiLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});
