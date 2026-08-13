import { getAuth, isTextGenerationAvailable } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppNavigation } from '../../components/app-navigation';
import { resolveFeatureCatalog } from '../../lib/features';

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login?next=/app');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AMS CONTENT FACTORY</p>
          <p className="app-user">{session.user.email}</p>
        </div>
        <div className="app-header__actions">
          <span className="badge">Доступ подтверждён</span>
          <AppNavigation
            features={resolveFeatureCatalog({
              textGenerationAvailable: isTextGenerationAvailable(),
            })}
          />
        </div>
      </header>
      {children}
    </div>
  );
}
