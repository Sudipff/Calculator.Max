import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
      <p className="text-slate-500 text-sm mb-4">The requested resource could not be found.</p>
      <Link
        href="/"
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-2xl text-sm transition-all shadow-md"
      >
        Return Home
      </Link>
    </div>
  );
}
