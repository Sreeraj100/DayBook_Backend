import { model, Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
