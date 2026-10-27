import 'dotenv/config';
import { z } from 'zod';

const frontendOriginSchema = z.string().default('http://localhost:5173').superRefine((value, context) => {
  for (const candidate of value.split(',')) {
    const origin = candidate.trim();
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('invalid origin');
    } catch {
      context.addIssue({ code: 'custom', message: 'Use exact HTTP(S) origins separated by commas.' });
      return;
    }
  }
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: frontendOriginSchema,
  CALENDAR_UPLOAD_DIR: z.string().optional(),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  AI_PROVIDER: z.preprocess((value) => value === '' ? undefined : value, z.enum(['gemini', 'mock']).default('mock')),
  AI_MODEL: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).default('gemini-2.5-flash-lite')),
  AI_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().optional())
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Server environment configuration is invalid. Check backend/.env.');
}

export const env = parsed.data;
export const frontendOrigins = env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
