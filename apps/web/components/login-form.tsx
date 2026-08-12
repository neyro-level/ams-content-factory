'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../lib/auth-client';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? 'Не удалось войти. Проверьте email и пароль.');
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form
      className="login-form"
      onSubmit={submit}
      aria-describedby={error ? 'login-error' : undefined}
    >
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Пароль
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </label>
      {error ? (
        <p id="login-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
