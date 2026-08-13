import Link from 'next/link';
import {
  AccessDeniedError,
  createPublicationCalendarService,
  getAuth,
  type CalendarView,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  PublicationCancelForm,
  PublicationRescheduleForm,
  PublicationScheduleForm,
} from '../../../../../../../components/publication-schedule-form';

function parseView(value: string | undefined): CalendarView {
  return value === 'month' ? 'month' : 'week';
}

function parseAnchor(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function query(view: CalendarView, anchor: Date) {
  return `?view=${view}&date=${anchor.toISOString().slice(0, 10)}`;
}

export default async function PublicationCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { organizationId, brandId } = await params;
  const search = await searchParams;
  const view = parseView(search.view);
  const anchor = parseAnchor(search.date);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/calendar`);

  try {
    const calendar = await createPublicationCalendarService().get(
      { userId: session.user.id, organizationId, brandId },
      { view, anchor },
    );
    return (
      <main className="app-content" aria-labelledby="publication-calendar-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Календарь</p>
            <h1 id="publication-calendar-title">Календарь публикаций</h1>
            <p className="muted">
              Показывает публикации только активного бренда в выбранном периоде.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <section className="panel" aria-label="Выбор периода календаря">
          <div className="organization-item-actions">
            <Link
              className={view === 'week' ? 'button button-secondary button-compact' : 'text-link'}
              href={query('week', calendar.anchor)}
            >
              Неделя
            </Link>
            <Link
              className={view === 'month' ? 'button button-secondary button-compact' : 'text-link'}
              href={query('month', calendar.anchor)}
            >
              Месяц
            </Link>
          </div>
          <p className="muted">
            {dateLabel(calendar.from)} — {dateLabel(new Date(calendar.until.getTime() - 1))}
          </p>
        </section>
        {calendar.publicationIssues.length || calendar.issueAccounts.length ? (
          <section className="panel" aria-labelledby="publication-issues-title">
            <h2 id="publication-issues-title">Требуют внимания</h2>
            <p className="muted">
              Ошибки публикации и неизвестный итог не запускают повторную отправку автоматически.
            </p>
            {calendar.publicationIssues.length ? (
              <ul className="organization-list" aria-label="Проблемы публикаций">
                {calendar.publicationIssues.map((issue) => (
                  <li key={issue.id}>
                    <div>
                      <h3>{issue.title}</h3>
                      <p className="muted">
                        {issue.platform} · {issue.accountName} ·{' '}
                        {issue.errorCode ?? 'PROVIDER_ERROR'}
                      </p>
                      <p className="muted">
                        {issue.status === 'OUTCOME_UNKNOWN'
                          ? 'Не создавайте повторную публикацию: сначала требуется сверка статуса с провайдером.'
                          : 'Проверьте подключение аккаунта и ошибку провайдера перед контролируемым повтором.'}
                      </p>
                    </div>
                    <span className="badge">{issue.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {calendar.issueAccounts.length ? (
              <ul className="organization-list" aria-label="Проблемные аккаунты">
                {calendar.issueAccounts.map((account) => (
                  <li key={account.id}>
                    <div>
                      <h3>{account.name}</h3>
                      <p className="muted">
                        {account.status === 'EXPIRED'
                          ? 'Срок действия доступа истёк. Переподключите аккаунт перед публикацией.'
                          : 'Проверьте подключение аккаунта и повторите OAuth-подключение после устранения ошибки.'}
                      </p>
                    </div>
                    <span className="badge">{account.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              className="text-link"
              href={`/app/organizations/${organizationId}/brands/${brandId}/social-accounts`}
            >
              Открыть аккаунты бренда
            </Link>
          </section>
        ) : null}
        <section className="panel" aria-labelledby="scheduled-publications-title">
          <h2 id="scheduled-publications-title">Запланированные публикации</h2>
          {calendar.scheduled.length ? (
            <ul className="organization-list">
              {calendar.scheduled.map((publication) => (
                <li key={publication.id}>
                  <div>
                    <h3>{publication.contentProject.title}</h3>
                    <p className="muted">
                      {dateLabel(publication.scheduledAt!)} · {publication.platformVariant.platform}{' '}
                      · {publication.socialAccount.name}
                    </p>
                  </div>
                  <div className="organization-item-actions">
                    <span className="badge">{publication.status}</span>
                    {publication.status === 'QUEUED' && publication.scheduledAt ? (
                      <>
                        <PublicationRescheduleForm
                          organizationId={organizationId}
                          brandId={brandId}
                          publicationId={publication.id}
                          scheduledAt={publication.scheduledAt}
                        />
                        <PublicationCancelForm
                          organizationId={organizationId}
                          brandId={brandId}
                          publicationId={publication.id}
                        />
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">В выбранном периоде нет запланированных публикаций.</p>
          )}
        </section>
        <section className="panel" aria-labelledby="unscheduled-drafts-title">
          <h2 id="unscheduled-drafts-title">Черновики без времени публикации</h2>
          {calendar.unscheduledDrafts.length ? (
            <ul className="organization-list">
              {calendar.unscheduledDrafts.map((publication) => (
                <li key={publication.id}>
                  <div>
                    <h3>{publication.contentProject.title}</h3>
                    <p className="muted">
                      {publication.platformVariant.platform} · {publication.socialAccount.name}
                    </p>
                  </div>
                  <div className="organization-item-actions">
                    <span className="badge">DRAFT</span>
                    <PublicationScheduleForm
                      organizationId={organizationId}
                      brandId={brandId}
                      publicationId={publication.id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">Нет черновиков, ожидающих планирования.</p>
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
