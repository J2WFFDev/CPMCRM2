'use client';
import {useState, useEffect} from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [returnTo, setReturnTo] = useState('/');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setReturnTo(p.get('r') || '/');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password}),
    });
    if (res.ok) {
      window.location.href = returnTo;
    } else {
      const d = await res.json().catch(() => ({message: 'Invalid credentials'}));
      setError(d?.message || 'Invalid credentials');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 border rounded-xl p-6 shadow"
      >
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full border rounded px-3 py-2 hover:bg-gray-50" type="submit">
          Login
        </button>
      </form>
    </main>
  );
}
