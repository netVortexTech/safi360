import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { AddonInput, CategoryInput, ServiceInput, ZoneInput } from './types';

export const catalogKeys = {
  all: ['catalog'] as const,
  services: () => ['catalog', 'services'] as const,
  service: (id: string) => ['catalog', 'services', id] as const,
  categories: () => ['catalog', 'categories'] as const,
  addons: (serviceId: string | undefined) => ['catalog', 'addons', serviceId ?? 'all'] as const,
  zones: () => ['catalog', 'zones'] as const,
};

export function useServices() {
  return useQuery({ queryKey: catalogKeys.services(), queryFn: api.listServices });
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.service(id ?? 'new'),
    queryFn: () => api.getService(id as string),
    enabled: !!id,
  });
}

export function useCategories() {
  return useQuery({ queryKey: catalogKeys.categories(), queryFn: api.listCategories });
}

export function useServiceAddons(serviceId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.addons(serviceId),
    queryFn: () => api.listAddons(serviceId),
    enabled: !!serviceId,
  });
}

export function useZones() {
  return useQuery({ queryKey: catalogKeys.zones(), queryFn: api.listZones });
}

export function useSaveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ service, addons }: { service: ServiceInput; addons: AddonInput[] }) => {
      const saved = await api.saveService(service);
      const savedAddons = await api.replaceServiceAddons(saved.id, addons);
      return { service: saved, addons: savedAddons };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

export function useArchiveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.archiveService,
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => api.saveCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.categories() }),
  });
}

export function useSaveZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ZoneInput) => api.saveZone(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.zones() }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteZone,
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.zones() }),
  });
}
