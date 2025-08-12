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
  return {rows, count, page, size, activeOnly};
}

export default async function EmployeesPage({searchParams}) {
  const page = Number(searchParams?.page || 1);
  const size = Number(searchParams?.size || PAGE_SIZE_DEFAULT);
  const activeOnly = (searchParams?.active || '1') === '1';
  const {rows, count} = await getEmployees({page, size, activeOnly});
  const totalPages = Math.max(1, Math.ceil(count / size));

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Employees</h1>
        <div className="flex items-center gap-2">
          <Link
            href={{pathname: '/employees', query: {page: 1, size, active: activeOnly ? 1 : 0}}}
            className="underline"
          >
            First
          </Link>
          <Link
            href={{
              pathname: '/employees',
              query: {page: Math.max(1, page - 1), size, active: activeOnly ? 1 : 0},
            }}
            className="underline"
          >
            Prev
          </Link>
          <span className="px-2">
            Page {page} / {totalPages}
          </span>
          <Link
            href={{
              pathname: '/employees',
              query: {page: Math.min(totalPages, page + 1), size, active: activeOnly ? 1 : 0},
            }}
            className="underline"
          >
            Next
          </Link>
          <Link
            href={{
              pathname: '/employees',
              query: {page: totalPages, size, active: activeOnly ? 1 : 0},
            }}
            className="underline"
          >
            Last
          </Link>
        </div>
      </div>

      <form className="flex items-center gap-3 border rounded-xl p-3 w-full max-w-xl">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={activeOnly}
            onChange={(e) => {
              window.location.href = `/employees?active=${
                e.target.checked ? 1 : 0
              }&page=1&size=${size}`;
            }}
          />
          Active only
        </label>
        <select
          defaultValue={size}
          onChange={(e) => {
            window.location.href = `/employees?active=${activeOnly ? 1 : 0}&page=1&size=${
              e.target.value
            }`;
          }}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
      </form>

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
