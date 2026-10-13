import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-ivory px-6 text-center">
      <Logo tone="dark" size="md" />
      <div>
        <p className="eyebrow justify-center">Page not found</p>
        <h1 className="display mt-4 text-5xl md:text-6xl">This room is still being designed.</h1>
        <p className="mx-auto mt-4 max-w-md text-muted">The page you were looking for has moved or no longer exists.</p>
      </div>
      <Link href="/" className="btn-primary">Back to Bay Design Store</Link>
    </main>
  );
}
