import type { Request, Response } from 'express';
import { calendarEventSchema, calendarRangeSchema, malayalamPageSchema } from '../validation/calendar.schemas.js';
import {
  createCalendarEvent, createMalayalamPage, deleteCalendarEvent, deleteMalayalamPage,
  getMalayalamPageImage, listCalendarEvents, listMalayalamPages, updateCalendarEvent
} from '../services/calendar.service.js';
import { HttpError } from '../services/todo.service.js';
import { getCompanyHolidaysForCalendar } from '../services/leave.service.js';

const owner = (request: Request) => request.session.user!.id;
const idParam = (request: Request) => {
  const { id } = request.params;
  if (typeof id !== 'string') throw new HttpError(404, 'NOT_FOUND', 'Calendar item not found.');
  return id;
};

export async function getEvents(request: Request, response: Response) {
  const parsed = calendarRangeSchema.safeParse(request.query);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid calendar range.');
  const userId = owner(request);
  const [events, holidays] = await Promise.all([
    listCalendarEvents(userId, parsed.data),
    getCompanyHolidaysForCalendar(userId, new Date(parsed.data.from), new Date(parsed.data.to), parsed.data.timezone)
  ]);
  response.json({ success: true, data: { events, holidays } });
}
export async function postEvent(request: Request, response: Response) {
  const parsed = calendarEventSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid calendar event.');
  response.status(201).json({ success: true, data: { event: await createCalendarEvent(owner(request), parsed.data) } });
}
export async function patchEvent(request: Request, response: Response) {
  const parsed = calendarEventSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid calendar event.');
  response.json({ success: true, data: { event: await updateCalendarEvent(owner(request), idParam(request), parsed.data) } });
}
export async function removeEvent(request: Request, response: Response) {
  response.json({ success: true, data: await deleteCalendarEvent(owner(request), idParam(request)) });
}
export async function getMalayalamPages(request: Request, response: Response) {
  response.json({ success: true, data: { pages: await listMalayalamPages(owner(request)) } });
}
export async function postMalayalamPage(request: Request, response: Response) {
  const metadata = malayalamPageSchema.safeParse(request.query);
  if (!metadata.success) throw new HttpError(400, 'VALIDATION_ERROR', metadata.error.issues[0]?.message ?? 'Invalid calendar page details.');
  if (!Buffer.isBuffer(request.body)) throw new HttpError(400, 'INVALID_IMAGE', 'Upload an image file.');
  const contentType = request.get('content-type')?.split(';')[0]?.trim() ?? '';
  const page = await createMalayalamPage(owner(request), metadata.data, request.body, contentType);
  response.status(201).json({ success: true, data: { page: { ...page.toObject(), storageKey: undefined } } });
}
export async function getMalayalamImage(request: Request, response: Response) {
  const image = await getMalayalamPageImage(owner(request), idParam(request));
  response.set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.buffer.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(image.buffer);
}
export async function removeMalayalamPage(request: Request, response: Response) {
  response.json({ success: true, data: await deleteMalayalamPage(owner(request), idParam(request)) });
}
