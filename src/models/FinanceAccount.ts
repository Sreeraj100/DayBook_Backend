import { model, Schema } from 'mongoose';

const accountSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  currency: { type: String, required: true, enum: ['INR'], default: 'INR' },
  openingBalanceMinor: { type: Number, required: true, default: 0, validate: Number.isSafeInteger },
  isDefault: { type: Boolean, default: false, immutable: true }
}, { timestamps: true });

accountSchema.index({ userId: 1, name: 1 }, { unique: true });
accountSchema.index({ userId: 1, isDefault: 1 });
export const FinanceAccount = model('FinanceAccount', accountSchema);
