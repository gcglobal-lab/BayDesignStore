'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, Eraser, MapPinned, Navigation, PackageCheck, PackageX, Truck, X } from 'lucide-react';
import { completeStop, failStop, stopProgress } from '@/app/base/(app)/deliveries/my-route/actions';
import { ActionForm, SubmitButton } from '@/components/base/forms';
import type { OrderStatus } from '@/lib/deliveries/types';

/** Best-effort GPS fix for the delivery record (never blocks the driver for long). */
function getFix(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  });
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#17173A';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          className="h-36 w-full touch-none rounded-xl border border-dashed border-stone bg-white"
          onPointerDown={(e) => {
            drawing.current = true;
            canvas.current!.setPointerCapture(e.pointerId);
            const ctx = canvas.current!.getContext('2d')!;
            ctx.beginPath();
            ctx.moveTo(...pos(e));
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvas.current!.getContext('2d')!;
            ctx.lineTo(...pos(e));
            ctx.stroke();
            inked.current = true;
            setEmpty(false);
          }}
          onPointerUp={() => {
            drawing.current = false;
            if (inked.current) onChange(canvas.current!.toDataURL('image/png'));
          }}
          aria-label="Signature — sign with your finger"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Customer signs here</span>}
      </div>
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs text-muted"
        onClick={() => {
          const c = canvas.current!;
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
          inked.current = false;
          setEmpty(true);
          onChange('');
        }}
      >
        <Eraser size={12} /> Clear
      </button>
    </div>
  );
}

/** Photos from the phone camera, shrunk to ~1280px JPEG before upload. */
function PhotoInput({ photos, setPhotos }: { photos: string[]; setPhotos: (p: string[]) => void }) {
  const shrink = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <span key={i} className="relative">
            <img src={p} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone" />
            <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white" aria-label="Remove photo"><X size={12} /></button>
          </span>
        ))}
        {photos.length < 4 && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone text-xs text-muted">
            <Camera size={18} /> Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setPhotos([...photos, await shrink(f)]);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

/** The buttons on each stop of the driver's route. */
export default function DriverStop({ id, status, items, reasons }: { id: string; status: OrderStatus; items: { id: string; description: string; quantity: number }[]; reasons: string[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'done' | 'fail'>('none');
  const [signature, setSignature] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode !== 'none') getFix().then(setFix);
  }, [mode]);

  const progress = (next: 'en_route' | 'arrived') =>
    start(async () => {
      const where = await getFix();
      const fd = new FormData();
      fd.set('id', id);
      fd.set('status', next);
      if (where) {
        fd.set('lat', String(where.lat));
        fd.set('lng', String(where.lng));
      }
      await stopProgress(fd);
      router.refresh();
    });

  if (status === 'delivered') return <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Delivered</p>;
  if (status === 'failed' || status === 'cancelled') return <p className="flex items-center gap-2 text-sm font-semibold text-red-700"><PackageX size={16} /> {status === 'failed' ? 'Not delivered' : 'Cancelled'}</p>;

  const geo = fix && (
    <>
      <input type="hidden" name="lat" value={fix.lat} />
      <input type="hidden" name="lng" value={fix.lng} />
    </>
  );

  return (
    <div className="space-y-3">
      {mode === 'none' && (
        <div className={`grid grid-cols-2 gap-2 ${pending ? 'opacity-60' : ''}`}>
          {status === 'scheduled' && (
            <button type="button" disabled={pending} onClick={() => progress('en_route')} className="b-btn-ghost col-span-2 !py-3"><Truck size={16} /> On my way</button>
          )}
          {(status === 'scheduled' || status === 'en_route') && (
            <button type="button" disabled={pending} onClick={() => progress('arrived')} className="b-btn-ghost col-span-2 !py-3"><MapPinned size={16} /> Arrived</button>
          )}
          <button type="button" onClick={() => setMode('done')} className="b-btn !py-3 bg-emerald-600 text-white hover:bg-emerald-700"><PackageCheck size={16} /> Delivered</button>
          <button type="button" onClick={() => setMode('fail')} className="b-btn-danger !py-3"><PackageX size={16} /> Problem</button>
        </div>
      )}

      {mode === 'done' && (
        <ActionForm action={completeStop} className="space-y-3 rounded-2xl bg-emerald-50 p-3" onSuccess={() => router.refresh()}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="signature" value={signature} />
          {photos.map((p, i) => <input key={i} type="hidden" name="photo" value={p} />)}
          {geo}
          {items.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="b-label">Delivered items</legend>
              {items.map((it) => (
                <label key={it.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="item" value={it.id} className="b-check" defaultChecked /> {it.quantity}× {it.description}</label>
              ))}
            </fieldset>
          )}
          <input name="recipient_name" className="b-input" placeholder="Received by (name)" maxLength={120} />
          <SignaturePad onChange={setSignature} />
          <PhotoInput photos={photos} setPhotos={setPhotos} />
          <textarea name="driver_notes" className="b-input min-h-[60px]" placeholder="Notes (optional)" maxLength={2000} />
          <div className="flex gap-2">
            <SubmitButton className="b-btn flex-1 !py-3 bg-emerald-600 text-white hover:bg-emerald-700" pendingLabel="Saving…"><CheckCircle2 size={16} /> Confirm delivery</SubmitButton>
            <button type="button" className="b-btn-quiet" onClick={() => setMode('none')}>Back</button>
          </div>
        </ActionForm>
      )}

      {mode === 'fail' && (
        <ActionForm action={failStop} className="space-y-3 rounded-2xl bg-red-50 p-3" onSuccess={() => router.refresh()}>
          <input type="hidden" name="id" value={id} />
          {photos.map((p, i) => <input key={i} type="hidden" name="photo" value={p} />)}
          {geo}
          <select name="reason" className="b-input" required defaultValue="">
            <option value="" disabled>What went wrong?</option>
            {reasons.map((r) => <option key={r}>{r}</option>)}
          </select>
          <PhotoInput photos={photos} setPhotos={setPhotos} />
          <textarea name="driver_notes" className="b-input min-h-[60px]" placeholder="Details for the office" maxLength={2000} />
          <div className="flex gap-2">
            <SubmitButton className="b-btn-danger flex-1 !py-3" pendingLabel="Saving…"><PackageX size={16} /> Couldn’t deliver</SubmitButton>
            <button type="button" className="b-btn-quiet" onClick={() => setMode('none')}>Back</button>
          </div>
        </ActionForm>
      )}
      <p className="flex items-center gap-1 text-[0.68rem] text-muted"><Navigation size={11} /> Your location is saved with each update.</p>
    </div>
  );
}
