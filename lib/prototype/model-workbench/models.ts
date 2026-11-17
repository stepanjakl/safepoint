import { z } from 'zod';

export const MODEL_IDS = ['gemini-3.5-flash-lite', 'gemini-3.7-flash'] as const;
export const modelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof modelIdSchema>;
