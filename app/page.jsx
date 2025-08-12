import Link from 'next/link';
import {getSession} from '@/lib/session';

export default async function Home() {
  const session = await getSession();
  if (!session?.user) {
    return (
      <main className="min-h-screen flex items-center justify-center p-10">
        <a href="/login" className="underline">
          Please sign in
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CPMCRM2</h1>
        <form action="/api/logout" method="POST">
          <button className="border rounded px-3 py-2 hover:bg-gray-50">Logout</button>
        </form>
      </div>
      <p>Welcome, {session.user.username}</p>
      <ul className="list-disc pl-5">
        <li>
          <Link className="underline" href="/employees">
            Employees
          </Link>
        </li>
      </ul>
    </main>
  );
}
