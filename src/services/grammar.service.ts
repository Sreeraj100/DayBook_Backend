import { env } from '../config/env.js';
import { HttpError } from './todo.service.js';

export function safeProviderError(error: unknown): HttpError {
  if (error instanceof Error && error.name === 'AbortError') return new HttpError(504, 'AI_TIMEOUT', 'The writing assistant took too long. Your entry is still safe; please try again.');
  return new HttpError(502, 'AI_UNAVAILABLE', 'The writing assistant is unavailable right now. Your entry is still editable and unchanged.');
}

export async function improveGrammar(text: string): Promise<string> {
  if (env.AI_PROVIDER === 'mock') throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Grammar suggestions are not configured. Add an AI API key in backend/.env. Your entry remains editable.');
  if (!env.AI_API_KEY) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Grammar suggestions are not configured. Add an AI API key in backend/.env. Your entry remains editable.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.AI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.AI_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Correct grammar, spelling, and punctuation only. Preserve the writer’s meaning, tone, wording, and personal voice. Do not add facts or commentary. Return only the corrected text.' }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });
    if (!response.ok) throw new Error(`provider status ${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
    const suggestion = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!suggestion || suggestion.length > 20000) throw new Error('provider returned an invalid suggestion');
    return suggestion;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw safeProviderError(error);
  } finally { clearTimeout(timer); }
}
