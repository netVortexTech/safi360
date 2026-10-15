import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';

interface SupportRequest {
  id: string;
  subject: string;
  tenant_id: string | null;
  tenant_name?: string | null;
  status: string;
  priority: string;
  created_at: string;
}

interface SupportMessage {
  id: string;
  body: string;
  created_at: string;
}

function isMissingTable(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code?: string }).code === '42P01';
  }
  return String(err).includes('42P01');
}

export default function ControlSupport() {
  const auth = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sw' ? 'sw' : 'en';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const requestsQuery = useQuery<{ rows: SupportRequest[]; missing: boolean }>({
    queryKey: ['control', 'support-requests'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('support_requests')
          .select('id,subject,tenant_id,status,priority,created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        return { rows: data ?? [], missing: false };
      } catch (err) {
        if (isMissingTable(err)) return { rows: [], missing: true };
        throw err;
      }
    },
    enabled: auth.claims.is_super_admin,
  });

  const messagesQuery = useQuery<{ rows: SupportMessage[]; missing: boolean }>({
    queryKey: ['control', 'support-messages', selectedId],
    queryFn: async () => {
      if (!selectedId) return { rows: [], missing: false };
      try {
        const { data, error } = await supabase
          .from('support_messages')
          .select('id,body,created_at')
          .eq('request_id', selectedId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return { rows: data ?? [], missing: false };
      } catch (err) {
        if (isMissingTable(err)) return { rows: [], missing: true };
        throw err;
      }
    },
    enabled: auth.claims.is_super_admin && selectedId !== null,
  });

  const replyMutation = useMutation({
    mutationFn: async ({
      requestId,
      tenantId,
      body,
    }: {
      requestId: string;
      tenantId: string;
      body: string;
    }) => {
      const { error } = await supabase
        .from('support_messages')
        .insert({ request_id: requestId, tenant_id: tenantId, body, is_staff: true });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply('');
      void queryClient.invalidateQueries({ queryKey: ['control', 'support-messages', selectedId] });
    },
  });

  const payload = requestsQuery.data;
  const rows = useMemo(() => payload?.rows ?? [], [payload]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.subject} ${r.status} ${r.priority}`.toLowerCase().includes(needle));
  }, [rows, search]);
  const missing = payload?.missing === true;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.support.forbidden')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('control.support.title')} subtitle={t('control.support.subtitle')} />
      <Card>
        <CardBody className="space-y-4">
          <Input
            placeholder={t('control.support.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('control.support.search_placeholder')}
          />
          {requestsQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {requestsQuery.error ? (
            <ErrorState
              title={t('control.support.load_error')}
              description={String(requestsQuery.error)}
              onRetry={() => void requestsQuery.refetch()}
            />
          ) : null}
          {!requestsQuery.isLoading && !requestsQuery.error && (missing || rows.length === 0) ? (
            <EmptyState
              title={t('control.support.empty')}
              description={missing ? t('control.support.migration_pending') : t('control.support.empty_hint')}
            />
          ) : null}
          {!requestsQuery.isLoading && !requestsQuery.error && !missing && filtered.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.support.subject')}</TH>
                  <TH>{t('control.support.tenant')}</TH>
                  <TH>{t('control.support.status')}</TH>
                  <TH>{t('control.support.priority')}</TH>
                  <TH>{t('control.support.created')}</TH>
                  <TH>
                    <span className="sr-only">{t('control.support.actions')}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.subject}</TD>
                    <TD className="text-xs text-text-subtle">
                      {row.tenant_id ? row.tenant_id.slice(0, 8) : '-'}
                    </TD>
                    <TD>
                      <Badge tone={row.status === 'open' ? 'warning' : 'neutral'}>{row.status}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={row.priority === 'high' ? 'error' : 'outline'}>{row.priority}</Badge>
                    </TD>
                    <TD className="text-xs text-text-subtle">{formatDay(row.created_at, locale)}</TD>
                    <TD>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(row.id)}>
                        {t('control.support.view')}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </CardBody>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>{selected.subject}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {messagesQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
            {messagesQuery.error ? (
              <ErrorState
                title={t('control.support.load_error')}
                description={String(messagesQuery.error)}
                onRetry={() => void messagesQuery.refetch()}
              />
            ) : null}
            {!messagesQuery.isLoading &&
            !messagesQuery.error &&
            (messagesQuery.data?.rows.length ?? 0) === 0 ? (
              <EmptyState
                title={t('control.support.no_messages')}
                description={t('control.support.no_messages_hint')}
              />
            ) : null}
            {(messagesQuery.data?.rows ?? []).map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-3 text-sm">
                <p>{m.body}</p>
                <p className="mt-1 text-xs text-text-subtle">{formatDay(m.created_at, locale)}</p>
              </div>
            ))}
            {!messagesQuery.data?.missing ? (
              <div className="space-y-2">
                <Field id="support-reply" label={t('control.support.reply')} required>
                  <Textarea
                    id="support-reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={t('control.support.reply_placeholder')}
                  />
                </Field>
                {replyMutation.error ? (
                  <p className="text-sm text-error">{String(replyMutation.error)}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedId(null);
                      setReply('');
                    }}
                  >
                    {t('common.close')}
                  </Button>
                  <Button
                    disabled={reply.trim() === ''}
                    loading={replyMutation.isPending}
                    onClick={() => {
                      if (selectedId && selected?.tenant_id && reply.trim() !== '') {
                        void replyMutation.mutateAsync({
                          requestId: selectedId,
                          tenantId: selected.tenant_id,
                          body: reply.trim(),
                        });
                      }
                    }}
                  >
                    {t('control.support.send_reply')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
