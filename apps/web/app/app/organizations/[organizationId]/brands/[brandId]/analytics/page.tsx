import Link from 'next/link';
import {
  AccessDeniedError,
  createAnalyticsDashboardService,
  getAuth,
  type AnalyticsDashboard,
  type ContentPerformance,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

function formatMetric(metric: { value: number; reported: boolean }, signed = false) {
  if (!metric.reported) return '—';
  const value = new Intl.NumberFormat('ru-RU').format(metric.value);
  return signed && metric.value > 0 ? `+${value}` : value;
}

function formatRate(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function ContentList({ items, emptyCopy }: { items: ContentPerformance[]; emptyCopy: string }) {
  if (!items.length) return <p className="empty-copy">{emptyCopy}</p>;
  return (
    <ol className="analytics-list">
      {items.map((item) => (
        <li key={item.publicationId}>
          <div>
            <h3>{item.title}</h3>
            <p className="muted">
              {item.platform}
              {item.pillar ? ` · ${item.pillar}` : ''}
              {item.topic ? ` · ${item.topic}` : ''}
            </p>
          </div>
          <p className="analytics-list__metric">{formatRate(item.engagementRate)}</p>
        </li>
      ))}
    </ol>
  );
}

function GroupList({
  items,
  label,
}: {
  items: Array<{
    name: string;
    publications: number;
    engagement: { value: number; reported: boolean };
  }>;
  label: string;
}) {
  if (!items.length)
    return <p className="empty-copy">Пока нет публикаций с указанной классификацией.</p>;
  return (
    <ul className="analytics-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.name}>
          <div>
            <h3>{item.name}</h3>
            <p className="muted">Публикаций: {item.publications}</p>
          </div>
          <p className="analytics-list__metric">{formatMetric(item.engagement)}</p>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsDashboardView({ dashboard }: { dashboard: AnalyticsDashboard }) {
  if (!dashboard.snapshotCount) {
    return (
      <section className="empty-state" aria-labelledby="analytics-empty-title">
        <div>
          <h2 id="analytics-empty-title">Метрики пока не собраны</h2>
          <p>
            После публикации worker планирует безопасный сбор метрик. Этот экран покажет только
            сохранённые нормализованные значения активного бренда.
          </p>
        </div>
      </section>
    );
  }

  const metrics = [
    ['Просмотры', formatMetric(dashboard.totals.views)],
    ['Охват', formatMetric(dashboard.totals.reach)],
    ['Вовлечение', formatMetric(dashboard.totals.engagement)],
    ['Клики', formatMetric(dashboard.totals.clicks)],
    ['Прирост подписчиков', formatMetric(dashboard.totals.followersDelta, true)],
  ];
  return (
    <>
      <section className="analytics-metrics" aria-label="Сводные метрики">
        {metrics.map(([label, value]) => (
          <article className="analytics-metric-card" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <div className="analytics-layout">
        <section className="panel" aria-labelledby="analytics-platforms-title">
          <h2 id="analytics-platforms-title">Сравнение платформ</h2>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th scope="col">Платформа</th>
                  <th scope="col">Публикаций</th>
                  <th scope="col">Охват</th>
                  <th scope="col">Вовлечение</th>
                  <th scope="col">Клики</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.platforms.map((item) => (
                  <tr key={item.platform}>
                    <th scope="row">{item.platform}</th>
                    <td>{item.publications}</td>
                    <td>{formatMetric(item.reach)}</td>
                    <td>{formatMetric(item.engagement)}</td>
                    <td>{formatMetric(item.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" aria-labelledby="analytics-top-title">
          <h2 id="analytics-top-title">Лучший контент</h2>
          <p className="muted">
            Ранжирование по доле вовлечения на охвате, показах или просмотрах.
          </p>
          <ContentList
            items={dashboard.topContent}
            emptyCopy="Недостаточно нормализованных значений для ранжирования контента."
          />
        </section>
        <section className="panel" aria-labelledby="analytics-worst-title">
          <h2 id="analytics-worst-title">Контент с низкой вовлечённостью</h2>
          <p className="muted">
            Это сигнал для редакционной проверки, а не основание для автоматической правки.
          </p>
          <ContentList
            items={dashboard.worstContent}
            emptyCopy="Недостаточно нормализованных значений для ранжирования контента."
          />
        </section>
        <section className="panel" aria-labelledby="analytics-pillars-title">
          <h2 id="analytics-pillars-title">Контентные направления</h2>
          <GroupList items={dashboard.pillars} label="Сравнение контентных направлений" />
        </section>
        <section className="panel" aria-labelledby="analytics-topics-title">
          <h2 id="analytics-topics-title">Темы возможностей</h2>
          <p className="muted">Тема берётся из связанной content opportunity, если она указана.</p>
          <GroupList items={dashboard.topics} label="Сравнение тем возможностей" />
        </section>
      </div>
    </>
  );
}

export default async function AnalyticsDashboardPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/analytics`);

  try {
    const dashboard = await createAnalyticsDashboardService().get({
      userId: session.user.id,
      organizationId,
      brandId,
    });
    return (
      <main className="app-content" aria-labelledby="analytics-dashboard-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Аналитика</p>
            <h1 id="analytics-dashboard-title">Результаты контента</h1>
            <p className="muted">
              Дашборд использует последние сохранённые снимки по каждой публикации выбранного
              бренда. Недоступные у провайдера метрики не заменяются нулями.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <AnalyticsDashboardView dashboard={dashboard} />
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
