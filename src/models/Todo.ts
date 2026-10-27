import { model, Schema, type InferSchemaType } from 'mongoose';

const recurrenceSchema = new Schema({
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  interval: { type: Number, min: 1, max: 365, required: true },
  daysOfWeek: { type: [Number], default: undefined },
  dayOfMonth: { type: Number, min: 1, max: 31 },
  endDate: { type: Date }
}, { _id: false });

const subtaskSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  completed: { type: Boolean, default: false }
}, { _id: false });

const todoSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  clientRequestId: { type: String, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high'], required: true, default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], required: true, default: 'pending' },
  dueAt: { type: Date },
  dueTimeSet: { type: Boolean, default: false },
  label: { type: String, trim: true, maxlength: 48, default: '' },
  subtasks: { type: [subtaskSchema], default: [] },
  recurrence: { type: recurrenceSchema },
  recurrenceSeriesId: { type: String },
  occurrenceKey: { type: String },
  spawnedTodoId: { type: Schema.Types.ObjectId, ref: 'Todo' },
  completedAt: { type: Date }
}, { timestamps: true, optimisticConcurrency: true });

todoSchema.index({ userId: 1, dueAt: 1, status: 1 });
todoSchema.index({ userId: 1, status: 1, updatedAt: -1 });
todoSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });
todoSchema.index(
  { userId: 1, recurrenceSeriesId: 1, occurrenceKey: 1 },
  { unique: true, partialFilterExpression: { recurrenceSeriesId: { $type: 'string' }, occurrenceKey: { $type: 'string' } } }
);

export type TodoDocument = InferSchemaType<typeof todoSchema>;
export const Todo = model('Todo', todoSchema);
