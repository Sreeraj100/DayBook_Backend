import { model, Schema } from 'mongoose';

const transactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  kind: { type: String, required: true, enum: ['income', 'expense', 'transfer'] },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  accountId: { type: Schema.Types.ObjectId, ref: 'FinanceAccount' },
  fromAccountId: { type: Schema.Types.ObjectId, ref: 'FinanceAccount' },
  toAccountId: { type: Schema.Types.ObjectId, ref: 'FinanceAccount' },
  categoryId: { type: Schema.Types.ObjectId, ref: 'FinanceCategory' },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'upi', 'other'], required: true },
  description: { type: String, required: true, trim: true, maxlength: 160 },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timezone: { type: String, required: true, maxlength: 64 },
  idempotencyKey: { type: String, maxlength: 64 }
}, { timestamps: true });

transactionSchema.index({ userId: 1, dateKey: -1, _id: -1 });
transactionSchema.index({ userId: 1, accountId: 1, dateKey: -1 });
transactionSchema.index({ userId: 1, fromAccountId: 1, dateKey: -1 });
transactionSchema.index({ userId: 1, toAccountId: 1, dateKey: -1 });
transactionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export const FinanceTransaction = model('FinanceTransaction', transactionSchema);
