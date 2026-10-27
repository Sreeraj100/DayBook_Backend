import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { User } from '../models/User.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { authLoginSchema, authRegisterSchema } from '../validation/todo.schemas.js';
import { HttpError } from '../services/todo.service.js';

function regenerate(request: Request) { return new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve())); }
function save(request: Request) { return new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve())); }
function publicUser(user: { _id: unknown; email: string }) { return { id: String(user._id), email: user.email }; }

export async function csrfToken(request: Request, response: Response) {
  request.session.csrfToken ??= randomBytes(32).toString('hex');
  await save(request);
  response.json({ success: true, data: { csrfToken: request.session.csrfToken } });
}

export async function currentUser(request: Request, response: Response) {
  response.json({ success: true, data: { user: request.session.user ?? null } });
}

export async function register(request: Request, response: Response) {
  const parsed = authRegisterSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid registration details.');
  const exists = await User.exists({ email: parsed.data.email });
  if (exists) throw new HttpError(409, 'EMAIL_IN_USE', 'An account with that email already exists.');
  const user = await User.create({ email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) });
  await regenerate(request);
  request.session.user = { id: user.id, email: user.email };
  request.session.csrfToken = randomBytes(32).toString('hex');
  await save(request);
  response.status(201).json({ success: true, data: { user: publicUser(user) } });
}

export async function login(request: Request, response: Response) {
  const parsed = authLoginSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid sign-in details.');
  const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  await regenerate(request);
  request.session.user = { id: user.id, email: user.email };
  request.session.csrfToken = randomBytes(32).toString('hex');
  await save(request);
  response.json({ success: true, data: { user: publicUser(user) } });
}

export async function logout(request: Request, response: Response) {
  await new Promise<void>((resolve, reject) => request.session.destroy((error) => error ? reject(error) : resolve()));
  response.clearCookie('daybook.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  response.json({ success: true, data: { loggedOut: true } });
}
