import app from '../hono/hono';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	//private 缓存 1 小时：token 有 7 天时效，immutable 长缓存会让过期后的链接仍可读
	c.header('Cache-Control', 'private, max-age=3600');
	return c.html(content)
});

