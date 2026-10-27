import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
export function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}
const dateKey = z.string().refine(validDateKey, 'Enter a real date in YYYY-MM-DD format.');
const minorUnits = z.number().int().safe().positive('Amount must be greater than zero.');
const nullableAccountId = objectId.optional();

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  openingBalanceMinor: z.number().int().safe().default(0)
}).strict();
export const updateAccountSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), openingBalanceMinor: z.number().int().safe().optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Make at least one account change.');
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(48), kind: z.enum(['income', 'expense', 'both']), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#74856B')
}).strict();
export const updateCategorySchema = z.object({ name: z.string().trim().min(1).max(48).optional(), kind: z.enum(['income', 'expense', 'both']).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Make at least one category change.');

const financeTransactionFieldsSchema = z.object({
  kind: z.enum(['income', 'expense', 'transfer']), amountMinor: minorUnits,
  accountId: nullableAccountId, fromAccountId: nullableAccountId, toAccountId: nullableAccountId,
  categoryId: objectId.optional(), paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'upi', 'other']),
  description: z.string().trim().min(1).max(160), notes: z.string().max(1000).default(''),
  dateKey, timezone: z.string().min(1).max(64), idempotencyKey: z.string().min(1).max(64).optional()
}).strict();

function transactionRules(value: z.infer<typeof financeTransactionFieldsSchema>, context: z.RefinementCtx) {
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }); }
  catch { context.addIssue({ code: 'custom', path: ['timezone'], message: 'Choose a supported time zone.' }); }
  if (value.kind === 'transfer') {
    if (!value.fromAccountId || !value.toAccountId) context.addIssue({ code: 'custom', path: ['fromAccountId'], message: 'Select both accounts for a transfer.' });
    if (value.fromAccountId && value.toAccountId && value.fromAccountId === value.toAccountId) context.addIssue({ code: 'custom', path: ['toAccountId'], message: 'A transfer needs two different accounts.' });
    if (value.accountId || value.categoryId) context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Transfers do not use a category or single account.' });
  } else {
    if (!value.accountId) context.addIssue({ code: 'custom', path: ['accountId'], message: 'Choose an account.' });
    if (!value.categoryId) context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category.' });
    if (value.fromAccountId || value.toAccountId) context.addIssue({ code: 'custom', path: ['fromAccountId'], message: 'Only transfers use source and destination accounts.' });
  }
}

export const financeTransactionSchema = financeTransactionFieldsSchema.superRefine(transactionRules);
export const updateTransactionSchema = financeTransactionFieldsSchema.omit({ idempotencyKey: true }).superRefine(transactionRules);
export const transactionQuerySchema = z.object({
  search: z.string().trim().max(120).default(''), kind: z.enum(['income', 'expense', 'transfer']).optional(),
  accountId: objectId.optional(), categoryId: objectId.optional(), from: dateKey.optional(), to: dateKey.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'End date must be on or after start date.' });

export const reportQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']).default('monthly'),
  date: dateKey, from: dateKey.optional(), to: dateKey.optional(), timezone: z.string().min(1).max(64).default('UTC'), accountId: objectId.optional()
}).strict().superRefine((value, context) => {
  if (value.period === 'custom' && (!value.from || !value.to)) context.addIssue({ code: 'custom', path: ['from'], message: 'Choose both dates for a custom range.' });
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date.' });
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }); }
  catch { context.addIssue({ code: 'custom', path: ['timezone'], message: 'Choose a supported time zone.' }); }
});

export const createBudgetSchema = z.object({ categoryId: objectId, year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12), amountMinor: minorUnits }).strict();
