import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { MalayalamCalendarPage } from '../models/MalayalamCalendarPage.js';
import { calendarEventSchema, calendarRangeSchema } from '../validation/calendar.schemas.js';
import { calendarImageType, createCalendarEvent, createMalayalamPage, deleteCalendarEvent, deleteMalayalamPage, expandEventOccurrences, getMalayalamPageImage, listCalendarEvents, zonedLocalToDate, updateCalendarEvent } from './calendar.service.js';

const owners = [new Types.ObjectId().toHexString(), new Types.ObjectId().toHexString()];
let ready = false;
before(async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in backend/.env before running calendar integration tests.');
  await mongoose.connect(process.env.MONGODB_URI); ready = true;
  await Promise.all([CalendarEvent.init(), MalayalamCalendarPage.init()]);
});
after(async () => {
  if (!ready) return;
  await Promise.all(owners.map(async (userId) => Promise.all([CalendarEvent.deleteMany({ userId }), MalayalamCalendarPage.deleteMany({ userId })])));
  await mongoose.disconnect();
});

const eventData = (fields: Record<string, unknown> = {}) => ({
  title: 'Planning session', description: 'Review milestones', startAt: '2026-03-06T15:00:00.000Z', endAt: '2026-03-06T16:00:00.000Z',
  allDay: false, timezone: 'America/New_York', color: 'teal', category: 'Work', importantDate: false, reminderMinutes: null, todoId: null, recurrence: null,
  ...fields
});
const range = (from: string, to: string, timezone = 'America/New_York') => ({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), timezone });

test('event validation rejects reversed time ranges and invalid timezones and validates recurrence', () => {
  assert.equal(calendarEventSchema.safeParse(eventData()).success, true);
  assert.equal(calendarEventSchema.safeParse(eventData({ endAt: '2026-03-06T14:00:00.000Z' })).success, false);
  assert.equal(calendarEventSchema.safeParse(eventData({ timezone: 'Mars/Olympus' })).success, false);
  assert.equal(calendarEventSchema.safeParse(eventData({ recurrence: { frequency: 'weekly', interval: 1 } })).success, false);
  assert.equal(calendarRangeSchema.safeParse({ ...range('2026-01-02T00:00Z', '2026-01-01T00:00Z'), timezone: 'UTC' }).success, false);
});

test('date navigation and recurrence preserve local wall time across a daylight-saving transition', () => {
  assert.equal(zonedLocalToDate('2026-03-08', 2, 30, 'America/New_York'), null, 'nonexistent spring-forward local time is rejected');
  const event = { ...eventData({ startAt: '2026-03-07T14:00:00.000Z', endAt: '2026-03-07T15:00:00.000Z', recurrence: { frequency: 'daily', interval: 1 } }), _id: 'sample' };
  const occurrences = expandEventOccurrences(event, range('2026-03-07T05:00:00Z', '2026-03-11T04:00:00Z'));
  assert.deepEqual(occurrences.map((item) => item.startAt), ['2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z', '2026-03-10T13:00:00.000Z']);
});

test('event CRUD is owner scoped and recurring rules expand within the requested range', async () => {
  const owner = owners[0]!; const other = owners[1]!;
  const event = await createCalendarEvent(owner, calendarEventSchema.parse(eventData({ recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] } })));
  const events = await listCalendarEvents(owner, range('2026-03-06T05:00:00Z', '2026-03-13T04:00:00Z'));
  assert.equal(events.length, 3);
  assert.equal(await CalendarEvent.countDocuments({ userId: other }), 0);
  assert.equal((await listCalendarEvents(other, range('2026-03-06T05:00:00Z', '2026-03-13T04:00:00Z'))).length, 0);
  await assert.rejects(updateCalendarEvent(other, String(event._id), calendarEventSchema.parse(eventData({ title: 'Intrusion' }))), (error: { status: number }) => error.status === 404);
  await assert.rejects(deleteCalendarEvent(other, String(event._id)), (error: { status: number }) => error.status === 404);
  const updated = await updateCalendarEvent(owner, String(event._id), calendarEventSchema.parse(eventData({ title: 'Updated session' })));
  assert.equal(updated.title, 'Updated session');
  assert.deepEqual(await deleteCalendarEvent(owner, String(event._id)), { deleted: true });
  assert.equal(await CalendarEvent.countDocuments({ _id: event._id }), 0);
});

test('Malayalam archive accepts supported image signatures and protects stored files by owner', async () => {
  const validPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  assert.equal(calendarImageType(validPng), 'image/png');
  assert.equal(calendarImageType(Buffer.from('plain text')), null);
  const page = await createMalayalamPage(owners[0]!, { year: 2026, month: 3, label: 'മലയാളം പേജ്', notes: '' }, validPng, 'image/png');
  const ownImage = await getMalayalamPageImage(owners[0]!, String(page._id));
  assert.equal(ownImage.mimeType, 'image/png');
  assert.deepEqual(ownImage.buffer, validPng);
  await assert.rejects(getMalayalamPageImage(owners[1]!, String(page._id)), (error: { status: number }) => error.status === 404);
  await assert.rejects(createMalayalamPage(owners[0]!, { year: 2026, month: 3, label: '', notes: '' }, Buffer.from('invalid image'), 'image/png'), (error: { status: number }) => error.status === 400);
  await assert.rejects(createMalayalamPage(owners[0]!, { year: 2026, month: 3, label: '', notes: '' }, Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png'), (error: { status: number }) => error.status === 400);
  assert.deepEqual(await deleteMalayalamPage(owners[0]!, String(page._id)), { deleted: true });
});
