import { z } from 'zod';
import { PAY_TYPES } from '@shared/enums';
import { formatPhone } from '@/lib/phone';
import type { StaffInput, StaffRow } from './api';

export const staffFormSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, { message: 'validation.required' })
      .max(80, { message: 'validation.too_long' }),
    phone_raw: z.string(),
    phone_e164: z.string().nullable(),
    is_team_lead: z.boolean(),
    pay_type: z.union([z.literal(''), z.enum(PAY_TYPES)]),
    pay_rate_tzs: z.number().nullable(),
    home_zone_id: z.string(),
    active: z.boolean(),
    skills: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.phone_raw.trim() && !v.phone_e164) {
      ctx.addIssue({ code: 'custom', path: ['phone_e164'], message: 'validation.phone.invalid' });
    }
    if (v.pay_type && v.pay_rate_tzs == null) {
      ctx.addIssue({ code: 'custom', path: ['pay_rate_tzs'], message: 'validation.required' });
    }
  });
export type StaffFormValues = z.infer<typeof staffFormSchema>;

export function staffToForm(row: StaffRow | null): StaffFormValues {
  return {
    display_name: row?.display_name ?? '',
    phone_raw: row?.phone_e164 ? formatPhone(row.phone_e164).replace(/^\+255\s?/, '') : '',
    phone_e164: row?.phone_e164 ?? null,
    is_team_lead: row?.is_team_lead ?? false,
    pay_type: row?.pay_type ?? '',
    pay_rate_tzs: row?.pay_rate_tzs ?? null,
    home_zone_id: row?.home_zone_id ?? '',
    active: row?.active ?? true,
    skills: row?.skills ?? [],
  };
}

export function formToStaff(v: StaffFormValues, id: string | undefined): StaffInput {
  const base: Omit<StaffInput, 'id'> = {
    display_name: v.display_name,
    phone_e164: v.phone_e164,
    skills: v.skills,
    home_zone_id: v.home_zone_id || null,
    is_team_lead: v.is_team_lead,
    pay_type: v.pay_type || null,
    pay_rate_tzs: v.pay_type ? v.pay_rate_tzs : null,
    active: v.active,
  };
  return id ? { ...base, id } : base;
}
