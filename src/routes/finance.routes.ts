import { Router } from 'express';
import {
  accounts, budgets, dashboard, getCategories, getTransactions, patchAccount, patchCategory, patchTransaction,
  postAccount, postCategory, postTransaction, putBudget, removeAccount, removeBudget, removeCategory, removeTransaction, report
} from '../controllers/finance.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

export const financeRouter = Router();
financeRouter.use(requireAuth);
financeRouter.get('/dashboard', dashboard);
financeRouter.get('/reports', report);
financeRouter.get('/accounts', accounts);
financeRouter.post('/accounts', requireCsrf, postAccount);
financeRouter.patch('/accounts/:id', requireCsrf, patchAccount);
financeRouter.delete('/accounts/:id', requireCsrf, removeAccount);
financeRouter.get('/categories', getCategories);
financeRouter.post('/categories', requireCsrf, postCategory);
financeRouter.patch('/categories/:id', requireCsrf, patchCategory);
financeRouter.delete('/categories/:id', requireCsrf, removeCategory);
financeRouter.get('/transactions', getTransactions);
financeRouter.post('/transactions', requireCsrf, postTransaction);
financeRouter.patch('/transactions/:id', requireCsrf, patchTransaction);
financeRouter.delete('/transactions/:id', requireCsrf, removeTransaction);
financeRouter.get('/budgets', budgets);
financeRouter.put('/budgets', requireCsrf, putBudget);
financeRouter.delete('/budgets/:id', requireCsrf, removeBudget);
