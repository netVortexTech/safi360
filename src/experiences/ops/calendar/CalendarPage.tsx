import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, MapPin, Users } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { useCalendarEvents } from '../tickets/hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDay, formatTime, dayKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TicketChip } from '@/components/shared/TicketChip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { CalendarEvent } from '../tickets/types';

type ViewMode = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const { start, end } = useMemo(() => {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);

    if (view === 'day') {
      const start = new Date(d);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    if (view === 'week') {
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(start.getDate() - day);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    // month
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [view, currentDate]);

  const { data: events, isLoading, error, refetch } = useCalendarEvents(start, end);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events ?? []) {
      const key = dayKey(ev.scheduled_start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  // Get days to display
  const displayDays = useMemo(() => {
    const days: Date[] = [];
    if (view === 'day') {
      days.push(new Date(currentDate));
    } else if (view === 'week') {
      const d = new Date(currentDate);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      for (let i = 0; i < 7; i++) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      while (d <= end) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    }
    return days;
  }, [view, currentDate]);

  return (
    <div>
      <PageHeader
        title={t('nav.calendar')}
        subtitle={t('ops.calendar_subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border">
              {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setView(v)}
                >
                  {t(`ops.view.${v}`)}
                </Button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              {t('ops.today')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        }
      />

      {/* Date range indicator */}
      <div className="mb-4 text-center">
        <h2 className="text-h2">
          {view === 'day' && formatDay(currentDate, 'en')}
          {view === 'week' &&
            displayDays[0] &&
            displayDays[6] &&
            `${formatDay(displayDays[0], 'en')} – ${formatDay(displayDays[6], 'en')}`}
          {view === 'month' && currentDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
        </h2>
      </div>

      {isLoading && <Skeleton className="h-96" />}

      {error && <ErrorState onRetry={() => refetch()} />}

      {!isLoading && !error && (
        <>
          {view === 'day' && (
            <DayView date={currentDate} events={eventsByDay.get(dayKey(currentDate)) ?? []} />
          )}
          {view === 'week' && <WeekView days={displayDays} eventsByDay={eventsByDay} />}
          {view === 'month' && (
            <MonthView days={displayDays} eventsByDay={eventsByDay} currentDate={currentDate} />
          )}
        </>
      )}
    </div>
  );
}

function DayView({ events }: { date: Date; events: CalendarEvent[] }) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 6); // 6am to 5pm

  return (
    <Card>
      <CardBody className="p-0">
        <div className="divide-y divide-border">
          {hours.map((hour) => {
            const hourEvents = events.filter((e) => {
              const evHour = new Date(e.scheduled_start).getHours();
              return evHour === hour;
            });
            return (
              <div key={hour} className="flex min-h-[60px]">
                <div className="w-16 shrink-0 border-r border-border p-2 text-right text-xs text-text-subtle">
                  {hour}:00
                </div>
                <div className="flex-1 p-2">
                  {hourEvents.map((ev) => (
                    <EventCard key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function WeekView({ days, eventsByDay }: { days: Date[]; eventsByDay: Map<string, CalendarEvent[]> }) {
  const today = dayKey(new Date());

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const key = dayKey(day);
        const dayEvents = eventsByDay.get(key) ?? [];
        const isToday = key === today;
        return (
          <div
            key={key}
            className={cn(
              'min-h-[200px] rounded-lg border p-2',
              isToday ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <div className="mb-2 text-center">
              <p className="text-xs text-text-subtle">{day.toLocaleDateString('en', { weekday: 'short' })}</p>
              <p className={cn('text-lg font-semibold', isToday && 'text-primary')}>{day.getDate()}</p>
            </div>
            <div className="space-y-1">
              {dayEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} compact />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  eventsByDay,
  currentDate,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  currentDate: Date;
}) {
  const today = dayKey(new Date());
  const startPad = days[0]?.getDay() ?? 0;

  return (
    <Card>
      <CardBody className="p-0">
        <div className="grid grid-cols-7">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              className="border-b border-border p-2 text-center text-xs font-medium text-text-subtle"
            >
              {d}
            </div>
          ))}
          {/* Padding for first week */}
          {Array.from({ length: startPad }, (_, i) => (
            <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-border/50" />
          ))}
          {days.map((day) => {
            const key = dayKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const isToday = key === today;
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[80px] border-b border-r border-border/50 p-1',
                  !isCurrentMonth && 'bg-surface-muted/50',
                )}
              >
                <p
                  className={cn(
                    'text-right text-xs',
                    isToday ? 'font-bold text-primary' : 'text-text-subtle',
                  )}
                >
                  {day.getDate()}
                </p>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className="truncate rounded bg-primary/10 px-1 py-0.5 text-xs text-primary"
                    >
                      {formatTime(ev.scheduled_start, 'en')} {ev.ticket_ref}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-text-subtle">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function EventCard({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const address = event.address_snapshot;
  const area = typeof address.area === 'string' ? address.area : null;

  if (compact) {
    return (
      <Link
        to={`/ops/tickets/${event.booking_id}`}
        className="block rounded bg-primary/10 px-1.5 py-1 text-xs hover:bg-primary/20"
      >
        <p className="font-medium text-primary">
          {formatTime(event.scheduled_start, 'en')} {event.ticket_ref}
        </p>
        <p className="truncate text-text-subtle">{event.customer_name}</p>
      </Link>
    );
  }

  return (
    <Link
      to={`/ops/tickets/${event.booking_id}`}
      className="block rounded-lg border border-border p-3 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <TicketChip ticketRef={event.ticket_ref} size="sm" />
          <p className="mt-1 font-medium text-text">{event.customer_name}</p>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <div className="mt-2 space-y-1 text-xs text-text-subtle">
        <p className="flex items-center gap-1">
          <Clock className="size-3" aria-hidden="true" />
          {formatTime(event.scheduled_start, 'en')} – {formatTime(event.scheduled_end, 'en')}
        </p>
        {area && (
          <p className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {area}
          </p>
        )}
        {event.assignees.length > 0 && (
          <p className="flex items-center gap-1">
            <Users className="size-3" aria-hidden="true" />
            {event.assignees.map((a) => a.name).join(', ')}
          </p>
        )}
      </div>
    </Link>
  );
}

export default CalendarPage;
