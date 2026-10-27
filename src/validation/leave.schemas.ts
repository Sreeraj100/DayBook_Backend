import { z } from 'zod';

export const leaveTypeSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(['teal', 'blue', 'violet', 'amber', 'rose', 'green']).default('teal'), entitlementDays: z.number().min(0).max(365).multipleOf(0.5), active: z.boolean().default(true) }).strict();
export const leavePolicySchema = z.object({ workingDaysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, 'Each weekday can only be selected once.'), excludeCompanyHolidays: z.boolean() }).strict();
export const companyHolidaySchema = z.object({ title: z.string().trim().min(1).max(120), dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((key) => { const [year, month, day] = key.split('-').map(Number); const date = new Date(Date.UTC(year!, month! - 1, day!)); return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day; }, 'Enter a real calendar date.'), notes: z.string().trim().max(1000).optional().default('') }).strict();
export const leaveRecordSchema = z.object({ leaveTypeId: z.string().regex(/^[a-f\d]{24}$/i), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), halfDay: z.boolean().default(false), halfDayPeriod: z.enum(['morning', 'afternoon']).optional(), status: z.enum(['planned', 'taken', 'cancelled']).default('planned'), note: z.string().trim().max(1000).optional().default('') }).strict().superRefine((record, context) => {
  const realDate = (key: string) => { const [year, month, day] = key.split('-').map(Number); const date = new Date(Date.UTC(year!, month! - 1, day!)); return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day; };
  if (!realDate(record.startDate)) context.addIssue({ code: 'custom', path: ['startDate'], message: 'Enter a real calendar date.' });
  if (!realDate(record.endDate)) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Enter a real calendar date.' });
  if (record.endDate < record.startDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after start date.' });
  if (record.endDate > addCalendarDays(record.startDate, 365)) context.addIssue({ code: 'custom', path: ['endDate'], message: 'A leave range cannot exceed 366 calendar days.' });
  if (record.halfDay && record.startDate !== record.endDate) context.addIssue({ code: 'custom', path: ['halfDay'], message: 'Half-day leave must be a single day.' });
  if (record.halfDay && !record.halfDayPeriod) context.addIssue({ code: 'custom', path: ['halfDayPeriod'], message: 'Choose morning or afternoon for half-day leave.' });
  if (!record.halfDay && record.halfDayPeriod) context.addIssue({ code: 'custom', path: ['halfDayPeriod'], message: 'A half-day period is only used for half-day leave.' });
});

function addCalendarDays(key: string, days: number) { const [year, month, day] = key.split('-').map(Number); const date = new Date(Date.UTC(year!, month! - 1, day! + days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }

export const leaveDashboardQuerySchema = z.object({ year: z.coerce.number().int().min(1900).max(2200), month: z.coerce.number().int().min(1).max(12), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict().refine((value) => !value.today || companyHolidaySchema.shape.dateKey.safeParse(value.today).success, { path: ['today'], message: 'Enter a real calendar date.' });
