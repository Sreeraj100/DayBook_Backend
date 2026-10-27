import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { FinanceAccount } from '../models/FinanceAccount.js';
import { FinanceBudget } from '../models/FinanceBudget.js';
import { FinanceCategory } from '../models/FinanceCategory.js';
import { FinanceTransaction } from '../models/FinanceTransaction.js';
import {
  createFinanceAccount, createFinanceCategory, createFinanceTransaction, deleteFinanceTransaction, ensureFinanceDefaults,
  getAccountBalances, getFinanceReport, getReportRange, listFinanceTransactions, updateFinanceAccount, updateFinanceTransaction
} from './finance.service.js';
import { financeTransactionSchema } from '../validation/finance.schemas.js';

const users = [new Types.ObjectId().toHexString(), new Types.ObjectId().toHexString(), new Types.ObjectId().toHexString(), new Types.ObjectId().toHexString()];
let ready = false;
before(async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in backend/.env before running finance integration tests.');
  await mongoose.connect(process.env.MONGODB_URI);
  ready = true;
  await Promise.all([FinanceAccount.init(), FinanceBudget.init(), FinanceCategory.init(), FinanceTransaction.init()]);
});
after(async () => {
  if (ready) {
    await Promise.all(users.map(async (userId) => {
      const userObjectId = new Types.ObjectId(userId);
      await Promise.all([
        FinanceTransaction.deleteMany({ userId: userObjectId }), FinanceBudget.deleteMany({ userId: userObjectId }),
        FinanceCategory.deleteMany({ userId: userObjectId }), FinanceAccount.deleteMany({ userId: userObjectId })
      ]);
    }));
    await mongoose.disconnect();
  }
});

const transaction = (accountId: string, categoryId: string, fields: Record<string, unknown> = {}) => ({
  kind: 'expense', amountMinor: 200000, accountId, categoryId, paymentMethod: 'upi', description: 'Groceries', notes: '',
  dateKey: '2026-10-11', timezone: 'Asia/Kolkata', ...fields
});

