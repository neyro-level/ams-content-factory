import Link from 'next/link';
import {
  AccessDeniedError,
  createResearchWorkspaceService,
  getAuth,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ResearchWorkspace } from '../../../../../../../components/research-workspace';

const researchStatusLabel: Record<string, string> = {
  PENDING: 'Готовится',
  READY: 'Готово к использованию',
  REJECTED: 'Не используется',
  ARCHIVED: 'В архиве',
  FAILED: 'Не удалось обработать',
};

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/research`);
  let items;
  try {
    items = await createResearchWorkspaceService().list({
      userId: session.user.id,
      organizationId,
      brandId,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  return (
    <main className="app-content" aria-labelledby="research-title">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Исследование</p>
          <h1 id="research-title">Источники и материалы</h1>
          <p className="muted">
            Материалы ограничены активным брендом; внешнее извлечение проходит через provider-layer.
          </p>
        </div>
        <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
          К брендам
        </Link>
      </section>
      <div className="organization-layout">
        <section className="panel" aria-labelledby="research-list-title">
          <h2 id="research-list-title">Материалы</h2>
          {items.length ? (
            <ul className="organization-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <p className="muted">
                      {item.source?.domain ?? 'Текст'} · {item.summary ?? 'Без краткого описания'}
                    </p>
                  </div>
                  <span className="badge">
                    {researchStatusLabel[item.status] ?? 'Статус уточняется'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">У этого бренда пока нет материалов исследования.</p>
          )}
        </section>
        <section className="panel">
          <ResearchWorkspace organizationId={organizationId} brandId={brandId} />
        </section>
      </div>
    </main>
  );
}
