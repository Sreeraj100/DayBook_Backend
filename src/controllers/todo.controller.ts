import type { Request, Response } from 'express';
import { createTodo, deleteTodo, HttpError, listTodos, setTodoCompleted, setTodoCompletedIfCurrent, updateTodo } from '../services/todo.service.js';
import { createTodoSchema, todoListQuerySchema, updateTodoSchema } from '../validation/todo.schemas.js';

const ownerId = (request: Request) => request.session.user!.id;
const todoId = (request: Request) => {
  const id = request.params.id;
  if (typeof id !== 'string') throw new HttpError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  return id;
};

export async function getTodos(request: Request, response: Response) {
  const parsed = todoListQuerySchema.safeParse(request.query);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid todo filters.');
  response.json({ success: true, data: await listTodos(ownerId(request), parsed.data) });
}

export async function postTodo(request: Request, response: Response) {
  const parsed = createTodoSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid todo.');
  response.status(201).json({ success: true, data: { todo: await createTodo(ownerId(request), parsed.data) } });
}

export async function patchTodo(request: Request, response: Response) {
  const parsed = updateTodoSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid todo update.');
  response.json({ success: true, data: { todo: await updateTodo(ownerId(request), todoId(request), parsed.data) } });
}

export async function removeTodo(request: Request, response: Response) {
  await deleteTodo(ownerId(request), todoId(request));
  response.json({ success: true, data: { deleted: true } });
}

export async function completeTodo(request: Request, response: Response) {
  const parsed = request.body as { completed?: unknown; expectedUpdatedAt?: unknown };
  if (typeof parsed.completed !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'completed must be a boolean.');
  if (parsed.expectedUpdatedAt !== undefined && (typeof parsed.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(parsed.expectedUpdatedAt)))) throw new HttpError(400, 'VALIDATION_ERROR', 'expectedUpdatedAt must be a valid timestamp.');
  const result = typeof parsed.expectedUpdatedAt === 'string'
    ? await setTodoCompletedIfCurrent(ownerId(request), todoId(request), parsed.completed, parsed.expectedUpdatedAt)
    : await setTodoCompleted(ownerId(request), todoId(request), parsed.completed);
  response.json({ success: true, data: result });
}
