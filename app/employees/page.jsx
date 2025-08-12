import Link from 'next/link';
import {getDb} from '@/lib/db';

const PAGE_SIZE_DEFAULT = 20;

async function getEmployees({page = 1, size = PAGE_SIZE_DEFAULT, activeOnly = true}) {
  const db = await getDb();
  const where = activeOnly ? 'WHERE active=1' : '';
  const [[{count}]] = await db.query(`SELECT COUNT(*) AS count FROM easyopti.employees ${where}`);
  const offset = (page - 1) * size;
  const [rows] = await db.query(
    `SELECT empid, active, last_login_datetime, api_user
     FROM easyopti.employees
     ${where}
     ORDER BY empid ASC
     LIMIT ? OFFSET ?`,
    [size, offset]
  );
  return {rows, count};
}

export default async function EmployeesPage({searchParams}) {
  const page = Number(searchParams?.page || 1);
  const size = Number(searchParams?.size || PAGE_SIZE_DEFAULT);
  const activeOnly = (searchParams?.active || '1') === '1';

  const {rows, count} = await getEmployees({page, size, activeOnly});
  const totalPages = Math.max(1, Math.ceil(count / size));
  const activeFlag = activeOnly ? 1 : 0;

  const q = (p, s, a) => ({pathname: '/employees', query: {page: p, size: s, active: a}});

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Employees</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>Active only:</span>
          <Link className="underline" href={q(1, size, activeOnly ? 0 : 1)}>
            {activeOnly ? 'On (click to show all)' : 'Off (click to show active)'}
          </Link>
          <span>| Page size:</span>
          {[10, 20, 50].map((s) => (
            <Link
              key={s}
              className={`underline ${s === size ? 'font-semibold' : ''}`}
              href={q(1, s, activeFlag)}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Link className="underline" href={q(1, size, activeFlag)}>
          First
        </Link>
        <Link className="underline" href={q(Math.max(1, page - 1), size, activeFlag)}>
          Prev
        </Link>
        <span className="px-2">
          Page {page} / {totalPages}
        </span>
        <Link className="underline" href={q(Math.min(totalPages, page + 1), size, activeFlag)}>
          Next
        </Link>
        <Link className="underline" href={q(totalPages, size, activeFlag)}>
          Last
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border rounded-xl overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 border-b">empid</th>
              <th className="text-left px-3 py-2 border-b">active</th>
              <th className="text-left px-3 py-2 border-b">last_login_datetime</th>
              <th className="text-left px-3 py-2 border-b">api_user</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.empid} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{r.empid}</td>
                <td className="px-3 py-2 border-b">{r.active === 1 ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2 border-b">
                  {r.last_login_datetime ? new Date(r.last_login_datetime).toLocaleString() : ''}
                </td>
                <td className="px-3 py-2 border-b">{r.api_user === 1 ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
