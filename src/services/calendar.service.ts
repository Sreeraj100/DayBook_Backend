import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import type { z } from 'zod';
import { env } from '../config/env.js';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { MalayalamCalendarPage } from '../models/MalayalamCalendarPage.js';
import { Todo } from '../models/Todo.js';
import type { calendarEventSchema, calendarRangeSchema, malayalamPageSchema } from '../validation/calendar.schemas.js';
import { HttpError } from './todo.service.js';

type EventInput = z.infer<typeof calendarEventSchema>;
type RangeInput = z.infer<typeof calendarRangeSchema>;
type PageInput = z.infer<typeof malayalamPageSchema>;
type CalendarEventLike = {
  _id?: unknown;
  startAt: string | Date;
  endAt: string | Date;
  timezone: string;
  recurrence?: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; daysOfWeek?: number[]; dayOfMonth?: number; endDate?: string | Date } | null;
  [key: string]: unknown;
};
const storageRoot = resolve(env.CALENDAR_UPLOAD_DIR || resolve(fileURLToPath(new URL('../../', import.meta.url)), 'storage', 'calendar-pages'));

function partsAt(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => values.find((item) => item.type === type)?.value ?? '0';
  return { year: Number(part('year')), month: Number(part('month')), day: Number(part('day')), hour: Number(part('hour')), minute: Number(part('minute')), second: Number(part('second')) };
}

