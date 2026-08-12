import Link from 'next/link';
import { LoginForm } from '../../components/login-form';
import { getSafeAppPath } from '../../lib/app-path';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = getSafeAppPath((await searchParams).next);
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">AMS CONTENT FACTORY</p>
        <h1 id="login-title">Вход в рабочее пространство</h1>
        <p className="muted">Используйте учётную запись, которой выдан доступ к организации.</p>
        <LoginForm nextPath={nextPath} />
        <Link className="text-link" href="/">
          Вернуться к статусу проекта
        </Link>
      </section>
    </main>
  );
}
