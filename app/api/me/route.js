import {NextResponse} from 'next/server';
import {getSession} from '@/lib/session';
export const GET = async () => {
  const s = await getSession();
  return NextResponse.json({user: s.user || null});
};
