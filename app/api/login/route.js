// app/api/login/route.js
import {NextResponse} from 'next/server';
import {getDb} from '@/lib/db';
import {getSession} from '@/lib/session';
import bcrypt from 'bcryptjs';

export const POST = async (request) => {
  try {
    const body = await request.json();
    const username = (body?.username || '').trim();
    const password = body?.password || '';

    if (!username || !password) {
      return NextResponse.json({ok: false, message: 'Missing credentials'}, {status: 400});
    }

    const db = await getDb();
    const [rows] = await db.execute(
      `SELECT au.id AS app_user_id, au.username, au.password_hash, au.active,
              au.employee_empid, e.active AS employee_active
       FROM CPMCRMDB.app_users au
       LEFT JOIN easyopti.employees e ON e.empid=au.employee_empid
       WHERE au.username=? LIMIT 1`,
      [username]
    );

    // 🔎 optional debug during setup (comment out later)
    // console.log('[login] rows:', rows.length, rows[0]&&{username:rows[0].username,empid:rows[0].employee_empid,app_active:rows[0].active,emp_active:rows[0].employee_active});

    const user = rows?.[0];
    if (!user) {
      return NextResponse.json({ok: false, message: 'Invalid login'}, {status: 401});
    }
    if (user.active !== 1) {
      return NextResponse.json({ok: false, message: 'Invalid login'}, {status: 401});
    }
    if (user.employee_active !== null && user.employee_active !== 1) {
      return NextResponse.json({ok: false, message: 'Invalid login'}, {status: 401});
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ok: false, message: 'Invalid login'}, {status: 401});
    }

    const session = await getSession();
    session.user = {
      id: user.app_user_id,
      username: user.username,
      empid: user.employee_empid,
      roles: ['user'],
    };
    await session.save();

    return NextResponse.json({ok: true});
  } catch (err) {
    // console.error('[login] error:', err);
    return NextResponse.json({ok: false, message: 'Server error'}, {status: 500});
  }
};
