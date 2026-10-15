import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useCurrentTenant } from '@/lib/tenant';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Field } from '@/components/shared/Field';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { SettingsTabs } from './SettingsPage';

interface Member {
  user_id: string;
  role: string;
  active: boolean;
  name: string;
  phone: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const ROLES = ['OWNER', 'MANAGER', 'DISPATCHER', 'CLEANER'] as const;

export default function TeamSettings() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const canManage = can(claims.tenant_role, 'staff.manage');
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant.data?.id ?? null;

  const [phone, setPhone] = useState('');
  const [newRole, setNewRole] = useState<string>('DISPATCHER');
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const members = useQuery({
    queryKey: ['settings', 'team', tenantId],
    enabled: tenantId != null,
    queryFn: async (): Promise<Member[]> => {
      const res = await supabase.from('memberships').select('*').eq('tenant_id', tenantId);
      if (res.error) throw res.error;
      const mrows = res.data as Record<string, unknown>[];
      const ids = [...new Set(mrows.map((r) => str(r.user_id)).filter(Boolean))];
      let profileById = new Map<string, Record<string, unknown>>();
      if (ids.length > 0) {
        const pres = await supabase.from('profiles').select('*').in('id', ids);
        if (!pres.error && pres.data) {
          const prows = pres.data as Record<string, unknown>[];
          profileById = new Map(prows.map((p) => [str(p.id), p]));
        }
      }
      return mrows.map((r) => {
        const p = profileById.get(str(r.user_id)) ?? {};
        const name = str(p.full_name) || str(p.display_name) || str(p.name) || str(r.user_id);
        const phoneVal = str(p.phone_e164) || str(p.phone) || '';
        const activeRaw = r.active;
        return {
          user_id: str(r.user_id),
          role: str(r.role) || 'DISPATCHER',
          active: activeRaw == null ? true : activeRaw === true,
          name,
          phone: phoneVal,
        };
      });
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['settings', 'team', tenantId] });

  const addMember = useMutation({
    mutationFn: async () => {
      const needle = phone.trim();
      if (!needle) throw new Error('phone required');
      const byE164 = await supabase.from('profiles').select('*').eq('phone_e164', needle).limit(1);
      const e164rows = byE164.data as Record<string, unknown>[] | null;
      let profile: Record<string, unknown> | null = e164rows?.[0] ?? null;
      if (!profile) {
        const byPhone = await supabase.from('profiles').select('*').eq('phone', needle).limit(1);
        if (byPhone.error) throw byPhone.error;
        const phoneRows = byPhone.data as Record<string, unknown>[] | null;
        profile = phoneRows?.[0] ?? null;
      }
      if (!profile || !str(profile.id)) {
        setLookupHint(t('settings.team_not_found_hint'));
        throw new Error(t('settings.team_not_found_hint'));
      }
      setLookupHint(null);
      const ins = await supabase
        .from('memberships')
        .insert({ tenant_id: tenantId, user_id: str(profile.id), role: newRole });
      if (ins.error) throw ins.error;
    },
    onSuccess: () => {
      setPhone('');
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      invalidate();
    },
    onError: (e) => {
      if (!lookupHint) setStatus({ kind: 'err', msg: String(e) });
    },
  });

  const changeRole = useMutation({
    mutationFn: async (vars: { user_id: string; role: string }) => {
      const res = await supabase
        .from('memberships')
        .update({ role: vars.role })
        .eq('tenant_id', tenantId)
        .eq('user_id', vars.user_id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      invalidate();
    },
    onError: (e) => setStatus({ kind: 'err', msg: String(e) }),
  });

  const deactivate = useMutation({
    mutationFn: async (user_id: string) => {
      const res = await supabase
        .from('memberships')
        .update({ active: false })
        .eq('tenant_id', tenantId)
        .eq('user_id', user_id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setDeactivating(null);
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      invalidate();
    },
    onError: (e) => setStatus({ kind: 'err', msg: String(e) }),
  });

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('settings.tab_team')} subtitle={t('settings.tab_team_desc')} />
        <ErrorState title={t('settings.no_access_title')} description={t('settings.no_access_body')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_team')}
        subtitle={t('settings.tab_team_desc')}
        breadcrumbs={[{ label: t('settings.title'), to: '/ops/settings' }, { label: t('settings.tab_team') }]}
      />
      <SettingsTabs />
      {members.isPending ? (
        <Skeleton className="h-64" />
      ) : members.isError ? (
        <ErrorState
          description={String(members.error)}
          onRetry={() => void members.refetch()}
          retrying={members.isFetching}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.team_add_heading')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <Field
                    id="team-phone"
                    label={t('settings.field_phone')}
                    hint={t('settings.team_phone_hint')}
                  >
                    <Input
                      id="team-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+255…"
                    />
                  </Field>
                </div>
                <div className="w-full md:w-48">
                  <Field id="team-role" label={t('settings.field_role')}>
                    <Select id="team-role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  onClick={() => {
                    setStatus(null);
                    addMember.mutate();
                  }}
                  loading={addMember.isPending}
                  disabled={!phone.trim()}
                >
                  {t('settings.team_add')}
                </Button>
              </div>
              {lookupHint ? <p className="text-sm text-warning-text">{lookupHint}</p> : null}
              {status ? (
                <p
                  role="status"
                  className={status.kind === 'ok' ? 'text-sm text-success-text' : 'text-sm text-error'}
                >
                  {status.msg}
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.team_list_heading')}</CardTitle>
            </CardHeader>
            <CardBody>
              {(members.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('settings.team_empty_title')}
                  description={t('settings.team_empty_body')}
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('settings.col_member')}</TH>
                      <TH>{t('settings.field_role')}</TH>
                      <TH>{t('settings.col_status')}</TH>
                      <TH>
                        <span className="sr-only">{t('settings.col_actions')}</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(members.data ?? []).map((m) => (
                      <TR key={m.user_id}>
                        <TD>
                          <p className="font-medium">{m.name}</p>
                          {m.phone ? <p className="tabular text-xs text-text-subtle">{m.phone}</p> : null}
                        </TD>
                        <TD>
                          <Select
                            value={m.role}
                            disabled={!m.active || changeRole.isPending}
                            onChange={(e) => changeRole.mutate({ user_id: m.user_id, role: e.target.value })}
                            aria-label={t('settings.field_role')}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </Select>
                        </TD>
                        <TD>
                          <Badge tone={m.active ? 'success' : 'neutral'}>
                            {t(m.active ? 'common.active' : 'common.inactive')}
                          </Badge>
                        </TD>
                        <TD>
                          {m.active ? (
                            <Button variant="ghost" size="sm" onClick={() => setDeactivating(m)}>
                              {t('settings.team_deactivate')}
                            </Button>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={deactivating != null}
        onOpenChange={(o) => {
          if (!o) setDeactivating(null);
        }}
        title={t('settings.team_deactivate_title')}
        description={
          deactivating ? t('settings.team_deactivate_body', { name: deactivating.name }) : undefined
        }
        confirmLabel={t('settings.team_deactivate')}
        destructive
        loading={deactivate.isPending}
        onConfirm={() => {
          if (deactivating) deactivate.mutate(deactivating.user_id);
        }}
      />
    </div>
  );
}