test('report periods use Monday-to-Sunday weeks and inclusive local calendar dates', () => {
  assert.deepEqual(getReportRange({ period: 'daily', date: '2026-10-11' }), { from: '2026-10-11', to: '2026-10-11' });
  assert.deepEqual(getReportRange({ period: 'weekly', date: '2026-10-11' }), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(getReportRange({ period: 'monthly', date: '2026-02-15' }), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(getReportRange({ period: 'yearly', date: '2024-06-15' }), { from: '2024-01-01', to: '2024-12-31' });
  assert.deepEqual(getReportRange({ period: 'custom', date: '2026-10-11', from: '2026-10-02', to: '2026-10-04' }), { from: '2026-10-02', to: '2026-10-04' });
});

test('ledger accepts only positive integer minor units and valid transfer account rules', () => {
  const common = { kind: 'expense', amountMinor: 100, accountId: new Types.ObjectId().toHexString(), categoryId: new Types.ObjectId().toHexString(), paymentMethod: 'cash', description: 'Coffee', notes: '', dateKey: '2026-10-11', timezone: 'Asia/Kolkata' };
  assert.equal(financeTransactionSchema.safeParse(common).success, true);
  assert.equal(financeTransactionSchema.safeParse({ ...common, amountMinor: 10.5 }).success, false);
  assert.equal(financeTransactionSchema.safeParse({ ...common, dateKey: '2026-02-30' }).success, false);
  assert.equal(financeTransactionSchema.safeParse({ ...common, kind: 'transfer', categoryId: undefined, accountId: undefined, fromAccountId: common.accountId, toAccountId: common.accountId }).success, false);
});

test('opening balance, income, expense edit and deletion recalculate from integer ledger records', async () => {
  const userId = users[0]!;
  await ensureFinanceDefaults(userId);
  const category = await FinanceCategory.findOne({ userId, normalizedName: 'food and groceries' }).lean();
  const incomeCategory = await FinanceCategory.findOne({ userId, normalizedName: 'salary and income' }).lean();
  assert.ok(category && incomeCategory);
  const account = await createFinanceAccount(userId, { name: 'Test cash', openingBalanceMinor: 2000000 });
  const incomePayload = { kind: 'income', amountMinor: 500000, accountId: String(account._id), categoryId: String(incomeCategory._id), paymentMethod: 'bank_transfer', description: 'Monthly salary', dateKey: '2026-10-10', timezone: 'Asia/Kolkata', idempotencyKey: 'salary-once' };
  const income = await createFinanceTransaction(userId, incomePayload);
  const retriedIncome = await createFinanceTransaction(userId, incomePayload);
  assert.equal(String(retriedIncome._id), String(income._id), 'retry with same idempotency key returns the original record');
  let balances = await getAccountBalances(userId);
  assert.equal(balances.find((item) => String(item._id) === String(account._id))?.balanceMinor, 2500000, '₹20,000 opening + ₹5,000 income = ₹25,000');

  const expense = await createFinanceTransaction(userId, transaction(String(account._id), String(category._id)));
  balances = await getAccountBalances(userId);
  assert.equal(balances.find((item) => String(item._id) === String(account._id))?.balanceMinor, 2300000, '₹25,000 - ₹2,000 = ₹23,000');

  const edited = await updateFinanceTransaction(userId, String(expense._id), transaction(String(account._id), String(category._id), { amountMinor: 100000, description: 'Groceries updated' }));
  assert.equal(edited.amountMinor, 100000);
  balances = await getAccountBalances(userId);
  assert.equal(balances.find((item) => String(item._id) === String(account._id))?.balanceMinor, 2400000, 'editing replaces the old ledger effect: ₹24,000');

  await deleteFinanceTransaction(userId, String(expense._id));
  balances = await getAccountBalances(userId);
  assert.equal(balances.find((item) => String(item._id) === String(account._id))?.balanceMinor, 2500000, 'deleting restores ₹25,000');
});

test('transfers adjust each owned account but never inflate portfolio cash flow', async () => {
  const userId = users[1]!;
  await ensureFinanceDefaults(userId);
  const source = await createFinanceAccount(userId, { name: 'Source', openingBalanceMinor: 2000000 });
  const destination = await createFinanceAccount(userId, { name: 'Savings', openingBalanceMinor: 0 });
  await createFinanceTransaction(userId, { kind: 'transfer', amountMinor: 300000, fromAccountId: String(source._id), toAccountId: String(destination._id), paymentMethod: 'bank_transfer', description: 'Move to savings', notes: '', dateKey: '2026-10-11', timezone: 'Asia/Kolkata' });
  const balances = await getAccountBalances(userId);
  assert.equal(balances.find((item) => String(item._id) === String(source._id))?.balanceMinor, 1700000);
  assert.equal(balances.find((item) => String(item._id) === String(destination._id))?.balanceMinor, 300000);
  const report = await getFinanceReport(userId, { period: 'daily', date: '2026-10-11', timezone: 'Asia/Kolkata' });
  assert.equal(report.incomeMinor, 0);
  assert.equal(report.expenseMinor, 0);
  assert.equal(report.netCashFlowMinor, 0);
  assert.equal(report.closingBalanceMinor, 2000000);
});

test('monthly report returns exact-period totals and foreign owners cannot read or update records', async () => {
  const userId = users[2]!;
  const otherUser = users[3]!;
  await ensureFinanceDefaults(userId);
  await ensureFinanceDefaults(otherUser);
  const category = await FinanceCategory.findOne({ userId, normalizedName: 'food and groceries' }).lean();
  const incomeCategory = await FinanceCategory.findOne({ userId, normalizedName: 'salary and income' }).lean();
  assert.ok(category && incomeCategory);
  const account = await createFinanceAccount(userId, { name: 'Report wallet', openingBalanceMinor: 2000000 });
  const salary = await createFinanceTransaction(userId, { kind: 'income', amountMinor: 500000, accountId: String(account._id), categoryId: String(incomeCategory._id), paymentMethod: 'bank_transfer', description: 'Salary', notes: '', dateKey: '2026-10-10', timezone: 'Asia/Kolkata' });
  const expense = await createFinanceTransaction(userId, transaction(String(account._id), String(category._id)));
  const report = await getFinanceReport(userId, { period: 'monthly', date: '2026-10-11', timezone: 'Asia/Kolkata' });
  assert.deepEqual(report.range, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(report.openingBalanceMinor, 2000000);
  assert.equal(report.incomeMinor, 500000);
  assert.equal(report.expenseMinor, 200000);
  assert.equal(report.netCashFlowMinor, 300000);
  assert.equal(report.closingBalanceMinor, 2300000);
  assert.equal(report.categoryBreakdown[0]?.spentMinor, 200000);

  const foreignList = await listFinanceTransactions(otherUser, { search: '', page: 1, limit: 20 });
  assert.equal(foreignList.total, 0);
  await assert.rejects(() => updateFinanceAccount(otherUser, String(account._id), { name: 'Stolen wallet' }), { code: 'ACCOUNT_NOT_FOUND' });
  await assert.rejects(() => updateFinanceTransaction(otherUser, String(expense._id), transaction(String(account._id), String(category._id))), { code: 'ACCOUNT_NOT_FOUND' });
  await assert.rejects(() => deleteFinanceTransaction(otherUser, String(salary._id)), { code: 'TRANSACTION_NOT_FOUND' });

  const custom = await createFinanceCategory(userId, { name: 'Trip fund', kind: 'expense' });
  assert.ok(await FinanceCategory.exists({ _id: custom._id, userId }));
});
