import {NextResponse} from 'next/server';
import {getSession} from '@/lib/session';

export const POST = async () => {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ok: true});
};
