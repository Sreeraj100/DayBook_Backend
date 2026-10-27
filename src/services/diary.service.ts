import { Types } from 'mongoose';
import { DiaryEntry } from '../models/DiaryEntry.js';
import { HttpError } from './todo.service.js';

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export async function getDiaryEntry(userId: string, dateKey: string) {
  return DiaryEntry.findOne({ userId, dateKey }).lean();
}

export async function saveDiaryEntry(userId: string, dateKey: string, content: string, expectedUpdatedAt: string | null) {
  if (expectedUpdatedAt === null) {
    try {
      return await DiaryEntry.create({ userId, dateKey, content });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        throw new HttpError(409, 'DIARY_CHANGED', 'An entry for this date was created elsewhere. Review both versions before saving.');
      }
      throw error;
    }
  }
  const entry = await DiaryEntry.findOneAndUpdate(
    { userId, dateKey, updatedAt: new Date(expectedUpdatedAt) },
    { $set: { content } },
    { new: true, runValidators: true }
  ).lean();
  if (!entry) throw new HttpError(409, 'DIARY_CHANGED', 'This entry changed on the server. Review the latest version before saving.');
  return entry;
}

export async function applyDiaryCorrection(userId: string, dateKey: string, expectedOriginal: string, correctedText: string) {
  const entry = await DiaryEntry.findOneAndUpdate(
    { userId, dateKey, content: expectedOriginal },
    { $set: { content: correctedText } },
    { new: true, runValidators: true }
  ).lean();
  if (!entry) throw new HttpError(409, 'DIARY_CHANGED', 'This entry changed since the suggestion was made. Review the latest version and request a new suggestion.');
  return entry;
}

export async function listDiaryEntries(userId: string, query: { search: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (query.search) filter.content = new RegExp(escapeRegex(query.search), 'i');
  const [items, total] = await Promise.all([
    DiaryEntry.find(filter).select('dateKey content updatedAt').sort({ dateKey: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    DiaryEntry.countDocuments(filter)
  ]);
  return { items: items.map((item) => ({ ...item, content: item.content.slice(0, 240) })), page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total };
}

