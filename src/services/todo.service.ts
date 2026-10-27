import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import type { z } from 'zod';
import { Todo } from '../models/Todo.js';
import { createTodoSchema, updateTodoSchema } from '../validation/todo.schemas.js';

type CreateTodoInput = z.infer<typeof createTodoSchema>;
type UpdateTodoInput = z.infer<typeof updateTodoSchema>;

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function nextOccurrence(dueAt: Date, rule: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[]; dayOfMonth?: number; endDate?: string }): Date | null {
  const next = new Date(dueAt);
  if (rule.frequency === 'daily') {
    next.setUTCDate(next.getUTCDate() + rule.interval);
  } else if (rule.frequency === 'weekly') {
    const weekdays = rule.daysOfWeek ?? [];
    for (let offset = 1; offset <= 7 * rule.interval; offset += 1) {
      const candidate = new Date(dueAt);
      candidate.setUTCDate(candidate.getUTCDate() + offset);
      const mondayStartWeek = (date: Date) => {
        const day = (date.getUTCDay() + 6) % 7;
        const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
        return monday;
      };
      const weeks = Math.floor((mondayStartWeek(candidate).getTime() - mondayStartWeek(dueAt).getTime()) / (7 * 86400000));
      if (weeks % rule.interval === 0 && weekdays.includes(candidate.getUTCDay())) return withinEnd(candidate, rule.endDate);
    }
    return null;
  } else {
    const day = rule.dayOfMonth ?? dueAt.getUTCDate();
    const first = new Date(Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth() + rule.interval, 1, dueAt.getUTCHours(), dueAt.getUTCMinutes(), dueAt.getUTCSeconds(), dueAt.getUTCMilliseconds()));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(day, lastDay));
    return withinEnd(first, rule.endDate);
  }
  return withinEnd(next, rule.endDate);
}

