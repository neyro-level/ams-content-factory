import Link from 'next/link';
import {
  AccessDeniedError,
  createContentWorkspaceService,
  getAuth,
  isTextGenerationAvailable,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ContentStateControls } from '../../../../../../../../components/content-state-controls';
import { ContentVersionControls } from '../../../../../../../../components/content-version-controls';
import { EditorialControls } from '../../../../../../../../components/editorial-controls';
import { contentStatusLabel, contentTypeLabel } from '../../../../../../../../lib/content-labels';

const claimStatusLabel: Record<string, string> = {
  UNVERIFIED: 'Нужна проверка',
  SUPPORTED: 'Подтверждено источниками',
  CONFLICTING: 'Источники противоречат',
  REJECTED: 'Не подтверждено',
};

export default async function ContentProjectPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string; contentProjectId: string }>;
}) {
  const { organizationId, brandId, contentProjectId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(
      `/login?next=/app/organizations/${organizationId}/brands/${brandId}/content/${contentProjectId}`,
    );
  try {
    const { project, claims, versions, canReview, canWrite } =
      await createContentWorkspaceService().get(
        { userId: session.user.id, organizationId, brandId },
        contentProjectId,
      );
    const current = project.versions[0];
    return (
      <main className="app-content" aria-labelledby="content-project-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Контент-проект</p>
            <h1 id="content-project-title">{project.title}</h1>
            <p className="muted">
              {contentTypeLabel[project.contentType] ?? 'Материал'} · текущий статус:{' '}
              {contentStatusLabel[project.status] ?? 'Статус обновляется'}
            </p>
            <ContentStateControls
              organizationId={organizationId}
              brandId={brandId}
              contentProjectId={contentProjectId}
              status={project.status}
              generationAvailable={isTextGenerationAvailable()}
              canWrite={canWrite}
            />
          </div>
          <Link
            className="text-link"
            href={`/app/organizations/${organizationId}/brands/${brandId}/content`}
          >
            К проектам
          </Link>
        </section>
        <div className="organization-layout">
          <section className="panel" aria-labelledby="draft-title">
            <h2 id="draft-title">Текущая версия</h2>
            {current ? (
              <pre className="content-preview">
                {current.body ?? current.script ?? 'Текст не задан.'}
              </pre>
            ) : (
              <p className="empty-copy">Версий пока нет.</p>
            )}
            <p className="muted">
              Версий: {project._count.versions} · согласований: {project._count.approvals}
            </p>
            {current ? (
              <ContentVersionControls
                organizationId={organizationId}
                brandId={brandId}
                contentProjectId={contentProjectId}
                sourceVersionId={current.id}
                currentBody={current.body ?? current.script ?? ''}
                canCopy={project.status === 'READY'}
                generationAvailable={isTextGenerationAvailable()}
                canWrite={canWrite}
              />
            ) : null}
          </section>
          <section className="panel" aria-labelledby="version-history-title">
            <h2 id="version-history-title">История версий</h2>
            {versions.length ? (
              <ol className="organization-list">
                {versions.map((version) => (
                  <li key={version.id}>
                    <div>
                      <h3>Версия {version.version}</h3>
                      <p className="muted">
                        {version.createdByType === 'AI' ? 'AI-версия' : 'Ручная версия'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-copy">История появится после первой версии.</p>
            )}
          </section>
          <section className="panel" aria-labelledby="fact-check-title">
            <h2 id="fact-check-title">Fact-check и evidence</h2>
            {claims.length ? (
              <ul className="organization-list">
                {claims.map((claim) => (
                  <li key={claim.id}>
                    <div>
                      <h3>{claim.text}</h3>
                      <p className="muted">Evidence: {claim.evidence.length}</p>
                    </div>
                    <span className="badge">
                      {claimStatusLabel[claim.status] ?? 'Статус проверки неизвестен'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">
                Fact-check ещё не запускался: evidence и findings отсутствуют.
              </p>
            )}
          </section>
          <section className="panel" aria-labelledby="editorial-comments-title">
            <h2 id="editorial-comments-title">Редакционные комментарии</h2>
            <EditorialControls
              organizationId={organizationId}
              brandId={brandId}
              contentProjectId={contentProjectId}
              status={project.status}
              canReview={canReview}
              canWrite={canWrite}
            />
            {project.comments.length ? (
              <ul className="organization-list">
                {project.comments.map((comment) => (
                  <li key={comment.id}>
                    <p>{comment.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">Комментариев пока нет.</p>
            )}
          </section>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
