import { model, Schema, type InferSchemaType } from 'mongoose';

const leavePolicySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, immutable: true },
  workingDaysOfWeek: { type: [Number], required: true, default: [1, 2, 3, 4, 5] },
  excludeCompanyHolidays: { type: Boolean, required: true, default: true }
}, { timestamps: true });

export type LeavePolicyDocument = InferSchemaType<typeof leavePolicySchema>;
export const LeavePolicy = model('LeavePolicy', leavePolicySchema);
