import { Router } from 'express';
import { getDashboard, patchHoliday, patchLeaveRecord, patchLeaveType, postHoliday, postLeaveRecord, postLeaveType, putPolicy, removeHoliday, removeLeaveRecord, removeLeaveType } from '../controllers/leave.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

export const leaveRouter = Router();
leaveRouter.use(requireAuth);
leaveRouter.get('/dashboard', getDashboard);
leaveRouter.put('/policy', requireCsrf, putPolicy);
leaveRouter.post('/types', requireCsrf, postLeaveType);
leaveRouter.patch('/types/:id', requireCsrf, patchLeaveType);
leaveRouter.delete('/types/:id', requireCsrf, removeLeaveType);
leaveRouter.post('/holidays', requireCsrf, postHoliday);
leaveRouter.patch('/holidays/:id', requireCsrf, patchHoliday);
leaveRouter.delete('/holidays/:id', requireCsrf, removeHoliday);
leaveRouter.post('/records', requireCsrf, postLeaveRecord);
leaveRouter.patch('/records/:id', requireCsrf, patchLeaveRecord);
leaveRouter.delete('/records/:id', requireCsrf, removeLeaveRecord);
