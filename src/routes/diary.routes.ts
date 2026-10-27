import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { applyCorrection, getArchive, getEntry, requestGrammar, saveEntry } from '../controllers/diary.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

export const diaryRouter = Router();
const grammarLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, keyGenerator: (request) => request.session.user?.id ?? ipKeyGenerator(request.ip ?? ''), standardHeaders: 'draft-8', legacyHeaders: false, handler: (_request, response) => response.status(429).json({ success: false, error: { code: 'AI_RATE_LIMITED', message: 'You have used the available writing suggestions for now. Please try again later.' } }) });

diaryRouter.use(requireAuth);
diaryRouter.get('/', getArchive);
diaryRouter.post('/improve-grammar', grammarLimit, requireCsrf, requestGrammar);
diaryRouter.get('/:date', getEntry);
diaryRouter.put('/:date', requireCsrf, saveEntry);
diaryRouter.post('/:date/apply-correction', requireCsrf, applyCorrection);
