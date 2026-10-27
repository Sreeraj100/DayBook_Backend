import cors from 'cors';
import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { env, frontendOrigins } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { todoRouter } from './routes/todo.routes.js';
import { diaryRouter } from './routes/diary.routes.js';
import { financeRouter } from './routes/finance.routes.js';
import { calendarRouter } from './routes/calendar.routes.js';
import { leaveRouter } from './routes/leave.routes.js';
import { HttpError } from './services/todo.service.js';

export const app = express();

app.disable('x-powered-by');
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: (origin, callback) => callback(null, !origin || frontendOrigins.includes(origin)), credentials: true }));
app.use(express.json({ limit: '96kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_request, response) => response.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } }) }));
app.use(session({
  name: 'daybook.sid',
  secret: env.SESSION_SECRET,
  store: MongoStore.create({ mongoUrl: env.MONGODB_URI, collectionName: 'sessions', ttl: 60 * 60 * 24 * 14 }),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14, path: '/' }
}));

app.get('/api/health', (_request, response) => {
  const ready = mongoose.connection.readyState === 1;
  if (!ready) {
    response.status(503).json({ success: false, error: { code: 'NOT_READY', message: 'Service is not ready.' } });
    return;
  }
  response.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRouter);
app.use('/api/todos', todoRouter);
app.use('/api/diary', diaryRouter);
app.use('/api/finance', financeRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/leaves', leaveRouter);

app.use((_request, response) => {
  response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next;
  if (error instanceof HttpError) {
    response.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
    return;
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    response.status(409).json({ success: false, error: { code: 'DUPLICATE_RECORD', message: 'This record already exists.' } });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    response.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'One or more fields are invalid.' } });
    return;
  }
  if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
    response.status(413).json({ success: false, error: { code: 'UPLOAD_TOO_LARGE', message: 'Image must be 10 MB or smaller.' } });
    return;
  }
  response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
});
