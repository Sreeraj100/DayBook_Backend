import { model, Schema } from 'mongoose';

const categorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 48 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  kind: { type: String, required: true, enum: ['income', 'expense', 'both'] },
  color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
  isDefault: { type: Boolean, default: false, immutable: true }
}, { timestamps: true });

categorySchema.index({ userId: 1, normalizedName: 1 }, { unique: true });
export const FinanceCategory = model('FinanceCategory', categorySchema);
