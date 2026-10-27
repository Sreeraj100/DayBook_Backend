import { model, Schema, type InferSchemaType } from 'mongoose';

const recurrenceSchema = new Schema({
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  interval: { type: Number, min: 1, max: 365, required: true },
  daysOfWeek: { type: [Number], default: undefined },
  dayOfMonth: { type: Number, min: 1, max: 31 },
  endDate: { type: Date }
}, { _id: false });

const calendarEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  allDay: { type: Boolean, default: false },
  timezone: { type: String, required: true },
  color: { type: String, enum: ['teal', 'blue', 'violet', 'amber', 'rose', 'green'], default: 'teal' },
  category: { type: String, trim: true, maxlength: 48, default: '' },
  importantDate: { type: Boolean, default: false },
  reminderMinutes: { type: Number, min: 0, max: 10080 },
  todoId: { type: Schema.Types.ObjectId, ref: 'Todo' },
  recurrence: { type: recurrenceSchema },
  seriesId: { type: String }
}, { timestamps: true });

calendarEventSchema.index({ userId: 1, startAt: 1, endAt: 1 });
calendarEventSchema.index({ userId: 1, seriesId: 1 });

export type CalendarEventDocument = InferSchemaType<typeof calendarEventSchema>;
export const CalendarEvent = model('CalendarEvent', calendarEventSchema);