function dateKey(date: { year: number; month: number; day: number }) { return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`; }
function plusDays(key: string, days: number) { const [y, m, d] = key.split('-').map(Number); const date = new Date(Date.UTC(y!, m! - 1, d! + days)); return dateKey({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }); }
function dayDifference(a: string, b: string) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }

export function zonedLocalToDate(key: string, hour: number, minute: number, timezone: string): Date | null {
  const [year, month, day] = key.split('-').map(Number);
  const wanted = Date.UTC(year!, month! - 1, day!, hour, minute);
  let instant = wanted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = partsAt(new Date(instant), timezone);
    const represented = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    const adjustment = wanted - represented;
    if (adjustment === 0) return new Date(instant);
    instant += adjustment;
  }
  const actual = partsAt(new Date(instant), timezone);
  return actual.year === year && actual.month === month && actual.day === day && actual.hour === hour && actual.minute === minute ? new Date(instant) : null;
}

function weekStart(key: string) { const [y, m, d] = key.split('-').map(Number); const date = new Date(Date.UTC(y!, m! - 1, d!)); const weekday = (date.getUTCDay() + 6) % 7; return plusDays(key, -weekday); }
function occurrenceMatches(key: string, rootKey: string, rule: NonNullable<EventInput['recurrence']>) {
  const [ry, rm, rd] = rootKey.split('-').map(Number); const [y, m] = key.split('-').map(Number);
  const dayDelta = dayDifference(rootKey, key);
  if (rule.frequency === 'daily') return dayDelta >= 0 && dayDelta % rule.interval === 0;
  if (rule.frequency === 'weekly') {
    const weeks = Math.floor(dayDifference(weekStart(rootKey), weekStart(key)) / 7);
    const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
    return dayDelta >= 0 && weeks >= 0 && weeks % rule.interval === 0 && (rule.daysOfWeek ?? []).includes(weekday);
  }
  if (rule.frequency === 'monthly') {
    const months = (y! - ry!) * 12 + (m! - rm!);
    const expected = rule.dayOfMonth ?? rd!;
    const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    return months >= 0 && months % rule.interval === 0 && Number(key.slice(-2)) === Math.min(expected, lastDay);
  }
  const years = y! - ry!;
  const [rootYear, rootMonth, rootDay] = rootKey.split('-').map(Number);
  void rootYear;
  const expectedDay = rule.dayOfMonth ?? rootDay!;
  const lastDay = new Date(Date.UTC(y!, rootMonth!, 0)).getUTCDate();
  return years >= 0 && years % rule.interval === 0 && m === rootMonth && Number(key.slice(-2)) === Math.min(expectedDay, lastDay);
}

export function expandEventOccurrences(event: CalendarEventLike, range: RangeInput) {
  const zone = event.timezone as string;
  const start = new Date(event.startAt); const end = new Date(event.endAt);
  const baseStart = partsAt(start, zone); const baseEnd = partsAt(end, zone);
  const rootKey = dateKey(baseStart);
  const fromKey = dateKey(partsAt(new Date(range.from), zone));
  const toKey = dateKey(partsAt(new Date(range.to), zone));
  const minKey = fromKey > rootKey ? fromKey : rootKey;
  const maxKey = toKey;
  const rootDayOffset = dayDifference(rootKey, dateKey(baseEnd));
  const rule = event.recurrence as NonNullable<EventInput['recurrence']> | undefined;
  const output: Array<Record<string, unknown>> = [];
  const add = (key: string) => {
    const startAt = zonedLocalToDate(key, baseStart.hour, baseStart.minute, zone);
    const endKey = plusDays(key, rootDayOffset);
    const endAt = zonedLocalToDate(endKey, baseEnd.hour, baseEnd.minute, zone);
    if (!startAt || !endAt || endAt <= startAt || startAt >= new Date(range.to) || endAt <= new Date(range.from)) return;
    output.push({ ...event, seriesStartAt: start.toISOString(), seriesEndAt: end.toISOString(), startAt: startAt.toISOString(), endAt: endAt.toISOString(), occurrenceKey: key });
  };
  if (!rule) { add(rootKey); return output; }
  const lastOccurrence = rule.endDate ? dateKey(partsAt(new Date(rule.endDate), zone)) : maxKey;
  const lastKey = lastOccurrence < maxKey ? lastOccurrence : maxKey;
  let cursor = minKey;
  if (cursor < rootKey) cursor = rootKey;
  for (let checked = 0; cursor <= lastKey && checked < 367; checked += 1, cursor = plusDays(cursor, 1)) {
    if (occurrenceMatches(cursor, rootKey, rule)) add(cursor);
  }
  return output;
}

function assertId(id: string) { if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Calendar event not found.'); }
export async function listCalendarEvents(userId: string, range: RangeInput) {
  const from = new Date(range.from); const to = new Date(range.to);
  const events = await CalendarEvent.find({ userId, $or: [
    { startAt: { $lt: to }, endAt: { $gt: from } },
    { recurrence: { $exists: true }, startAt: { $lt: to }, $or: [{ 'recurrence.endDate': { $exists: false } }, { 'recurrence.endDate': { $gte: from } }] }
  ] }).sort({ startAt: 1 }).limit(2000).lean();
  return events.flatMap((event) => expandEventOccurrences(event as unknown as CalendarEventLike, range)).sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}
export async function createCalendarEvent(userId: string, input: EventInput) {
  if (input.todoId && !await Todo.exists({ _id: input.todoId, userId })) throw new HttpError(400, 'TODO_NOT_FOUND', 'Linked task was not found.');
  return CalendarEvent.create({ ...input, userId, startAt: new Date(input.startAt), endAt: new Date(input.endAt), todoId: input.todoId ?? undefined, recurrence: input.recurrence ? { ...input.recurrence, endDate: input.recurrence.endDate ? new Date(input.recurrence.endDate) : undefined } : undefined, seriesId: input.recurrence ? randomUUID() : undefined });
}
export async function updateCalendarEvent(userId: string, id: string, input: EventInput) {
  assertId(id);
  if (input.todoId && !await Todo.exists({ _id: input.todoId, userId })) throw new HttpError(400, 'TODO_NOT_FOUND', 'Linked task was not found.');
  const event = await CalendarEvent.findOne({ _id: id, userId });
  if (!event) throw new HttpError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Calendar event not found.');
  event.set({ ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt), todoId: input.todoId ?? undefined, recurrence: input.recurrence ? { ...input.recurrence, endDate: input.recurrence.endDate ? new Date(input.recurrence.endDate) : undefined } : undefined, seriesId: input.recurrence ? event.seriesId ?? randomUUID() : undefined });
  return event.save();
}
export async function deleteCalendarEvent(userId: string, id: string) {
  assertId(id);
  const result = await CalendarEvent.deleteOne({ _id: id, userId });
  if (!result.deletedCount) throw new HttpError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Calendar event not found.');
  return { deleted: true };
}

export async function listMalayalamPages(userId: string) { return MalayalamCalendarPage.find({ userId }).select('-storageKey').sort({ year: -1, month: 1, createdAt: -1 }).lean(); }
export function calendarImageType(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export async function createMalayalamPage(userId: string, input: PageInput, buffer: Buffer, declaredType: string) {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpError(400, 'INVALID_IMAGE', 'Choose an image smaller than 10 MB.');
  const mimeType = calendarImageType(buffer);
  if (!mimeType || mimeType !== declaredType) throw new HttpError(400, 'INVALID_IMAGE', 'Upload a valid JPEG, PNG, or WebP image.');
  await mkdir(storageRoot, { recursive: true });
  const storageKey = `${randomUUID()}.image`;
  const filePath = join(storageRoot, storageKey);
  await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  try { return await MalayalamCalendarPage.create({ ...input, userId, storageKey, mimeType, sizeBytes: buffer.length }); }
  catch (error) { await unlink(filePath).catch(() => undefined); throw error; }
}
export async function getMalayalamPageImage(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'CALENDAR_PAGE_NOT_FOUND', 'Calendar page not found.');
  const page = await MalayalamCalendarPage.findOne({ _id: id, userId }).lean();
  if (!page) throw new HttpError(404, 'CALENDAR_PAGE_NOT_FOUND', 'Calendar page not found.');
  try { return { buffer: await readFile(join(storageRoot, page.storageKey)), mimeType: page.mimeType }; }
  catch { throw new HttpError(404, 'CALENDAR_IMAGE_MISSING', 'This image is no longer available.'); }
}
export async function deleteMalayalamPage(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'CALENDAR_PAGE_NOT_FOUND', 'Calendar page not found.');
  const page = await MalayalamCalendarPage.findOneAndDelete({ _id: id, userId });
  if (!page) throw new HttpError(404, 'CALENDAR_PAGE_NOT_FOUND', 'Calendar page not found.');
  await unlink(join(storageRoot, page.storageKey)).catch(() => undefined);
  return { deleted: true };
}
