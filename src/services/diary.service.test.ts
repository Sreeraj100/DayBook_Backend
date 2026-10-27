import assert from 'node:assert/strict';
import test from 'node:test';
import { DiaryEntry } from '../models/DiaryEntry.js';
import { safeProviderError } from './grammar.service.js';
import { HttpError } from './todo.service.js';
import { diaryDateParamsSchema, improveGrammarSchema, saveDiarySchema } from '../validation/diary.schemas.js';

test('diary date accepts real leap days and rejects impossible calendar dates', () => {
  assert.equal(diaryDateParamsSchema.safeParse({ date: '2024-02-29' }).success, true);
  assert.equal(diaryDateParamsSchema.safeParse({ date: '2025-02-29' }).success, false);
  assert.equal(diaryDateParamsSchema.safeParse({ date: '2025-13-01' }).success, false);
});

test('grammar requests require non-empty text and cap entry length', () => {
  assert.equal(improveGrammarSchema.safeParse({ text: 'A private thought.' }).success, true);
  assert.equal(improveGrammarSchema.safeParse({ text: '   ' }).success, false);
  assert.equal(improveGrammarSchema.safeParse({ text: 'x'.repeat(20001) }).success, false);
});

test('diary schema enforces one entry per owner and calendar date', () => {
  const uniqueDateIndex = DiaryEntry.schema.indexes().find(([keys, options]) => keys.userId === 1 && keys.dateKey === 1 && options.unique === true);
  assert.ok(uniqueDateIndex, 'unique userId/dateKey index must protect against duplicate entries');
});

test('diary saves require an explicit server revision for compare-and-set writes', () => {
  assert.equal(saveDiarySchema.safeParse({ content: 'A new entry', expectedUpdatedAt: null }).success, true);
  assert.equal(saveDiarySchema.safeParse({ content: 'An edit', expectedUpdatedAt: '2026-10-22T10:00:00.000Z' }).success, true);
  assert.equal(saveDiarySchema.safeParse({ content: 'Unsafe overwrite' }).success, false);
});

test('provider failures return safe errors without exposing diary text', () => {
  const privateText = 'a private sentence from an entry';
  const failure = safeProviderError(new Error(`${privateText}: provider unavailable`));
  assert.ok(failure instanceof HttpError);
  assert.equal(failure.status, 502);
  assert.equal(failure.message.includes(privateText), false);
  const timeout = safeProviderError(Object.assign(new Error('timeout'), { name: 'AbortError' }));
  assert.equal(timeout.status, 504);
});
