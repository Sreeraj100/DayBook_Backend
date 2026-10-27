import { Types } from 'mongoose';
import { FinanceAccount } from '../models/FinanceAccount.js';
import { FinanceBudget } from '../models/FinanceBudget.js';
import { FinanceCategory } from '../models/FinanceCategory.js';
import { FinanceTransaction } from '../models/FinanceTransaction.js';
import { createAccountSchema, createCategorySchema, createBudgetSchema, financeTransactionSchema, updateAccountSchema, updateCategorySchema, updateTransactionSchema } from '../validation/finance.schemas.js';
import { HttpError } from './todo.service.js';

const DEFAULT_CATEGORIES = [
  ['Salary and income', 'income', '#43856C'], ['Food and groceries', 'expense', '#D68B53'], ['Rent and utilities', 'expense', '#64748B'],
  ['Transport and fuel', 'expense', '#557D95'], ['Personal expenses and shopping', 'expense', '#B06E82'], ['Family and money sent home', 'expense', '#AA7B47'],
  ['Health and medicine', 'expense', '#718A63'], ['Education and courses', 'expense', '#7C72A0'], ['Entertainment', 'expense', '#CB7A5E'],
  ['Subscriptions', 'expense', '#668D9A'], ['Savings and investments', 'expense', '#4E907D'], ['Other', 'both', '#88877B']
] as const;

const owner = (userId: string) => new Types.ObjectId(userId);
const isDuplicate = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parseOrThrow<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success === false) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid finance request.');
  return parsed.data;
}

export async function ensureFinanceDefaults(userId: string) {
  const user = owner(userId);
  const existing = await FinanceAccount.findOne({ userId: user, isDefault: true }).lean();
  if (!existing) {
    try { await FinanceAccount.create({ userId: user, name: 'Personal', currency: 'INR', openingBalanceMinor: 0, isDefault: true }); }
    catch (error) { if (!isDuplicate(error)) throw error; }
  }
  try {
    await FinanceCategory.bulkWrite(DEFAULT_CATEGORIES.map(([name, kind, color]) => ({
      updateOne: { filter: { userId: user, normalizedName: name.toLowerCase() }, update: { $setOnInsert: { userId: user, name, normalizedName: name.toLowerCase(), kind, color, isDefault: true } }, upsert: true }
    })), { ordered: false });
  } catch (error) { if (!isDuplicate(error)) throw error; }
}

function balanceImpact(accountId?: Types.ObjectId): Record<string, unknown> {
  const matches = (field: string) => accountId ? { $eq: [`$${field}`, accountId] } : true;
  return { $switch: { branches: [
    { case: { $eq: ['$kind', 'income'] }, then: { $cond: [matches('accountId'), '$amountMinor', 0] } },
    { case: { $eq: ['$kind', 'expense'] }, then: { $cond: [matches('accountId'), { $multiply: ['$amountMinor', -1] }, 0] } },
    { case: { $eq: ['$kind', 'transfer'] }, then: { $add: [
      { $cond: [matches('toAccountId'), '$amountMinor', 0] },
      { $cond: [matches('fromAccountId'), { $multiply: ['$amountMinor', -1] }, 0] }
    ] } }
  ], default: 0 } };
}

async function ledgerImpact(userId: string, options: { before?: string; from?: string; to?: string; accountId?: Types.ObjectId } = {}) {
  const match: Record<string, unknown> = { userId: owner(userId) };
  if (options.before) match.dateKey = { $lt: options.before };
  if (options.from || options.to) match.dateKey = { ...(options.from ? { $gte: options.from } : {}), ...(options.to ? { $lte: options.to } : {}) };
  if (options.accountId) match.$or = [{ accountId: options.accountId }, { fromAccountId: options.accountId }, { toAccountId: options.accountId }];
  const [result] = await FinanceTransaction.aggregate([
    { $match: match }, { $project: { impactMinor: balanceImpact(options.accountId) } }, { $group: { _id: null, value: { $sum: '$impactMinor' } } }
  ]);
  return Number(result?.value ?? 0);
}

export async function getAccountBalances(userId: string, asOf?: string) {
  await ensureFinanceDefaults(userId);
  const accounts = await FinanceAccount.find({ userId: owner(userId) }).sort({ createdAt: 1 }).lean();
  return Promise.all(accounts.map(async (account) => ({ ...account, balanceMinor: account.openingBalanceMinor + await ledgerImpact(userId, { accountId: account._id, ...(asOf ? { to: asOf } : {}) }) })));
}

