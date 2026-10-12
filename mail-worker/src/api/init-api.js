import app from '../hono/hono';
import { dbInit } from '../init/init';

//secret 走请求头而非 URL 路径，避免落入访问日志/浏览器历史
app.post('/init/:secret', (c) => {
	return dbInit.init(c);
})
