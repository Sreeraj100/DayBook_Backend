import type { Request, Response } from 'express';
import {
  createFinanceAccount, createFinanceCategory, createFinanceTransaction, deleteFinanceAccount, deleteFinanceBudget, deleteFinanceCategory,
  deleteFinanceTransaction, getAccountBalances, getFinanceDashboard, getFinanceReport, listFinanceBudgets, listFinanceCategories,
  listFinanceTransactions, saveFinanceBudget, updateFinanceAccount, updateFinanceCategory, updateFinanceTransaction
} from '../services/finance.service.js';
import { HttpError } from '../services/todo.service.js';
import { createBudgetSchema, reportQuerySchema, transactionQuerySchema } from '../validation/finance.schemas.js';
import { z } from 'zod';

const userId = (request: Request) => request.session.user!.id;
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Invalid finance request.');
  return result.data;
}
function param(request: Request, name: string) {
  const value = request.params[name];
  if (typeof value !== 'string') throw new HttpError(404, 'RECORD_NOT_FOUND', 'Record not found.');
  return value;
}

export async function dashboard(request: Request, response: Response) {
  const query = validate(reportQuerySchema, request.query);
  response.json({ success: true, data: await getFinanceDashboard(userId(request), query) });
}
export async function accounts(request: Request, response: Response) {
  response.json({ success: true, data: { items: await getAccountBalances(userId(request)) } });
}
export async function postAccount(request: Request, response: Response) {
  response.status(201).json({ success: true, data: { account: await createFinanceAccount(userId(request), request.body) } });
}
export async function patchAccount(request: Request, response: Response) {
  response.json({ success: true, data: { account: await updateFinanceAccount(userId(request), param(request, 'id'), request.body) } });
}
export async function removeAccount(request: Request, response: Response) {
  await deleteFinanceAccount(userId(request), param(request, 'id'));
  response.json({ success: true, data: { deleted: true } });
}
export async function getCategories(request: Request, response: Response) {
  response.json({ success: true, data: { items: await listFinanceCategories(userId(request)) } });
}
export async function postCategory(request: Request, response: Response) {
  response.status(201).json({ success: true, data: { category: await createFinanceCategory(userId(request), request.body) } });
}
export async function patchCategory(request: Request, response: Response) {
  response.json({ success: true, data: { category: await updateFinanceCategory(userId(request), param(request, 'id'), request.body) } });
}
export async function removeCategory(request: Request, response: Response) {
  await deleteFinanceCategory(userId(request), param(request, 'id'));
  response.json({ success: true, data: { deleted: true } });
}
export async function getTransactions(request: Request, response: Response) {
  const query = validate(transactionQuerySchema, request.query);
  response.json({ success: true, data: await listFinanceTransactions(userId(request), query) });
}
export async function postTransaction(request: Request, response: Response) {
  response.status(201).json({ success: true, data: { transaction: await createFinanceTransaction(userId(request), request.body) } });
}
export async function patchTransaction(request: Request, response: Response) {
  response.json({ success: true, data: { transaction: await updateFinanceTransaction(userId(request), param(request, 'id'), request.body) } });
}
export async function removeTransaction(request: Request, response: Response) {
  await deleteFinanceTransaction(userId(request), param(request, 'id'));
  response.json({ success: true, data: { deleted: true } });
}
export async function report(request: Request, response: Response) {
  const query = validate(reportQuerySchema, request.query);
  response.json({ success: true, data: await getFinanceReport(userId(request), query) });
}
export async function budgets(request: Request, response: Response) {
  const year = Number(request.query.year);
  const month = Number(request.query.month);
  const parsed = validate(z.object({ year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12) }), { year, month });
  response.json({ success: true, data: { items: await listFinanceBudgets(userId(request), parsed.year, parsed.month) } });
}
export async function putBudget(request: Request, response: Response) {
  const input = validate(createBudgetSchema, request.body);
  response.json({ success: true, data: { budget: await saveFinanceBudget(userId(request), input) } });
}
export async function removeBudget(request: Request, response: Response) {
  await deleteFinanceBudget(userId(request), param(request, 'id'));
  response.json({ success: true, data: { deleted: true } });
}
