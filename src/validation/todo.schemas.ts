import { z } from 'zod';

const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(365),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endDate: z.string().datetime({ offset: true }).optional()
}).strict().superRefine((rule, context) => {
  if (rule.frequency === 'weekly' && (!rule.daysOfWeek || rule.daysOfWeek.length === 0)) {
    context.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Choose at least one weekday for weekly recurrence.' });
  }
  if (rule.frequency !== 'weekly' && rule.daysOfWeek !== undefined) {
    context.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Weekdays are only used for weekly recurrence.' });
  }
  if (rule.frequency !== 'monthly' && rule.dayOfMonth !== undefined) {
    context.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Day of month is only used for monthly recurrence.' });
  }
});

const subtaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  completed: z.boolean().default(false)
}).strict();

const todoFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(3000).optional().default(''),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  dueTimeSet: z.boolean().optional().default(false),
  label: z.string().trim().max(48).optional().default(''),
  subtasks: z.array(subtaskSchema).max(30).optional().default([]),
  recurrence: recurrenceSchema.optional().nullable()
};

export const createTodoSchema = z.object({ ...todoFields, clientRequestId: z.string().uuid().optional() }).strict().superRefine((todo, context) => {
  if (todo.status === 'completed') context.addIssue({ code: 'custom', path: ['status'], message: 'Create the task first, then mark it completed.' });
  if (todo.dueTimeSet && !todo.dueAt) context.addIssue({ code: 'custom', path: ['dueAt'], message: 'A due time needs a due date.' });
  if (todo.recurrence && !todo.dueAt) {
    context.addIssue({ code: 'custom', path: ['dueAt'], message: 'A due date is required for recurring tasks.' });
  }
  if (todo.recurrence?.endDate && todo.dueAt && new Date(todo.recurrence.endDate) < new Date(todo.dueAt)) {
    context.addIssue({ code: 'custom', path: ['recurrence', 'endDate'], message: 'Recurrence end must be on or after the first due date.' });
  }
});

export const updateTodoSchema = z.object({
  ...todoFields,
  title: todoFields.title.optional(),
  description: todoFields.description.optional(),
  priority: todoFields.priority.optional(),
  status: todoFields.status.optional(),
  dueAt: todoFields.dueAt.optional(),
  dueTimeSet: todoFields.dueTimeSet.optional(),
  label: todoFields.label.optional(),
  subtasks: todoFields.subtasks.optional(),
  recurrence: todoFields.recurrence.optional()
}).strict().refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field to update.' }).superRefine((todo, context) => {
  if (todo.recurrence && todo.dueAt === null) {
    context.addIssue({ code: 'custom', path: ['dueAt'], message: 'A due date is required for recurring tasks.' });
  }
  if (todo.dueTimeSet && todo.dueAt === null) context.addIssue({ code: 'custom', path: ['dueAt'], message: 'A due time needs a due date.' });
  if (todo.recurrence?.endDate && todo.dueAt && todo.dueAt !== null && new Date(todo.recurrence.endDate) < new Date(todo.dueAt)) {
    context.addIssue({ code: 'custom', path: ['recurrence', 'endDate'], message: 'Recurrence end must be on or after the due date.' });
  }
});

export const todoListQuerySchema = z.object({
  filter: z.enum(['today', 'upcoming', 'all', 'completed', 'overdue']).default('all'),
  search: z.string().trim().max(100).default(''),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  sort: z.enum(['dueAt', 'createdAt', 'priority', 'title', 'updatedAt']).default('dueAt'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
}).strict();

export const authRegisterSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128)
}).strict();

export const authLoginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();
