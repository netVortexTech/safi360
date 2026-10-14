import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';
import { useSaveCategory } from './hooks';

const schema = z.object({
  name_en: z.string().trim().min(1, { message: 'validation.required' }).max(80),
  name_sw: z.string().trim().min(1, { message: 'validation.required' }).max(80),
});
type Values = z.infer<typeof schema>;

export function CategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const save = useSaveCategory();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name_en: '', name_sw: '' },
  });
  const err = (k: keyof Values) => {
    const m = form.formState.errors[k]?.message;
    return m ? t(m) : undefined;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            save.mutate(
              { ...v, sort: 0 },
              {
                onSuccess: () => {
                  toast({ title: t('catalog.category_saved') });
                  form.reset();
                  onOpenChange(false);
                },
                onError: (e) =>
                  toast({ title: t('errors.generic_title'), description: t(errorKey(e)), tone: 'error' }),
              },
            ),
          )}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{t('catalog.new_category')}</DialogTitle>
          </DialogHeader>
          <Field id="cat-name_en" label={t('catalog.field.name_en')} required error={err('name_en')}>
            <Input id="cat-name_en" {...form.register('name_en')} invalid={!!err('name_en')} autoFocus />
          </Field>
          <Field id="cat-name_sw" label={t('catalog.field.name_sw')} required error={err('name_sw')}>
            <Input id="cat-name_sw" {...form.register('name_sw')} invalid={!!err('name_sw')} />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} loadingLabel={t('common.saving')}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
