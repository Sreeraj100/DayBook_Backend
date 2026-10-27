import type { Request, Response } from 'express';
import { applyDiaryCorrection, getDiaryEntry, listDiaryEntries, saveDiaryEntry } from '../services/diary.service.js';
import { improveGrammar } from '../services/grammar.service.js';
import { applyCorrectionSchema, diaryArchiveSchema, diaryDateParamsSchema, improveGrammarSchema, saveDiarySchema } from '../validation/diary.schemas.js';
import { HttpError } from '../services/todo.service.js';

const ownerId = (request: Request) => request.session.user!.id;
function parsed<T>(result: { success: boolean; error?: { issues: { message: string }[] }; data?: T }): T {
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', result.error?.issues[0]?.message ?? 'Invalid diary request.');
  return result.data as T;
}

export async function getEntry(request: Request, response: Response) {
  const { date } = parsed(diaryDateParamsSchema.safeParse(request.params));
  response.json({ success: true, data: { entry: await getDiaryEntry(ownerId(request), date) } });
}

export async function saveEntry(request: Request, response: Response) {
  const { date } = parsed(diaryDateParamsSchema.safeParse(request.params));
  const { content, expectedUpdatedAt } = parsed(saveDiarySchema.safeParse(request.body));
  response.json({ success: true, data: { entry: await saveDiaryEntry(ownerId(request), date, content, expectedUpdatedAt) } });
}

export async function getArchive(request: Request, response: Response) {
  const query = parsed(diaryArchiveSchema.safeParse(request.query));
  response.json({ success: true, data: await listDiaryEntries(ownerId(request), query) });
}

export async function requestGrammar(request: Request, response: Response) {
  const { text } = parsed(improveGrammarSchema.safeParse(request.body));
  response.json({ success: true, data: { correctedText: await improveGrammar(text) } });
}

export async function applyCorrection(request: Request, response: Response) {
  const { date } = parsed(diaryDateParamsSchema.safeParse(request.params));
  const input = parsed(applyCorrectionSchema.safeParse(request.body));
  response.json({ success: true, data: { entry: await applyDiaryCorrection(ownerId(request), date, input.expectedOriginal, input.correctedText) } });
}