export async function createFinanceAccount(userId: string, raw: unknown) {
  const input = parseOrThrow(createAccountSchema, raw);
  return FinanceAccount.create({ ...input, userId: owner(userId), currency: 'INR' });
}

export async function updateFinanceAccount(userId: string, accountId: string, raw: unknown) {
  const input = parseOrThrow(updateAccountSchema, raw);
  if (!Types.ObjectId.isValid(accountId)) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const account = await FinanceAccount.findOne({ _id: accountId, userId: owner(userId) });
  if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  if (input.openingBalanceMinor !== undefined && input.openingBalanceMinor !== account.openingBalanceMinor && await FinanceTransaction.exists({ userId: owner(userId), $or: [{ accountId: account._id }, { fromAccountId: account._id }, { toAccountId: account._id }] })) {
    throw new HttpError(409, 'OPENING_BALANCE_LOCKED', 'Opening balance cannot be changed after account transactions exist. Create an adjustment transaction instead.');
  }
  if (input.name !== undefined) account.name = input.name;
  if (input.openingBalanceMinor !== undefined) account.openingBalanceMinor = input.openingBalanceMinor;
  await account.save();
  return account;
}

export async function deleteFinanceAccount(userId: string, accountId: string) {
  if (!Types.ObjectId.isValid(accountId)) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const account = await FinanceAccount.findOne({ _id: accountId, userId: owner(userId) });
  if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  if (account.isDefault) throw new HttpError(409, 'DEFAULT_ACCOUNT_REQUIRED', 'The Personal account cannot be deleted.');
  if (await FinanceTransaction.exists({ userId: owner(userId), $or: [{ accountId: account._id }, { fromAccountId: account._id }, { toAccountId: account._id }] })) throw new HttpError(409, 'ACCOUNT_IN_USE', 'Move or remove this account’s transactions before deleting it.');
  await account.deleteOne();
}

export async function listFinanceCategories(userId: string) {
  await ensureFinanceDefaults(userId);
  return FinanceCategory.find({ userId: owner(userId) }).sort({ kind: 1, name: 1 }).lean();
}

export async function createFinanceCategory(userId: string, raw: unknown) {
  const input = parseOrThrow(createCategorySchema, raw);
  try { return await FinanceCategory.create({ ...input, normalizedName: input.name.toLowerCase(), userId: owner(userId), isDefault: false }); }
  catch (error) { if (isDuplicate(error)) throw new HttpError(409, 'CATEGORY_EXISTS', 'A category with that name already exists.'); throw error; }
}

export async function updateFinanceCategory(userId: string, categoryId: string, raw: unknown) {
  const input = parseOrThrow(updateCategorySchema, raw);
  if (!Types.ObjectId.isValid(categoryId)) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  const category = await FinanceCategory.findOne({ _id: categoryId, userId: owner(userId) });
  if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  const used = await FinanceTransaction.exists({ userId: owner(userId), categoryId: category._id }) || await FinanceBudget.exists({ userId: owner(userId), categoryId: category._id });
  if (used && input.kind && input.kind !== category.kind) throw new HttpError(409, 'CATEGORY_IN_USE', 'Remove this category from transactions and budgets before changing its type.');
  if (input.name !== undefined) { category.name = input.name; category.normalizedName = input.name.toLowerCase(); }
  if (input.kind !== undefined) category.kind = input.kind;
  if (input.color !== undefined) category.color = input.color;
  try { await category.save(); } catch (error) { if (isDuplicate(error)) throw new HttpError(409, 'CATEGORY_EXISTS', 'A category with that name already exists.'); throw error; }
  return category;
}

export async function deleteFinanceCategory(userId: string, categoryId: string) {
  if (!Types.ObjectId.isValid(categoryId)) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  const category = await FinanceCategory.findOne({ _id: categoryId, userId: owner(userId) });
  if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  if (category.isDefault) throw new HttpError(409, 'DEFAULT_CATEGORY_REQUIRED', 'Default categories cannot be deleted.');
  if (await FinanceTransaction.exists({ userId: owner(userId), categoryId: category._id }) || await FinanceBudget.exists({ userId: owner(userId), categoryId: category._id })) throw new HttpError(409, 'CATEGORY_IN_USE', 'This category is in use. Reassign its transactions and budget first.');
  await category.deleteOne();
}