function withinEnd(date: Date, endDate?: string): Date | null {
  return endDate && date > new Date(endDate) ? null : date;
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export async function listTodos(userId: string, query: {
  filter: 'today' | 'upcoming' | 'all' | 'completed' | 'overdue'; search: string; priority?: string; status?: string;
  sort: string; order: 'asc' | 'desc'; page: number; limit: number; from?: string; to?: string;
}) {
  const filter: Record<string, unknown> = { userId };
  const now = new Date();
  if (query.filter === 'completed') filter.status = 'completed';
  else if (query.filter === 'overdue') {
    const startOfToday = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    filter.$and = [{ status: { $ne: 'completed' } }, { $or: [
      { dueTimeSet: true, dueAt: { $lt: now } },
      { dueTimeSet: { $ne: true }, dueAt: { $lt: startOfToday } }
    ] }];
  }
  else if (query.filter === 'today') {
    if (!query.from || !query.to) throw new HttpError(400, 'DATE_RANGE_REQUIRED', 'Today view needs a date range.');
    filter.dueAt = { $gte: new Date(query.from), $lt: new Date(query.to) };
    filter.status = { $ne: 'completed' };
  } else if (query.filter === 'upcoming') {
    filter.dueAt = query.from ? { $gte: new Date(query.from) } : { $gte: now };
    filter.status = { $ne: 'completed' };
    if (query.to) (filter.dueAt as Record<string, Date>).$lt = new Date(query.to);
  }
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.search) {
    const matcher = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: matcher }, { description: matcher }, { label: matcher }];
  }
  const sortDirection = query.order === 'asc' ? 1 : -1;
  const mongoFilter = { ...filter, userId: new Types.ObjectId(userId) };
  const itemsQuery = query.sort === 'priority'
    ? Todo.aggregate([
        { $match: mongoFilter },
        { $addFields: { priorityRank: { $switch: { branches: [
          { case: { $eq: ['$priority', 'low'] }, then: 1 },
          { case: { $eq: ['$priority', 'medium'] }, then: 2 },
          { case: { $eq: ['$priority', 'high'] }, then: 3 }
        ], default: 0 } } } },
        { $sort: { priorityRank: sortDirection, _id: 1 } },
        { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }, { $project: { priorityRank: 0 } }
      ])
    : Todo.find(filter).sort({ [query.sort]: sortDirection, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean();
  const [items, total] = await Promise.all([
    itemsQuery,
    Todo.countDocuments(filter)
  ]);
  return { items, page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total };
}

export async function createTodo(userId: string, input: CreateTodoInput) {
  if (input.clientRequestId) {
    const existing = await Todo.findOne({ userId, clientRequestId: input.clientRequestId });
    if (existing) return existing;
  }
  const todo = new Todo({ ...input, userId, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, recurrence: input.recurrence ? { ...input.recurrence, endDate: input.recurrence.endDate ? new Date(input.recurrence.endDate) : undefined } : undefined });
  if (input.recurrence) {
    todo.recurrenceSeriesId = randomUUID();
    todo.occurrenceKey = todo.dueAt!.toISOString();
  }
  try {
    await todo.save();
    return todo;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000 && input.clientRequestId) {
      const existing = await Todo.findOne({ userId, clientRequestId: input.clientRequestId });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function setTodoCompletedIfCurrent(userId: string, id: string, completed: boolean, expectedUpdatedAt: string) {
  return setTodoCompleted(userId, id, completed, expectedUpdatedAt);
}

export async function updateTodo(userId: string, id: string, input: UpdateTodoInput) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const current = await Todo.findOne({ _id: id, userId });
  if (!current) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  if (input.status === 'completed') throw new HttpError(400, 'USE_COMPLETION_ACTION', 'Use the completion action to complete a task.');
  if (current.status === 'completed' && input.status) {
    throw new HttpError(409, 'USE_REOPEN_ACTION', 'Use the reopen action before changing a completed task.');
  }
  if (current.spawnedTodoId && (input.recurrence !== undefined || input.dueAt !== undefined)) {
    throw new HttpError(409, 'RECURRENCE_ALREADY_STARTED', 'This occurrence already created its next task; edit the upcoming task instead.');
  }
  const effectiveRecurrence = input.recurrence !== undefined ? input.recurrence : current.recurrence;
  const effectiveDue = input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : undefined) : current.dueAt;
  if (effectiveRecurrence && !effectiveDue) throw new HttpError(400, 'INVALID_RECURRENCE', 'A due date is required for recurring tasks.');
  if (effectiveRecurrence?.endDate && effectiveDue && new Date(effectiveRecurrence.endDate).getTime() < effectiveDue.getTime()) {
    throw new HttpError(400, 'INVALID_RECURRENCE', 'Recurrence end must be on or after the due date.');
  }
  const changes: Record<string, unknown> = { ...input };
  const unset: Record<string, 1> = {};
  if (input.dueAt !== undefined) {
    if (input.dueAt === null) { delete changes.dueAt; unset.dueAt = 1; changes.dueTimeSet = false; }
    else changes.dueAt = new Date(input.dueAt);
  }
  if (input.recurrence !== undefined) {
    if (input.recurrence === null) {
      delete changes.recurrence;
      unset.recurrence = 1;
      unset.recurrenceSeriesId = 1;
      unset.occurrenceKey = 1;
    } else changes.recurrence = { ...input.recurrence, endDate: input.recurrence.endDate ? new Date(input.recurrence.endDate) : undefined };
  }
  if (input.recurrence === null) {
    delete changes.recurrenceSeriesId;
    delete changes.occurrenceKey;
  } else if (effectiveRecurrence && effectiveDue) {
    changes.recurrenceSeriesId = current.recurrenceSeriesId ?? randomUUID();
    changes.occurrenceKey = effectiveDue.toISOString();
  }
  if (input.status) unset.completedAt = 1;
  const update: Record<string, unknown> = { $set: changes };
  if (Object.keys(unset).length) update.$unset = unset;
  const todo = await Todo.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true });
  if (!todo) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  return todo;
}

export async function deleteTodo(userId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const todo = await Todo.findOneAndDelete({ _id: id, userId });
  if (!todo) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
}

