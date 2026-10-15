import type { Metadata } from 'next';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Card, EmptyState, PageHeader } from '@/components/base/ui';
import { ProductForm } from '@/components/crm/QuoteEditor';
import { requireCrm } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { searchTerm } from '@/lib/crm/data';
import { money, type Product } from '@/lib/crm/types';
import { deleteProduct } from './actions';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: PageProps<'/base/crm/products'>) {
  const viewer = await requireCrm();
  const q = searchTerm((await searchParams).q);
  let query = db().from('crm_products').select('*').order('category').order('name').limit(1000);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,category.ilike.%${q}%`);
  const products = must<Product[]>(await query, 'load products');

  return (
    <>
      <PageHeader
        plain
        title="Products"
        description="Your catalogue for quotes — pick an item and its price fills in. Cost (optional) shows the margin."
        actions={
          <Dialog trigger={<><Plus size={15} /> New product</>} triggerClassName="b-btn-brass" title="New product">
            <ProductForm />
          </Dialog>
        }
      />
      <form className="mb-5 flex gap-2" action="/base/crm/products">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search name, SKU or category…" className="b-input !py-2 pl-9" />
        </label>
        <button className="b-btn-ghost" type="submit">Search</button>
      </form>
      <Card pad={false}>
        {products.length === 0 ? (
          <EmptyState icon={<Package size={20} />} title="No products yet.">Add the pieces you quote most often.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table">
              <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th className="text-right">Price</th><th className="text-right">Margin</th><th /></tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                    <td><p className="font-medium">{p.name}</p>{p.description && <p className="line-clamp-1 text-xs text-muted">{p.description}</p>}</td>
                    <td className="font-mono text-xs text-muted">{p.sku ?? '—'}</td>
                    <td className="text-muted">{p.category ?? '—'}</td>
                    <td className="text-right font-medium">{money(p.unit_price, true)}</td>
                    <td className="text-right text-muted">{p.cost != null && Number(p.unit_price) > 0 ? `${Math.round(((Number(p.unit_price) - Number(p.cost)) / Number(p.unit_price)) * 100)}%` : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet b-btn-sm" title="Edit product">
                        <ProductForm product={p} />
                      </Dialog>
                      {viewer.crm === 'manager' && (
                        <form action={deleteProduct} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <SubmitButton className="b-btn-quiet b-btn-sm" confirm={`Delete ${p.name}? Existing quotes keep their lines.`}><Trash2 size={14} /></SubmitButton>
                        </form>
                      )}
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
