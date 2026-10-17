import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { LeaveInput, StaffInput, WeeklyRuleInput } from './api';

export const teamKeys = {
  all: ['team'] as const,
  staff: () => ['team', 'staff'] as const,
  member: (id: string) => ['team', 'staff', id] as const,
  availability: (staffId: string) => ['team', 'availability', staffId] as const,
};

export function useStaff() {
  return useQuery({ queryKey: teamKeys.staff(), queryFn: api.listStaff });
}

export function useStaffMember(id: string | undefined) {
  return useQuery({
    queryKey: teamKeys.member(id ?? 'new'),
    queryFn: () => api.getStaff(id as string),
    enabled: !!id,
  });
}

export function useAvailability(staffId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.availability(staffId ?? 'new'),
    queryFn: () => api.listAvailability(staffId as string),
    enabled: !!staffId,
  });
}

export function useSaveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffInput) => api.saveStaff(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useCreateCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { display_name: string; phone_e164: string }) => api.createCleaner(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useReplaceWeekly(staffId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: WeeklyRuleInput[]) => api.replaceWeekly(staffId, rules),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.availability(staffId) }),
  });
}

export function useAddLeave(staffId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<LeaveInput, 'staff_id'>) => api.addLeave({ ...input, staff_id: staffId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.availability(staffId) }),
  });
}

export function useDeleteAvailability(staffId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAvailability,
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.availability(staffId) }),
  });
}
