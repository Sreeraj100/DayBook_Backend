import { model, Schema, type InferSchemaType } from 'mongoose';

const leaveRecordSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  halfDay: { type: Boolean, default: false },
  halfDayPeriod: { type: String, enum: ['morning', 'afternoon'] },
  status: { type: String, enum: ['planned', 'taken', 'cancelled'], required: true, default: 'planned' },
  note: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

leaveRecordSchema.index({ userId: 1, startDate: 1, endDate: 1 });
leaveRecordSchema.index({ userId: 1, leaveTypeId: 1, status: 1, startDate: 1 });
export type LeaveRecordDocument = InferSchemaType<typeof leaveRecordSchema>;
export const LeaveRecord = model('LeaveRecord', leaveRecordSchema);
