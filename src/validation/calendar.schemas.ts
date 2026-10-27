import { z } from 'zod';

const timezone = z.string().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Choose a valid timezone.');
const recurrence = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endDate: z.string().datetime({ offset: true }).optional()
}).strict().superRefine((value, ctx) => {
  if (value.frequency === 'weekly' && !value.daysOfWeek?.length) ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Choose at least one weekday.' });
  if (value.frequency !== 'weekly' && value.daysOfWeek) ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Weekdays only apply to weekly recurrence.' });
  if (!['monthly', 'yearly'].includes(value.frequency) && value.dayOfMonth) ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Day of month only applies to monthly or yearly recurrence.' });
});

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1).max(160), description: z.string().max(3000).optional().default(''),
  startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }),
  allDay: z.boolean().optional().default(false), timezone,
  color: z.enum(['teal', 'blue', 'violet', 'amber', 'rose', 'green']).default('teal'),
  category: z.string().trim().max(48).optional().default(''), importantDate: z.boolean().optional().default(false),
  reminderMinutes: z.number().int().min(0).max(10080).optional().nullable(), todoId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  recurrence: recurrence.optional().nullable()
}).strict().superRefine((value, ctx) => {
  if (new Date(value.endAt) <= new Date(value.startAt)) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End time must be after the start time.' });
  if (value.recurrence?.endDate && new Date(value.recurrence.endDate) < new Date(value.startAt)) ctx.addIssue({ code: 'custom', path: ['recurrence', 'endDate'], message: 'Recurrence end must be on or after the event start.' });
});

export const calendarRangeSchema = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), timezone }).strict().refine((value) => new Date(value.to) > new Date(value.from) && new Date(value.to).getTime() - new Date(value.from).getTime() <= 367 * 86400000, 'Calendar range must be positive and no longer than one year.');

export const malayalamPageSchema = z.object({ year: z.coerce.number().int().min(1900).max(2200), month: z.coerce.number().int().min(1).max(12), label: z.string().trim().max(120).optional().default(''), notes: z.string().trim().max(1000).optional().default('') }).strict();
