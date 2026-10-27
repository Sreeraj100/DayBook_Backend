import { model, Schema, type InferSchemaType } from 'mongoose';

const malayalamCalendarPageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  year: { type: Number, required: true, min: 1900, max: 2200 },
  month: { type: Number, required: true, min: 1, max: 12 },
  label: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  storageKey: { type: String, required: true, immutable: true },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  sizeBytes: { type: Number, required: true, max: 10 * 1024 * 1024 }
}, { timestamps: true });

malayalamCalendarPageSchema.index({ userId: 1, year: -1, month: 1, createdAt: -1 });
export type MalayalamCalendarPageDocument = InferSchemaType<typeof malayalamCalendarPageSchema>;
export const MalayalamCalendarPage = model('MalayalamCalendarPage', malayalamCalendarPageSchema);
