import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { currentUser, csrfToken, login, logout, register } from '../controllers/auth.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

export const authRouter = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_request, response) => response.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' } }) });

authRouter.get('/csrf', csrfToken);
authRouter.get('/me', currentUser);
authRouter.post('/register', authLimit, requireCsrf, register);
authRouter.post('/login', authLimit, requireCsrf, login);
authRouter.post('/logout', requireAuth, requireCsrf, logout);
