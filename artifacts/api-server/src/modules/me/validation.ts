import { z } from 'zod';

export const upsertMeSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
    phone: z.string().trim().min(1, 'Phone is required'),
    lang: z.enum(['en', 'hi'], {
      errorMap: () => ({ message: "Language must be 'en' or 'hi'" }),
    }),
    boxPub: z.string().trim().min(1, 'boxPub is required'),
    signPub: z.string().trim().min(1, 'signPub is required'),
    expoPushToken: z.string().trim().optional(),
    adultConfirmedAt: z.number().int().positive().optional(),
  })
  .strip();

export type UpsertMeInput = z.infer<typeof upsertMeSchema>;

