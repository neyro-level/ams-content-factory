import { createOrganizationService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OrganizationForm } from '../../../components/organization-form';

export default async function OrganizationsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login?next=/app/organizations');
  const memberships = await createOrganizationService().listForUser(session.user.id);

  return (
    <main className="app-content" aria-labelledby="organizations-title">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Организации</p>
          <h1 id="organizations-title">Ваши рабочие пространства</h1>
          <p className="muted">
            Доступны только активные организации, где у вашей учётной записи есть активное участие.
          </p>
        </div>
      </section>
      <div className="organization-layout">
        <section className="panel" aria-labelledby="organization-list-title">
          <h2 id="organization-list-title">Доступные организации</h2>
          {memberships.length ? (
            <ul className="organization-list">
              {memberships.map(({ organization, role }) => (
                <li key={organization.id}>
                  <div>
                    <h3>{organization.name}</h3>
                    <p className="muted">{organization.slug}</p>
                  </div>
                  <span className="badge">{role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              У вас пока нет активных организаций. Создайте первую справа.
            </p>
          )}
        </section>
        <section className="panel" aria-labelledby="create-organization-title">
          <h2 id="create-organization-title">Новая организация</h2>
          <p className="muted">Вы будете назначены владельцем автоматически.</p>
          <OrganizationForm />
        </section>
      </div>
    </main>
  );
}