async function validateTransactionReferences(userId: string, input: Record<string, unknown>) {
  const user = owner(userId);
  const accountIds = input.kind === 'transfer' ? [input.fromAccountId, input.toAccountId] : [input.accountId];
  const accounts = await FinanceAccount.find({ userId: user, _id: { $in: accountIds } }).select('_id').lean();
  if (accounts.length !== 2 && input.kind === 'transfer' || accounts.length !== 1 && input.kind !== 'transfer') throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'One of the selected accounts could not be found.');
  if (input.categoryId) {
    const category = await FinanceCategory.findOne({ _id: input.categoryId, userId: user }).lean();
    if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    if (category.kind !== 'both' && category.kind !== input.kind) throw new HttpError(400, 'CATEGORY_KIND_MISMATCH', 'Choose a category that matches the transaction type.');
  }
}

function transactionFields(input: Record<string, unknown>) {
  return {
    kind: input.kind, amountMinor: input.amountMinor,
    accountId: input.kind === 'transfer' ? undefined : new Types.ObjectId(String(input.accountId)),
    fromAccountId: input.kind === 'transfer' ? new Types.ObjectId(String(input.fromAccountId)) : undefined,
    toAccountId: input.kind === 'transfer' ? new Types.ObjectId(String(input.toAccountId)) : undefined,
    categoryId: input.categoryId ? new Types.ObjectId(String(input.categoryId)) : undefined,
    paymentMethod: input.paymentMethod, description: input.description, notes: input.notes ?? '', dateKey: input.dateKey, timezone: input.timezone
  };
}

export async function createFinanceTransaction(userId: string, raw: unknown) {
  const input = parseOrThrow(financeTransactionSchema, raw);
  await validateTransactionReferences(userId, input as unknown as Record<string, unknown>);
  try { return await FinanceTransaction.create({ ...transactionFields(input as unknown as Record<string, unknown>), idempotencyKey: input.idempotencyKey, userId: owner(userId) }); }
  catch (error) {
    if (!isDuplicate(error) || !input.idempotencyKey) throw error;
    const existing = await FinanceTransaction.findOne({ userId: owner(userId), idempotencyKey: input.idempotencyKey }).lean();
    const expected = transactionFields(input as unknown as Record<string, unknown>);
    const samePayload = existing && Object.entries(expected).every(([key, value]) => {
      const existingValue = existing[key as keyof typeof existing];
      if (existingValue === undefined || existingValue === null) return value === undefined;
      if (value === undefined || value === null) return false;
      return String(existingValue) === String(value);
    });
    if (existing && samePayload) return existing;
    throw new HttpError(409, 'DUPLICATE_SUBMISSION', 'This submission was already used for a different transaction.');
  }
}

export async function updateFinanceTransaction(userId: string, transactionId: string, raw: unknown) {
  const input = parseOrThrow(updateTransactionSchema, raw);
  if (!Types.ObjectId.isValid(transactionId)) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
  await validateTransactionReferences(userId, input as unknown as Record<string, unknown>);
  const transaction = await FinanceTransaction.findOne({ _id: transactionId, userId: owner(userId) });
  if (!transaction) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
  Object.assign(transaction, transactionFields(input as unknown as Record<string, unknown>));
  await transaction.save();
  return transaction;
}

export async function deleteFinanceTransaction(userId: string, transactionId: string) {
  if (!Types.ObjectId.isValid(transactionId)) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
  const deleted = await FinanceTransaction.findOneAndDelete({ _id: transactionId, userId: owner(userId) });
  if (!deleted) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
}

