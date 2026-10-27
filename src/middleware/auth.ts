import type { NextFunction, Request, Response } from 'express';
import { frontendOrigins } from '../config/env.js';
import { HttpError } from '../services/todo.service.js';

export type SessionUser = { id: string; email: string };
declare module 'express-session' { interface SessionData { user?: SessionUser; csrfToken?: string } }

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  if (!request.session.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
  next();
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction) {
  const origin = request.get('origin');
  if (!origin || !frontendOrigins.includes(origin)) {
    return next(new HttpError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.'));
  }
  const token = request.get('x-csrf-token');
  if (!token || !request.session.csrfToken || token !== request.session.csrfToken) {
    return next(new HttpError(403, 'CSRF_INVALID', 'Refresh the page and try again.'));
  }
  next();
}
