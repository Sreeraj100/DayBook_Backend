import { model, Schema, type InferSchemaType } from 'mongoose';

const leaveTypeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  color: { type: String, enum: ['teal', 'blue', 'violet', 'amber', 'rose', 'green'], default: 'teal' },
  entitlementHalfDays: { type: Number, min: 0, max: 730, default: 0 },
  active: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

leaveTypeSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });
export type LeaveTypeDocument = InferSchemaType<typeof leaveTypeSchema>;
export const LeaveType = model('LeaveType', leaveTypeSchema);
