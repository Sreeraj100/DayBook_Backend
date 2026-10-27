import { model, Schema, type InferSchemaType } from 'mongoose';

const companyHolidaySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  notes: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

companyHolidaySchema.index({ userId: 1, dateKey: 1 }, { unique: true });
export type CompanyHolidayDocument = InferSchemaType<typeof companyHolidaySchema>;
export const CompanyHoliday = model('CompanyHoliday', companyHolidaySchema);
