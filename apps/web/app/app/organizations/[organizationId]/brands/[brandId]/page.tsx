import Link from 'next/link';
import {
  AccessDeniedError,
  createBrandContextService,
  createContentWorkspaceService,
  getAuth,
  isTextGenerationAvailable,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  featureHref,
  featureStatusLabel,
  resolveFeatureCatalog,
} from '../../../../../../lib/features';

export default async function BrandDashboardPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}`);
  try {
    const actor = { userId: session.user.id, organizationId, brandId };
    const [{ brand }, projects] = await Promise.all([
      createBrandContextService().get(actor),
      createContentWorkspaceService().list(actor, { take: 5 }),
    ]);
    const base = `/app/organizations/${organizationId}/brands/${brandId}`;
    const features = resolveFeatureCatalog({
      textGenerationAvailable: isTextGenerationAvailable(),
    });
    return (
      <main className="app-content" aria-labelledby="brand-dashboard-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Рабочее пространство бренда</p>
            <h1 id="brand-dashboard-title">{brand.name}</h1>
            <p className="muted">
              Начните с контекста бренда и базы знаний, затем подготовьте финальный текст для ручной
              публикации.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <section className="organization-layout">
          <div className="panel">
            <h2>Следующее безопасное действие</h2>
            <p>Заполните контекст бренда или создайте контент-проект.</p>
            <div className="organization-item-actions">
              <Link className="button" href={`${base}/content`}>
                Создать контент
              </Link>
              <Link className="button button-secondary" href={`${base}/knowledge`}>
                Открыть базу знаний
              </Link>
            </div>
          </div>
          <div className="panel">
            <h2>Последние контент-проекты</h2>
            {projects.length ? (
              <ul className="organization-list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <div>
                      <h3>{project.title}</h3>
                      <p className="muted">Версий: {project._count.versions}</p>
                    </div>
                    <Link className="text-link" href={`${base}/content/${project.id}`}>
                      Открыть
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">Пока нет контент-проектов.</p>
            )}
          </div>
        </section>
        <section className="panel" aria-labelledby="features-title">
          <h2 id="features-title">Возможности платформы</h2>
          <div className="module-grid">
            {features.map((feature) => (
              <Link className="panel" key={feature.key} href={featureHref(base, feature)}>
                <p className="eyebrow">{featureStatusLabel[feature.status]}</p>
                <h3>{feature.label}</h3>
                <p className="muted">{feature.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
