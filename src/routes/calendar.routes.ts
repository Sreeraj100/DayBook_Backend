import { Router } from 'express';
import express from 'express';
import { getEvents, getMalayalamImage, getMalayalamPages, patchEvent, postEvent, postMalayalamPage, removeEvent, removeMalayalamPage } from '../controllers/calendar.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { HttpError } from '../services/todo.service.js';

export const calendarRouter = Router();
const expressRaw = express.raw({ type: 'application/octet-stream', limit: '10mb' });
calendarRouter.use(requireAuth);
calendarRouter.get('/events', getEvents);
calendarRouter.post('/events', requireCsrf, postEvent);
calendarRouter.patch('/events/:id', requireCsrf, patchEvent);
calendarRouter.delete('/events/:id', requireCsrf, removeEvent);
calendarRouter.get('/malayalam/pages', getMalayalamPages);
calendarRouter.post('/malayalam/pages', requireCsrf, (request, _response, next) => {
  if (request.is('application/octet-stream')) return next();
  next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the image as application/octet-stream.'));
}, expressRaw, postMalayalamPage);
calendarRouter.get('/malayalam/pages/:id/image', getMalayalamImage);
calendarRouter.delete('/malayalam/pages/:id', requireCsrf, removeMalayalamPage);
