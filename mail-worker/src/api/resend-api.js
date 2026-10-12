import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const body = await c.req.json();
		await resendService.webhooks(c, body);
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, e.code || 500)
	}
})
