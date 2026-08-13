import Link from 'next/link';
import {
  AccessDeniedError,
  createContentWorkspaceService,
  getAuth,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ContentProjectForm } from '../../../../../../../components/content-project-form';

export default async function ContentProjectsPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/content`);
  try {
    const projects = await createContentWorkspaceService().list({
      userId: session.user.id,
      organizationId,
      brandId,
    });
    return (
      <main className="app-content" aria-labelledby="content-projects-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Контент</p>
            <h1 id="content-projects-title">Проекты контента</h1>
            <p className="muted">
              Черновики, версии, evidence и редакционный статус выбранного бренда.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <section className="panel" aria-labelledby="create-content-project-title">
          <h2 id="create-content-project-title">Новый контент-проект</h2>
          <ContentProjectForm organizationId={organizationId} brandId={brandId} />
        </section>
        <section className="panel" aria-labelledby="content-projects-list-title">
          <h2 id="content-projects-list-title">Контент-проекты</h2>
          {projects.length ? (
            <ul className="organization-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <div>
                    <h3>{project.title}</h3>
                    <p className="muted">
                      {project.contentType} · версий: {project._count.versions} · согласований:{' '}
                      {project._count.approvals}
                    </p>
                  </div>
                  <div className="organization-item-actions">
                    <span className="badge">{project.status}</span>
                    <Link
                      className="text-link"
                      href={`/app/organizations/${organizationId}/brands/${brandId}/content/${project.id}`}
                    >
                      Открыть
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">У этого бренда ещё нет проектов контента.</p>
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