export async function setTodoCompleted(userId: string, id: string, completed: boolean, expectedUpdatedAt?: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const current = await Todo.findOne({ _id: id, userId });
  if (!current) {
    if (expectedUpdatedAt && await Todo.exists({ _id: id, userId })) throw new HttpError(409, 'TODO_CHANGED', 'This task changed on the server. Reload it before applying your offline change.');
    throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  }
  if (expectedUpdatedAt && current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new HttpError(409, 'TODO_CHANGED', 'This task changed on the server. Reload it before applying your offline change.');
  }
  if ((current.status === 'completed') === completed) return { todo: current, nextTodo: null };

  const needsTransaction = completed
    ? Boolean(current.recurrence && current.dueAt && current.recurrenceSeriesId)
    : Boolean(current.spawnedTodoId);
  if (!needsTransaction) {
    const update = completed
      ? { $set: { status: 'completed', completedAt: new Date() } }
      : { $set: { status: 'pending' }, $unset: { completedAt: 1 } };
    const todo = await Todo.findOneAndUpdate(
      { _id: id, userId, updatedAt: current.updatedAt },
      update,
      { new: true, runValidators: true }
    );
    if (!todo) throw new HttpError(409, 'TODO_CHANGED', 'This task changed on the server. Reload it before applying your change.');
    return { todo, nextTodo: null };
  }

  const session = await mongoose.startSession();
  const result: { todo: unknown; nextTodo: unknown } = { todo: null, nextTodo: null };
  try {
    await session.withTransaction(async () => {
      const query: Record<string, unknown> = { _id: id, userId };
      if (expectedUpdatedAt) query.updatedAt = new Date(expectedUpdatedAt);
      const todo = await Todo.findOne(query).session(session);
      if (!todo) {
        if (expectedUpdatedAt && await Todo.exists({ _id: id, userId }).session(session)) throw new HttpError(409, 'TODO_CHANGED', 'This task changed on the server. Reload it before applying your offline change.');
        throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
      }
      if (completed) {
        if (todo.status === 'completed') { result.todo = todo; return; }
        todo.status = 'completed';
        todo.completedAt = new Date();
        if (todo.recurrence && todo.dueAt && todo.recurrenceSeriesId) {
          const rule = {
            frequency: todo.recurrence.frequency,
            interval: todo.recurrence.interval,
            daysOfWeek: todo.recurrence.daysOfWeek ?? undefined,
            dayOfMonth: todo.recurrence.dayOfMonth ?? undefined,
            endDate: todo.recurrence.endDate?.toISOString()
          };
          const nextDue = nextOccurrence(todo.dueAt, rule);
          if (nextDue) {
            const occurrenceKey = nextDue.toISOString();
            let next = await Todo.findOne({ userId, recurrenceSeriesId: todo.recurrenceSeriesId, occurrenceKey }).session(session);
            if (!next) {
              [next] = await Todo.create([{
                userId, title: todo.title, description: todo.description, priority: todo.priority, status: 'pending',
                dueAt: nextDue, dueTimeSet: todo.dueTimeSet, label: todo.label, subtasks: todo.subtasks.map((item) => ({ id: randomUUID(), title: item.title, completed: false })),
                recurrence: rule, recurrenceSeriesId: todo.recurrenceSeriesId, occurrenceKey
              }], { session });
            }
            todo.spawnedTodoId = next._id;
            result.nextTodo = next;
          }
        }
        await todo.save({ session });
        result.todo = todo;
      } else {
        if (todo.status !== 'completed') { result.todo = todo; return; }
        if (todo.spawnedTodoId) {
          const successor = await Todo.findOne({ _id: todo.spawnedTodoId, userId }).session(session);
          if (successor && successor.status !== 'pending') throw new HttpError(409, 'RECURRENCE_ALREADY_STARTED', 'This recurring task cannot be reopened because its next occurrence has started.');
          if (successor) await Todo.deleteOne({ _id: successor._id, userId }, { session });
          todo.spawnedTodoId = undefined;
        }
        todo.status = 'pending';
        todo.completedAt = undefined;
        await todo.save({ session });
        result.todo = todo;
      }
    });
    return result;
  } finally { await session.endSession(); }
}