type ListOptions = { search: string; kind?: string; accountId?: string; categoryId?: string; from?: string; to?: string; page: number; limit: number };
export async function listFinanceTransactions(userId: string, query: ListOptions) {
  const filter: Record<string, unknown> = { userId: owner(userId) };
  if (query.kind) filter.kind = query.kind;
  if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
  if (query.accountId) filter.$or = [{ accountId: query.accountId }, { fromAccountId: query.accountId }, { toAccountId: query.accountId }];
  if (query.from || query.to) filter.dateKey = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (query.search) filter.$and = [{ $or: [{ description: new RegExp(escapeRegex(query.search), 'i') }, { notes: new RegExp(escapeRegex(query.search), 'i') }] }];
  const [items, total] = await Promise.all([
    FinanceTransaction.find(filter).sort({ dateKey: -1, createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('accountId', 'name').populate('fromAccountId', 'name').populate('toAccountId', 'name').populate('categoryId', 'name color kind').lean(),
    FinanceTransaction.countDocuments(filter)
  ]);
  return { items, total, page: query.page, limit: query.limit, hasMore: query.page * query.limit < total };
}

function addDays(date: Date, days: number) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
const keyOf = (date: Date) => date.toISOString().slice(0, 10);
function monthEnd(year: number, monthIndex: number) { return new Date(Date.UTC(year, monthIndex + 1, 0)); }

export function getReportRange(input: { period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'; date: string; from?: string; to?: string }) {
  if (input.period === 'custom') return { from: input.from!, to: input.to! };
  const [year, month, day] = input.date.split('-').map(Number);
  if (input.period === 'daily') return { from: input.date, to: input.date };
  if (input.period === 'weekly') {
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const from = addDays(date, -mondayOffset);
    return { from: keyOf(from), to: keyOf(addDays(from, 6)) };
  }
  if (input.period === 'yearly') return { from: `${year}-01-01`, to: `${year}-12-31` };
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  return { from, to: keyOf(monthEnd(year!, month! - 1)) };
}

function rangeBucket(key: string, period: string, days: number) {
  return period === 'yearly' || days > 92 ? key.slice(0, 7) : key;
}

export async function getFinanceReport(userId: string, query: { period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'; date: string; from?: string; to?: string; timezone: string; accountId?: string }) {
  const range = getReportRange(query);
  const user = owner(userId);
  const accountId = query.accountId ? new Types.ObjectId(query.accountId) : undefined;
  if (accountId && !await FinanceAccount.exists({ _id: accountId, userId: user })) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const accounts = accountId ? await FinanceAccount.find({ _id: accountId, userId: user }).lean() : await FinanceAccount.find({ userId: user }).lean();
  const openingBalanceMinor = accounts.reduce((sum, account) => sum + account.openingBalanceMinor, 0) + await ledgerImpact(userId, { before: range.from, ...(accountId ? { accountId } : {}) });
  const match: Record<string, unknown> = { userId: user, dateKey: { $gte: range.from, $lte: range.to } };
  if (accountId) match.$or = [{ accountId }, { fromAccountId: accountId }, { toAccountId: accountId }];
  const [flow, categories, rawSeries, transactionPage] = await Promise.all([
    FinanceTransaction.aggregate([{ $match: match }, { $group: { _id: null,
      incomeMinor: { $sum: { $cond: [{ $eq: ['$kind', 'income'] }, '$amountMinor', 0] } },
      expenseMinor: { $sum: { $cond: [{ $eq: ['$kind', 'expense'] }, '$amountMinor', 0] } },
      transferInMinor: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'transfer'] }, accountId ? { $eq: ['$toAccountId', accountId] } : false] }, '$amountMinor', 0] } },
      transferOutMinor: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'transfer'] }, accountId ? { $eq: ['$fromAccountId', accountId] } : false] }, '$amountMinor', 0] } }
    } }]),
    FinanceTransaction.aggregate([{ $match: { ...match, kind: 'expense', categoryId: { $exists: true } } }, { $group: { _id: '$categoryId', spentMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }, { $sort: { spentMinor: -1 } }, { $lookup: { from: 'financecategories', localField: '_id', foreignField: '_id', as: 'category' } }, { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }, { $project: { categoryId: '$_id', spentMinor: 1, count: 1, name: '$category.name', color: '$category.color' } }]),
    FinanceTransaction.aggregate([{ $match: match }, { $group: { _id: '$dateKey', incomeMinor: { $sum: { $cond: [{ $eq: ['$kind', 'income'] }, '$amountMinor', 0] } }, expenseMinor: { $sum: { $cond: [{ $eq: ['$kind', 'expense'] }, '$amountMinor', 0] } }, transferInMinor: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'transfer'] }, accountId ? { $eq: ['$toAccountId', accountId] } : false] }, '$amountMinor', 0] } }, transferOutMinor: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'transfer'] }, accountId ? { $eq: ['$fromAccountId', accountId] } : false] }, '$amountMinor', 0] } } } }, { $sort: { _id: 1 } }]),
    listFinanceTransactions(userId, { search: '', ...(accountId ? { accountId: accountId.toHexString() } : {}), from: range.from, to: range.to, page: 1, limit: 50 })
  ]);
  const totals = flow[0] ?? { incomeMinor: 0, expenseMinor: 0, transferInMinor: 0, transferOutMinor: 0 };
  const netCashFlowMinor = totals.incomeMinor - totals.expenseMinor;
  const closingBalanceMinor = openingBalanceMinor + netCashFlowMinor + totals.transferInMinor - totals.transferOutMinor;
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const buckets = new Map<string, { incomeMinor: number; expenseMinor: number; netMinor: number }>();
  let running = openingBalanceMinor;
  const series = rawSeries.map((row: { _id: string; incomeMinor: number; expenseMinor: number; transferInMinor: number; transferOutMinor: number }) => {
    const bucket = rangeBucket(row._id, query.period, dayCount);
    const aggregate = buckets.get(bucket) ?? { incomeMinor: 0, expenseMinor: 0, netMinor: 0 };
    aggregate.incomeMinor += row.incomeMinor;
    aggregate.expenseMinor += row.expenseMinor;
    const movement = row.incomeMinor - row.expenseMinor + row.transferInMinor - row.transferOutMinor;
    aggregate.netMinor += movement;
    buckets.set(bucket, aggregate);
    running += movement;
    return { dateKey: row._id, balanceMinor: running };
  });
  return {
    range, timezone: query.timezone, accountId: accountId?.toHexString() ?? null,
    openingBalanceMinor, incomeMinor: totals.incomeMinor, expenseMinor: totals.expenseMinor, netCashFlowMinor,
    closingBalanceMinor, categoryBreakdown: categories,
    cashFlowSeries: [...buckets.entries()].map(([dateKey, value]) => ({ dateKey, ...value })),
    balanceSeries: series, transactions: transactionPage.items, transactionCount: transactionPage.total
  };
}

