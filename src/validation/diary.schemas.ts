import { z } from 'zod';

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

const dateKey = z.string().refine(isCalendarDate, 'Date must be a real calendar date in YYYY-MM-DD format.');
export const diaryDateParamsSchema = z.object({ date: dateKey });
export const saveDiarySchema = z.object({ content: z.string().max(20000), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable() }).strict();
export const diaryArchiveSchema = z.object({
  search: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();
export const improveGrammarSchema = z.object({ text: z.string().trim().min(1).max(20000) }).strict();
export const applyCorrectionSchema = z.object({
  expectedOriginal: z.string().max(20000),
  correctedText: z.string().trim().min(1).max(20000)
}).strict();
