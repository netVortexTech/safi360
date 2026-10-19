import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Banknote,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  LayoutDashboard,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Store,
  Truck,
  Users,
  Wrench,
  type Icon,
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { setPreferredLocale, type Locale } from '@/i18n';
import { cn } from '@/lib/utils';

// Photos: Pexels (free licence, hotlinked with their resizing params).
const IMG = {
  hero: 'https://images.pexels.com/photos/6196694/pexels-photo-6196694.jpeg?auto=compress&cs=tinysrgb&w=1100',
  dar: 'https://images.pexels.com/photos/2802903/pexels-photo-2802903.jpeg?auto=compress&cs=tinysrgb&w=1100',
};

function LangToggle({ locale }: { locale: Locale }) {
  return (
    <div role="group" aria-label="Language" className="inline-flex rounded border border-border text-xs">
      {(['sw', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setPreferredLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            'px-2 py-1 font-medium uppercase first:rounded-l last:rounded-r',
            locale === l ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-muted',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-h1">{title}</h2>
      {sub && <p className="mt-2 text-text-muted">{sub}</p>}
    </div>
  );
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'en' ? 'en' : 'sw';

  useEffect(() => {
    const previous = document.title;
    document.title = t('landing.doc_title');
    return () => {
      document.title = previous;
    };
  }, [t]);

  const experiences: { icon: Icon; title: string; desc: string }[] = [
    { icon: Store, title: t('landing.exp_portal'), desc: t('landing.exp_portal_desc') },
    { icon: LayoutDashboard, title: t('landing.exp_ops'), desc: t('landing.exp_ops_desc') },
    { icon: Phone, title: t('landing.exp_field'), desc: t('landing.exp_field_desc') },
    { icon: ShieldCheck, title: t('landing.exp_control'), desc: t('landing.exp_control_desc') },
  ];

  const features: { icon: Icon; title: string; desc: string }[] = [
    { icon: Calendar, title: t('landing.f1_title'), desc: t('landing.f1_desc') },
    { icon: Truck, title: t('landing.f2_title'), desc: t('landing.f2_desc') },
    { icon: Wrench, title: t('landing.f3_title'), desc: t('landing.f3_desc') },
    { icon: Banknote, title: t('landing.f4_title'), desc: t('landing.f4_desc') },
    { icon: BellRing, title: t('landing.f5_title'), desc: t('landing.f5_desc') },
    { icon: FileText, title: t('landing.f6_title'), desc: t('landing.f6_desc') },
  ];

  const steps = [1, 2, 3].map((n) => ({
    n,
    title: t(`landing.how${n}_title`),
    desc: t(`landing.how${n}_desc`),
  }));

  const plans = [
    { id: 'starter', name: 'Starter', price: '45,000', desc: t('landing.starter_desc'), popular: false,
      limits: [t('landing.starter_l1'), t('landing.starter_l2'), t('landing.starter_l3')] },
    { id: 'growth', name: 'Growth', price: '95,000', desc: t('landing.growth_desc'), popular: true,
      limits: [t('landing.growth_l1'), t('landing.growth_l2'), t('landing.growth_l3')] },
    { id: 'pro', name: 'Pro', price: '180,000', desc: t('landing.pro_desc'), popular: false,
      limits: [t('landing.pro_l1'), t('landing.pro_l2'), t('landing.pro_l3')] },
  ];

  const faqs = [1, 2, 3, 4].map((n) => ({
    q: t(`landing.faq${n}_q`),
    a: t(`landing.faq${n}_a`),
  }));

  const navLinks = [
    ['#features', t('landing.nav_features')],
    ['#how', t('landing.nav_how')],
    ['#pricing', t('landing.nav_pricing')],
    ['#faq', t('landing.nav_faq')],
  ] as const;

  return (
    <div className="min-h-dvh bg-surface-page text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('landing.skip')}
      </a>

      {/* ---- Nav ---- */}
      <header className="safe-top sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
              S
            </span>
            <span className="text-lg font-bold">Safi360</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium text-text-muted md:flex">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-text">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <LangToggle locale={locale} />
            <Button asChild size="sm">
              <Link to="/ops/login">{t('landing.nav_signin')}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---- Hero ---- */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-40 -top-40 size-[480px] rounded-full bg-primary-light" aria-hidden="true" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
            <div className="relative">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light px-3 py-1 text-sm font-medium text-primary">
                <MapPin className="size-4" aria-hidden="true" /> {t('landing.hero_eyebrow')}
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                {t('landing.hero_title')}
              </h1>
              <p className="mt-4 max-w-prose text-lg text-text-muted">{t('landing.hero_sub')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/ops/login">
                    {t('landing.hero_cta')} <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link to="/usafi-bora">{t('landing.hero_demo')}</Link>
                </Button>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-text-subtle">
                <Clock className="size-4" aria-hidden="true" /> {t('landing.trust_line')}
              </p>
            </div>

            <div className="relative">
              <img
                src={IMG.hero}
                alt={t('landing.hero_alt')}
                width={1100}
                height={733}
                className="aspect-[4/3] w-full rounded-2xl object-cover shadow-sheet"
              />
              <div className="absolute -left-3 top-6 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card md:-left-8">
                <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                <span className="font-medium">{t('landing.chip_booking')}</span>
                <span className="tabular text-text-subtle">UBC-0231</span>
              </div>
              <div className="absolute -bottom-4 right-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
                <Banknote className="size-5 text-primary" aria-hidden="true" />
                <span className="font-medium">{t('landing.chip_payment')}</span>
                <span className="tabular text-text-subtle">TZS 45,000</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Four experiences ---- */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="mb-8 text-center text-h2">{t('landing.exp_title')}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {experiences.map((e) => (
                <div key={e.title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
                    <e.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{e.title}</h3>
                    <p className="mt-1 text-sm text-text-muted">{e.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <SectionTitle title={t('landing.features_title')} sub={t('landing.features_sub')} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article key={f.title} className="rounded-xl border border-border bg-surface p-6 shadow-card">
                  <span className="mb-4 grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-h3">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <SectionTitle title={t('landing.how_title')} />
            <ol className="grid gap-8 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="relative text-center md:text-left">
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-navy text-lg font-bold text-navy-foreground md:mx-0">
                    {s.n}
                  </span>
                  <h3 className="text-h3">{s.title}</h3>
                  <p className="mt-2 text-sm text-text-muted">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---- Product showcase ---- */}
        <section className="overflow-hidden">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <SectionTitle title={t('landing.showcase_title')} sub={t('landing.showcase_sub')} />
            <div className="relative mx-auto flex max-w-4xl items-end justify-center gap-6">
              <img
                src="/landing/portal-desktop.png"
                alt={t('landing.showcase_desktop_alt')}
                width={1280}
                height={720}
                loading="lazy"
                className="hidden w-3/4 rounded-xl border border-border shadow-sheet sm:block"
              />
              <img
                src="/landing/portal-phone.png"
                alt={t('landing.showcase_phone_alt')}
                width={393}
                height={851}
                loading="lazy"
                className="w-56 rounded-2xl border-4 border-navy shadow-sheet sm:-ml-24 sm:mb-[-2rem]"
              />
            </div>
          </div>
        </section>

        {/* ---- Built for Tanzania ---- */}
        <section className="border-y border-border bg-navy text-navy-foreground">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
            <div>
              <h2 className="text-h1">{t('landing.tz_title')}</h2>
              <p className="mt-2 text-navy-foreground/80">{t('landing.tz_sub')}</p>
              <ul className="mt-6 space-y-3">
                {[t('landing.tz1'), t('landing.tz2'), t('landing.tz3'), t('landing.tz4')].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-amber" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <img
              src={IMG.dar}
              alt={t('landing.tz_alt')}
              width={1100}
              height={733}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section id="pricing" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <SectionTitle title={t('landing.pricing_title')} sub={t('landing.pricing_sub')} />
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((p) => (
                <article
                  key={p.id}
                  className={cn(
                    'relative flex flex-col rounded-xl border bg-surface p-6 shadow-card',
                    p.popular ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber px-3 py-0.5 text-xs font-semibold text-amber-foreground">
                      <Star className="size-3" aria-hidden="true" /> {t('landing.popular')}
                    </span>
                  )}
                  <h3 className="text-h3">{p.name}</h3>
                  <p className="text-sm text-text-muted">{p.desc}</p>
                  <p className="mt-4">
                    <span className="tabular text-4xl font-bold">{p.price}</span>{' '}
                    <span className="text-sm text-text-subtle">{t('landing.per_month')}</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {p.limits.map((l) => (
                      <li key={l} className="flex items-center gap-2">
                        <Users className="size-4 text-primary" aria-hidden="true" /> {l}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={p.popular ? 'primary' : 'secondary'} className="mt-6 w-full">
                    <Link to="/ops/login">{t('landing.plan_cta')}</Link>
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 md:py-20">
            <SectionTitle title={t('landing.faq_title')} />
            <div className="space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-xl border border-border bg-surface-page p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown className="size-5 shrink-0 text-text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Final CTA ---- */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <h2 className="text-h1">{t('landing.cta_title')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">{t('landing.cta_sub')}</p>
            <Button asChild size="lg" className="mt-8 bg-surface text-primary hover:bg-surface-muted">
              <Link to="/ops/login">
                {t('landing.cta_button')} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer className="safe-bottom border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-text-muted md:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">
              S
            </span>
            <span>{t('landing.footer_tagline')}</span>
          </div>
          <nav aria-label="Footer" className="flex items-center gap-5">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-text">
                {label}
              </a>
            ))}
            <Link to="/ops/login" className="hover:text-text">
              {t('landing.nav_signin')}
            </Link>
          </nav>
          <p className="flex items-center gap-3">
            <span>{t('landing.footer_rights', { year: new Date().getFullYear() })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('landing.footer_made')}</span>
            <span aria-hidden="true">·</span>
            <span className="text-text-subtle">{t('landing.photo_credit')}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