export async function listFinanceBudgets(userId: string, year: number, month: number) {
  const user = owner(userId);
  const [budgets, spent] = await Promise.all([
    FinanceBudget.find({ userId: user, year, month }).populate('categoryId', 'name color kind').lean(),
    FinanceTransaction.aggregate([{ $match: { userId: user, kind: 'expense', dateKey: { $gte: `${year}-${String(month).padStart(2, '0')}-01`, $lte: keyOf(monthEnd(year, month - 1)) } } }, { $group: { _id: '$categoryId', amountMinor: { $sum: '$amountMinor' } } }])
  ]);
  const spentMap = new Map(spent.map((item: { _id: Types.ObjectId; amountMinor: number }) => [String(item._id), item.amountMinor]));
  return budgets.map((budget) => {
    const amountSpentMinor = spentMap.get(String(budget.categoryId?._id ?? budget.categoryId)) ?? 0;
    return { ...budget, amountSpentMinor, remainingMinor: budget.amountMinor - amountSpentMinor, percentUsed: Math.round(amountSpentMinor / budget.amountMinor * 100), overBudget: amountSpentMinor > budget.amountMinor };
  });
}

export async function saveFinanceBudget(userId: string, raw: unknown) {
  const input = parseOrThrow(createBudgetSchema, raw);
  const category = await FinanceCategory.findOne({ _id: input.categoryId, userId: owner(userId) }).lean();
  if (!category || (category.kind !== 'expense' && category.kind !== 'both')) throw new HttpError(400, 'INVALID_BUDGET_CATEGORY', 'Choose one of your expense categories.');
  return FinanceBudget.findOneAndUpdate({ userId: owner(userId), categoryId: new Types.ObjectId(input.categoryId), year: input.year, month: input.month }, { $set: { amountMinor: input.amountMinor }, $setOnInsert: { userId: owner(userId), categoryId: new Types.ObjectId(input.categoryId), year: input.year, month: input.month } }, { upsert: true, new: true, runValidators: true }).lean();
}

export async function deleteFinanceBudget(userId: string, budgetId: string) {
  if (!Types.ObjectId.isValid(budgetId)) throw new HttpError(404, 'BUDGET_NOT_FOUND', 'Budget not found.');
  const result = await FinanceBudget.findOneAndDelete({ _id: budgetId, userId: owner(userId) });
  if (!result) throw new HttpError(404, 'BUDGET_NOT_FOUND', 'Budget not found.');
}

export async function getFinanceDashboard(userId: string, query: { period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'; date: string; from?: string; to?: string; timezone: string }) {
  await ensureFinanceDefaults(userId);
  const [accounts, categories, report, recentTransactions, currentBudgets] = await Promise.all([
    getAccountBalances(userId), listFinanceCategories(userId), getFinanceReport(userId, query),
    listFinanceTransactions(userId, { search: '', page: 1, limit: 8 }),
    listFinanceBudgets(userId, Number(query.date.slice(0, 4)), Number(query.date.slice(5, 7)))
  ]);
  return { accounts, categories, currentBalanceMinor: accounts.reduce((sum, account) => sum + account.balanceMinor, 0), report, recentTransactions: recentTransactions.items, budgets: currentBudgets };
}

