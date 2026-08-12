import Link from 'next/link';
import { AccessDeniedError, createBrandService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BrandForm } from '../../../../../components/brand-form';

export default async function BrandsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?next=/app/organizations/${organizationId}/brands`);

  let brands;
  try {
    brands = await createBrandService().list({ userId: session.user.id, organizationId });
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }

  return (
    <main className="app-content" aria-labelledby="brands-title">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Бренды</p>
          <h1 id="brands-title">Бренды организации</h1>
          <p className="muted">
            Бренд создаётся внутри выбранной организации и получает отдельный scope доступа.
          </p>
        </div>
        <Link className="text-link" href="/app/organizations">
          К организациям
        </Link>
      </section>
      <div className="organization-layout">
        <section className="panel" aria-labelledby="brand-list-title">
          <h2 id="brand-list-title">Активные бренды</h2>
          {brands.length ? (
            <ul className="organization-list">
              {brands.map((brand) => (
                <li key={brand.id}>
                  <div>
                    <h3>{brand.name}</h3>
                    <p className="muted">{brand.slug}</p>
                  </div>
                  <div className="organization-item-actions">
                    <span className="badge">{brand.locale}</span>
                    <Link
                      className="text-link"
                      href={`/app/organizations/${organizationId}/brands/${brand.id}/knowledge`}
                    >
                      База знаний
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              В этой организации пока нет активных брендов. Создайте первый справа.
            </p>
          )}
        </section>
        <section className="panel" aria-labelledby="create-brand-title">
          <h2 id="create-brand-title">Новый бренд</h2>
          <p className="muted">Создатель получает уровень доступа MANAGE к новому бренду.</p>
          <BrandForm organizationId={organizationId} />
        </section>
      </div>
    </main>
  );
}
