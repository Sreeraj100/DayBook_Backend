import { model, Schema } from 'mongoose';

const diaryEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  dateKey: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  content: { type: String, maxlength: 20000, default: '' }
}, { timestamps: true, optimisticConcurrency: true });

diaryEntrySchema.index({ userId: 1, dateKey: 1 }, { unique: true });
diaryEntrySchema.index({ userId: 1, updatedAt: -1 });

export const DiaryEntry = model('DiaryEntry', diaryEntrySchema);
