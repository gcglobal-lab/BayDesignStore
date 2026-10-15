'use client';

import { createCompany, updateCompany } from '@/app/base/(app)/crm/companies/actions';
import { createContact, importContacts, updateContact } from '@/app/base/(app)/crm/contacts/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { lifecycleLabel, type Company, type Contact, type Lifecycle, type Person } from '@/lib/crm/types';
import Select from '@/components/ui/Select';

type Option = { id: string; name: string };

export function ContactForm({ owners, companies, sources, me, contact, defaultCompany }: { owners: Person[]; companies: Option[]; sources: string[]; me: string | null; contact?: Contact; defaultCompany?: string }) {
  return (
    <ActionForm action={contact ? updateContact : createContact} className="space-y-4">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="ct-first"><input id="ct-first" name="first_name" className="b-input" required maxLength={80} defaultValue={contact?.first_name} /></Field>
        <Field label="Last name" htmlFor="ct-last"><input id="ct-last" name="last_name" className="b-input" maxLength={80} defaultValue={contact?.last_name} /></Field>
        <Field label="Email" htmlFor="ct-email"><input id="ct-email" name="email" type="email" className="b-input" maxLength={254} defaultValue={contact?.email ?? ''} /></Field>
        <Field label="Phone" htmlFor="ct-phone"><input id="ct-phone" name="phone" type="tel" className="b-input" maxLength={40} defaultValue={contact?.phone ?? ''} /></Field>
        <Field label="Company" htmlFor="ct-company">
          <Select id="ct-company" name="company_id" className="b-input" defaultValue={contact?.company_id ?? defaultCompany ?? ''}>
            <option value="">— None —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Job title" htmlFor="ct-title"><input id="ct-title" name="title" className="b-input" maxLength={120} defaultValue={contact?.title ?? ''} /></Field>
        <Field label="Stage" htmlFor="ct-life">
          <Select id="ct-life" name="lifecycle" className="b-input" defaultValue={contact?.lifecycle ?? 'lead'}>
            {(Object.keys(lifecycleLabel) as Lifecycle[]).map((k) => <option key={k} value={k}>{lifecycleLabel[k]}</option>)}
          </Select>
        </Field>
        <Field label="Source" htmlFor="ct-source">
          <Select id="ct-source" name="source" className="b-input" defaultValue={contact?.source ?? ''}>
            <option value="">—</option>
            {[...new Set([...sources, ...(contact?.source ? [contact.source] : [])])].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="ct-owner">
          <Select people id="ct-owner" name="owner_id" className="b-input" defaultValue={contact ? (contact.owner_id ?? '') : (me ?? '')}>
            <option value="">— Unassigned —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="ct-tags" hint="Comma-separated"><input id="ct-tags" name="tags" className="b-input" defaultValue={contact?.tags.join(', ') ?? ''} placeholder="VIP, Port Royal" /></Field>
      </div>
      <fieldset className="grid gap-3 rounded-2xl border border-stone/60 p-3 sm:grid-cols-6">
        <legend className="b-label px-1">Address (used for deliveries)</legend>
        <input name="address1" className="b-input sm:col-span-6" placeholder="Street address" maxLength={200} defaultValue={contact?.address1 ?? ''} />
        <input name="address2" className="b-input sm:col-span-6" placeholder="Apt, suite, gate code…" maxLength={200} defaultValue={contact?.address2 ?? ''} />
        <input name="city" className="b-input sm:col-span-3" placeholder="City" maxLength={80} defaultValue={contact?.city ?? ''} />
        <input name="state" className="b-input sm:col-span-1" placeholder="FL" maxLength={40} defaultValue={contact?.state ?? ''} />
        <input name="postal_code" className="b-input sm:col-span-2" placeholder="Zip" maxLength={20} defaultValue={contact?.postal_code ?? ''} />
      </fieldset>
      <Field label="Notes" htmlFor="ct-notes"><textarea id="ct-notes" name="notes" className="b-input min-h-[70px]" maxLength={5000} defaultValue={contact?.notes ?? ''} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="do_not_contact" className="b-check" defaultChecked={contact?.do_not_contact} /> Do not contact (no marketing)</label>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{contact ? 'Save contact' : 'Add contact'}</SubmitButton></div>
    </ActionForm>
  );
}

export function CompanyForm({ owners, me, company }: { owners: Person[]; me: string | null; company?: Company }) {
  return (
    <ActionForm action={company ? updateCompany : createCompany} className="space-y-4">
      {company && <input type="hidden" name="id" value={company.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" htmlFor="co-name" className="sm:col-span-2"><input id="co-name" name="name" className="b-input" required maxLength={160} defaultValue={company?.name} /></Field>
        <Field label="Industry / type" htmlFor="co-ind"><input id="co-ind" name="industry" className="b-input" maxLength={80} placeholder="Interior designer, builder, hotel…" defaultValue={company?.industry ?? ''} /></Field>
        <Field label="Website" htmlFor="co-web"><input id="co-web" name="website" className="b-input" maxLength={200} defaultValue={company?.website ?? ''} /></Field>
        <Field label="Phone" htmlFor="co-phone"><input id="co-phone" name="phone" className="b-input" maxLength={40} defaultValue={company?.phone ?? ''} /></Field>
        <Field label="Email" htmlFor="co-email"><input id="co-email" name="email" type="email" className="b-input" maxLength={254} defaultValue={company?.email ?? ''} /></Field>
        <Field label="Street address" htmlFor="co-addr" className="sm:col-span-2"><input id="co-addr" name="address1" className="b-input" maxLength={200} defaultValue={company?.address1 ?? ''} /></Field>
        <div className="grid grid-cols-6 gap-2 sm:col-span-2">
          <input name="city" className="b-input col-span-3" placeholder="City" maxLength={80} defaultValue={company?.city ?? ''} />
          <input name="state" className="b-input col-span-1" placeholder="FL" maxLength={40} defaultValue={company?.state ?? ''} />
          <input name="postal_code" className="b-input col-span-2" placeholder="Zip" maxLength={20} defaultValue={company?.postal_code ?? ''} />
        </div>
        <Field label="Owner" htmlFor="co-owner">
          <Select people id="co-owner" name="owner_id" className="b-input" defaultValue={company ? (company.owner_id ?? '') : (me ?? '')}>
            <option value="">— Unassigned —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="co-notes"><textarea id="co-notes" name="notes" className="b-input min-h-[70px]" maxLength={5000} defaultValue={company?.notes ?? ''} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{company ? 'Save company' : 'Add company'}</SubmitButton></div>
    </ActionForm>
  );
}

export function ImportContactsForm() {
  return (
    <ActionForm action={importContacts} resetOnSuccess className="space-y-4">
      <p className="text-sm text-muted">
        Upload a CSV with a header row — from Excel, Google Contacts, Outlook or another CRM. Recognised columns: First name, Last name (or Name), Email, Phone, Company, Title,
        Address, City, State, Zip, Source, Tags, Notes. Rows with an email that already exists are skipped.
      </p>
      <input type="file" name="file" accept=".csv,text/csv" className="b-input" />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">…or paste the rows</summary>
        <textarea name="csv" className="b-input mt-2 min-h-[120px] font-mono text-xs" placeholder={'First name,Last name,Email,Phone\nJane,Smith,jane@example.com,239-555-0100'} />
      </details>
      <Field label="Stage for imported contacts" htmlFor="imp-life">
        <Select id="imp-life" name="lifecycle" className="b-input" defaultValue="lead">
          {(Object.keys(lifecycleLabel) as Lifecycle[]).map((k) => <option key={k} value={k}>{lifecycleLabel[k]}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass" pendingLabel="Importing…">Import contacts</SubmitButton></div>
    </ActionForm>
  );
}
