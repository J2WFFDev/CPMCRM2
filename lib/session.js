import {cookies} from 'next/headers';
import {getIronSession} from 'iron-session';

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: process.env.SESSION_COOKIE_NAME || 'cpmcrm_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: true,
    path: '/',
  },
};

export const getSession = async () => {
  return getIronSession(cookies(), sessionOptions); // <-- use cookies()
};
