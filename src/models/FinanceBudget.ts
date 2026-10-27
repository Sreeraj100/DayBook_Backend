import { model, Schema } from 'mongoose';

const budgetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'FinanceCategory', required: true },
  year: { type: Number, required: true, min: 2000, max: 2200 },
  month: { type: Number, required: true, min: 1, max: 12 },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
}, { timestamps: true });

budgetSchema.index({ userId: 1, categoryId: 1, year: 1, month: 1 }, { unique: true });
export const FinanceBudget = model('FinanceBudget', budgetSchema);
