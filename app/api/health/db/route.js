import {NextResponse} from 'next/server';
import {getDb} from '@/lib/db';

export const GET = async () => {
  try {
    const db = await getDb();
    const [rows] = await db.query('SELECT 1 AS ok');
    return NextResponse.json({ok: rows?.[0]?.ok === 1});
  } catch (err) {
    return NextResponse.json(
      {ok: false, code: err?.code, name: err?.name, message: err?.message},
      {status: 500}
    );
  }
};
