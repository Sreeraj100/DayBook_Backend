import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { nextOccurrence, setTodoCompleted } from './todo.service.js';
import { createTodoSchema } from '../validation/todo.schemas.js';
import { Todo } from '../models/Todo.js';

const completionTestUser = new Types.ObjectId();
let databaseReady = false;

before(async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in backend/.env before running Todo integration tests.');
  await mongoose.connect(process.env.MONGODB_URI);
  databaseReady = true;
  await Todo.init();
});

after(async () => {
  if (!databaseReady) return;
  await Todo.deleteMany({ userId: completionTestUser });
  await mongoose.disconnect();
});

test('daily recurrence advances by the selected interval and keeps its time', () => {
  const next = nextOccurrence(new Date('2026-10-11T09:30:00.000Z'), { frequency: 'daily', interval: 2 });
  assert.equal(next?.toISOString(), '2026-10-13T09:30:00.000Z');
});

test('weekly recurrence selects the next matching weekday', () => {
  const next = nextOccurrence(new Date('2026-10-11T09:30:00.000Z'), { frequency: 'weekly', interval: 1, daysOfWeek: [1, 3] });
  assert.equal(next?.toISOString(), '2026-10-12T09:30:00.000Z');
});

test('monthly recurrence clamps the requested day to month end', () => {
  const next = nextOccurrence(new Date('2026-01-31T09:30:00.000Z'), { frequency: 'monthly', interval: 1, dayOfMonth: 31 });
  assert.equal(next?.toISOString(), '2026-02-28T09:30:00.000Z');
});

test('recurrence stops after its end date', () => {
  const next = nextOccurrence(new Date('2026-10-11T09:30:00.000Z'), { frequency: 'daily', interval: 1, endDate: '2026-10-11T23:59:00.000Z' });
  assert.equal(next, null);
});

test('weekly rules require at least one weekday', () => {
  const parsed = createTodoSchema.safeParse({ title: 'Plan the week', dueAt: '2026-10-12T09:00:00.000Z', recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [] } });
  assert.equal(parsed.success, false);
});

test('a recurring task requires its first due date', () => {
  const parsed = createTodoSchema.safeParse({ title: 'Pay rent', recurrence: { frequency: 'monthly', interval: 1, dayOfMonth: 1 } });
  assert.equal(parsed.success, false);
});

test('offline task retries accept a UUID request key and the database enforces one task per owner and key', () => {
  const requestId = '4b55e6c6-545c-4a7a-a0d0-fd1ba44d1913';
  assert.equal(createTodoSchema.safeParse({ title: 'A queued task', clientRequestId: requestId }).success, true);
  assert.equal(createTodoSchema.safeParse({ title: 'A queued task', clientRequestId: 'not-a-uuid' }).success, false);
  const index = Todo.schema.indexes().find(([keys, options]) => keys.userId === 1 && keys.clientRequestId === 1 && options.unique === true);
  assert.ok(index, 'a retried idempotency key must not create a second todo for its owner');
});

test('ordinary task completion and reopening work without MongoDB transactions', async () => {
  const todo = await Todo.create({ userId: completionTestUser, title: 'Local Mongo completion check' });
  const completed = await setTodoCompleted(completionTestUser.toHexString(), todo.id, true);
  assert.equal((completed.todo as { status: string }).status, 'completed');

  const reopened = await setTodoCompleted(completionTestUser.toHexString(), todo.id, false);
  assert.equal((reopened.todo as { status: string }).status, 'pending');
  assert.equal((reopened.todo as { completedAt?: Date }).completedAt, undefined);
});
