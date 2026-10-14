import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export type DataViewState = 'loading' | 'error' | 'empty' | 'data';

export interface DataViewProps<T> {
  state: DataViewState;
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Card layout below 768px. */
  renderCard: (row: T) => ReactNode;
  onRowClick?: ((row: T) => void) | undefined;
  empty: ReactNode;
  error: ReactNode;
  caption: string;
  skeletonRows?: number;
  className?: string;
}

/**
 * Table ≥768px, cards below (ui-spec responsive rule). Loading/error/empty are real
 * branches driven by the query state, never a spinner over stale data.
 */
export function DataView<T>({
  state,
  rows,
  columns,
  rowKey,
  renderCard,
  onRowClick,
  empty,
  error,
  caption,
  skeletonRows = 5,
  className,
}: DataViewProps<T>) {
  if (state === 'error') return <div data-state="error">{error}</div>;
  if (state === 'empty') return <div data-state="empty">{empty}</div>;

  if (state === 'loading') {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true" data-state="loading">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className={className} data-state="data">
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <THead>
            <tr>
              {columns.map((c) => (
                <TH key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR
                key={rowKey(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TD key={c.key} className={cn(c.align === 'right' && 'tabular text-right', c.className)}>
                    {c.cell(row)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)}>{renderCard(row)}</li>
        ))}
      </ul>
    </div>
  );
}
