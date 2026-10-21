import type { Metadata } from 'next';
import { Pencil, Plus, Search, Store, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import VendorForm, { type Vendor } from '@/components/crm/VendorForm';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { searchTerm } from '@/lib/crm/data';
import { deleteVendor } from './actions';

export const metadata: Metadata = { title: 'Vendors' };

export default async function VendorsPage({ searchParams }: PageProps<'/base/crm/vendors'>) {
  await requireCrm();
  const q = searchTerm((await searchParams).q);
  let query = db().from('crm_vendors').select('id, name, vendor_number, email, cc, bcc, address, contact_email').order('name').limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,vendor_number.ilike.%${q}%,email.ilike.%${q}%,address.ilike.%${q}%,contact_email.ilike.%${q}%`);
  const vendors = must<Vendor[]>(await query, 'load vendors');

  return (
    <>
      <PageHeader
        plain
        title="Vendors"
        description={`${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'} — who the store buys from, and where their orders are emailed.`}
        actions={
          <Dialog trigger={<><Plus size={15} /> New vendor</>} triggerClassName="b-btn-brass" title="New vendor" wide>
            <VendorForm />
          </Dialog>
        }
      />

      <form className="mb-5 flex flex-wrap items-center gap-2" action="/base/crm/vendors">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search name, number, email, address…" className="b-input !py-2 pl-9" />
        </label>
        <button type="submit" className="b-btn-ghost">Search</button>
      </form>

      <Card pad={false}>
        {vendors.length === 0 ? (
          <EmptyState icon={<Store size={20} />} title={q ? `No vendors match “${q}”.` : 'No vendors yet.'}>Add one with “New vendor”.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Vendor</th><th>Number</th><th>Email</th><th>CC / BCC</th><th>Address</th><th>Contact person</th><th /></tr></thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium">{v.name}</td>
                    <td className="tabular-nums">{v.vendor_number}</td>
                    <td><a href={`mailto:${v.email}`} className="hover:text-brass-dark">{v.email}</a></td>
                    <td className="text-xs text-muted">
                      {v.cc && <p>CC: {v.cc}</p>}
                      {v.bcc && <p>BCC: {v.bcc}</p>}
                      {!v.cc && !v.bcc && '—'}
                    </td>
                    <td className="max-w-[16rem] whitespace-pre-line text-muted">{v.address}</td>
                    <td className="text-muted">{v.contact_email ? <a href={`mailto:${v.contact_email}`} className="hover:text-brass-dark">{v.contact_email}</a> : '—'}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet b-btn-sm" title={`Edit ${v.name}`} wide>
                          <VendorForm vendor={v} />
                        </Dialog>
                        <form action={deleteVendor}>
                          <input type="hidden" name="id" value={v.id} />
                          <SubmitButton className="b-btn-quiet b-btn-sm hover:text-red-600" confirm={`Delete the vendor ${v.name}?`}><Trash2 size={14} /></SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
