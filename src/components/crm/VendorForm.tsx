'use client';

import { createVendor, updateVendor } from '@/app/base/(app)/crm/vendors/actions';
import { useDialog } from '@/components/base/Dialog';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';

export type Vendor = { id: string; name: string; vendor_number: string; email: string; cc: string | null; bcc: string | null; address: string; contact_email: string | null };

/** Add or edit a vendor: name, number, email (+ optional CC / BCC), address, contact person's email. */
export default function VendorForm({ vendor }: { vendor?: Vendor }) {
  const { close } = useDialog();
  const id = vendor?.id ?? 'new';
  return (
    <ActionForm action={vendor ? updateVendor : createVendor} resetOnSuccess={!vendor} onSuccess={close} className="space-y-4">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`v-name-${id}`}><input id={`v-name-${id}`} name="name" className="b-input" required maxLength={160} autoFocus defaultValue={vendor?.name} /></Field>
        <Field label="Vendor number" htmlFor={`v-num-${id}`}><input id={`v-num-${id}`} name="vendor_number" className="b-input" required maxLength={60} defaultValue={vendor?.vendor_number} /></Field>
      </div>
      <Field label="Email" htmlFor={`v-email-${id}`}><input id={`v-email-${id}`} name="email" type="email" className="b-input" required maxLength={254} defaultValue={vendor?.email} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CC (optional)" htmlFor={`v-cc-${id}`} hint="Separate several with commas."><input id={`v-cc-${id}`} name="cc" className="b-input" maxLength={1000} defaultValue={vendor?.cc ?? ''} /></Field>
        <Field label="BCC (optional)" htmlFor={`v-bcc-${id}`} hint="Separate several with commas."><input id={`v-bcc-${id}`} name="bcc" className="b-input" maxLength={1000} defaultValue={vendor?.bcc ?? ''} /></Field>
      </div>
      <Field label="Address" htmlFor={`v-addr-${id}`}><textarea id={`v-addr-${id}`} name="address" className="b-input min-h-[60px]" required maxLength={400} defaultValue={vendor?.address} /></Field>
      <Field label="Contact person’s email (optional)" htmlFor={`v-contact-${id}`}><input id={`v-contact-${id}`} name="contact_email" type="email" className="b-input" maxLength={254} defaultValue={vendor?.contact_email ?? ''} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{vendor ? 'Save vendor' : 'Add vendor'}</SubmitButton></div>
    </ActionForm>
  );
}
