import Link from 'next/link';
import {
  AccessDeniedError,
  createSocialAccountsWorkspaceService,
  getAuth,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const platformLabels: Record<string, string> = {
  VK: 'VK',
  INSTAGRAM: 'Instagram',
};

export default async function SocialAccountsPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  redirect(`/app/organizations/${organizationId}/brands/${brandId}/planned/social-accounts`);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/social-accounts`);

  try {
    const accounts = await createSocialAccountsWorkspaceService().list({
      userId: session!.user.id,
      organizationId,
      brandId,
    });
    return (
      <main className="app-content" aria-labelledby="social-accounts-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Соцсети</p>
            <h1 id="social-accounts-title">Аккаунты бренда</h1>
            <p className="muted">
              Здесь отображаются доступные VK и Instagram аккаунты только активного бренда.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <section className="panel" aria-labelledby="social-accounts-list-title">
          <h2 id="social-accounts-list-title">Подключения</h2>
          <p className="muted">
            Статусы: CONNECTED, EXPIRED, DISCONNECTED, ERROR. Защищённый OAuth-поток и хранение
            токенов будут добавлены отдельным последующим шагом.
          </p>
          {accounts.length ? (
            <ul className="organization-list">
              {accounts.map((account) => (
                <li key={account.id}>
                  <div>
                    <h3>{account.name}</h3>
                    <p className="muted">
                      {platformLabels[account.platform] ?? account.platform}
                      {account.username ? ` · @${account.username}` : ''}
                    </p>
                  </div>
                  <span className="badge">{account.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              Для этого бренда пока нет подключённых VK или Instagram аккаунтов.
            </p>
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
