'use client';

import { useState, type ComponentProps, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LockIcon } from 'lucide-react';
import { ShippingAddressSchema, type ShippingAddress } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Chip, Panel, tone } from '@/components/dashboard';
import { api } from '@/lib/api';
import { creatorKeys } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';

const COUNTRIES = [
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'PH', label: 'Philippines' },
  { code: 'TH', label: 'Thailand' },
] as const;

const EMPTY: ShippingAddress = { name: '', line1: '', line2: '', city: '', postcode: '', country: 'MY', phone: '' };

/** Encrypted shipping address for a product campaign (PUT /enrollments/:id/address). */
export function WorkShippingForm({ enrollmentId }: { enrollmentId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ShippingAddress>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({});

  const set = (key: keyof ShippingAddress) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const parsed = ShippingAddressSchema.safeParse(form);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof ShippingAddress] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api(`/enrollments/${enrollmentId}/address`, { method: 'PUT', body: JSON.stringify(parsed.data) });
      await qc.invalidateQueries({ queryKey: creatorKeys.enrollments });
      toast.success('Address saved. Only this brand can see it.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof ShippingAddress, label: string, props: Partial<ComponentProps<'input'>> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`addr-${key}`}>{label}</Label>
      <Input
        id={`addr-${key}`}
        value={form[key]}
        onChange={set(key)}
        aria-invalid={!!errors[key] || undefined}
        aria-describedby={errors[key] ? `addr-${key}-err` : undefined}
        {...props}
      />
      {errors[key] && (
        <p id={`addr-${key}-err`} className="text-xs text-destructive">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Where should the brand ship it?</h3>
        <Chip label="Encrypted" color={tone.money} icon={LockIcon} />
      </div>
      <p className="text-xs text-muted-foreground">Only this brand sees it. Deleted 30 days after the campaign ends.</p>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">{field('name', 'Full name', { autoComplete: 'name' })}</div>
        <div className="sm:col-span-2">{field('line1', 'Street address', { autoComplete: 'address-line1' })}</div>
        <div className="sm:col-span-2">{field('line2', 'Apartment, unit (optional)', { autoComplete: 'address-line2' })}</div>
        {field('city', 'City', { autoComplete: 'address-level2' })}
        {field('postcode', 'Postcode', { autoComplete: 'postal-code', inputMode: 'numeric' })}
        {field('phone', 'Phone', { autoComplete: 'tel', type: 'tel' })}
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">Country</legend>
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                aria-pressed={form.country === c.code}
                onClick={() => setForm((f) => ({ ...f, country: c.code }))}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Chip label={c.label} color={form.country === c.code ? tone.primary : tone.muted} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" variant="gradient" className="h-10 px-5" disabled={busy}>
            {busy ? 'Saving…' : 'Save address'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
