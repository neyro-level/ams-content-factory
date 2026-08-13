import Link from 'next/link';
import {
  AccessDeniedError,
  createContentWorkspaceService,
  getAuth,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { editorialAction } from './actions';
import { ContentStateControls } from '../../../../../../../../components/content-state-controls';

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
    const { project, claims, canReview, canWrite } = await createContentWorkspaceService().get(
      { userId: session.user.id, organizationId, brandId },
      contentProjectId,
    );
    const current = project.versions[0];
    const editorial = editorialAction.bind(null, { organizationId, brandId, contentProjectId });
    return (
      <main className="app-content" aria-labelledby="content-project-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Контент-проект</p>
            <h1 id="content-project-title">{project.title}</h1>
            <p className="muted">
              {project.contentType} · текущий статус: {project.status}
            </p>
            <ContentStateControls
              organizationId={organizationId}
              brandId={brandId}
              contentProjectId={contentProjectId}
              status={project.status}
              canWrite={canWrite}
            />
            {project.status === 'FACT_CHECK' && canWrite ? (
              <form action={editorial}>
                <button
                  className="button"
                  type="submit"
                  name="editorialAction"
                  value="request-review"
                >
                  Отправить на review
                </button>
              </form>
            ) : null}
            {project.status === 'REVIEW' && canReview ? (
              <form action={editorial} className="editorial-actions">
                <label>
                  Комментарий к решению
                  <input name="note" maxLength={5000} />
                </label>
                <div>
                  <button className="button" type="submit" name="editorialAction" value="approve">
                    Одобрить вручную
                  </button>
                  <button
                    className="button button-secondary"
                    type="submit"
                    name="editorialAction"
                    value="return-to-draft"
                  >
                    Вернуть в черновик
                  </button>
                  <button
                    className="button button-secondary"
                    type="submit"
                    name="editorialAction"
                    value="reject"
                  >
                    Отклонить
                  </button>
                </div>
              </form>
            ) : null}
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
                    <span className="badge">{claim.status}</span>
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
            {canWrite ? (
              <form action={editorial}>
                <label>
                  Комментарий
                  <textarea name="note" required maxLength={5000} />
                </label>
                <button
                  className="button button-secondary"
                  type="submit"
                  name="editorialAction"
                  value="comment"
                >
                  Добавить комментарий
                </button>
              </form>
            ) : null}
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
