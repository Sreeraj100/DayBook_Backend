import { Router } from 'express';
import { completeTodo, getTodos, patchTodo, postTodo, removeTodo } from '../controllers/todo.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

export const todoRouter = Router();
todoRouter.use(requireAuth);
todoRouter.get('/', getTodos);
todoRouter.post('/', requireCsrf, postTodo);
todoRouter.patch('/:id', requireCsrf, patchTodo);
todoRouter.post('/:id/completion', requireCsrf, completeTodo);
todoRouter.delete('/:id', requireCsrf, removeTodo);
