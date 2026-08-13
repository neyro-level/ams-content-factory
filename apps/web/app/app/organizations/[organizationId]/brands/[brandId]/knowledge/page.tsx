import Link from 'next/link';
import {
  AccessDeniedError,
  createKnowledgeWorkspaceService,
  getAuth,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  KnowledgeIntakeForms,
  KnowledgeRetryButton,
} from '../../../../../../../components/knowledge-intake-forms';
import {
  KnowledgeIndexButton,
  KnowledgeSearchForm,
} from '../../../../../../../components/knowledge-search';

const documentTypeLabel: Record<string, string> = {
  FILE: 'Файл',
  URL: 'Страница сайта',
  TEXT: 'Текст',
  NOTE: 'Заметка',
  CASE: 'Кейс',
  PRODUCT: 'Материал о продукте',
};
const documentStatusLabel: Record<string, string> = {
  PENDING: 'Ожидает обработки',
  PROCESSING: 'Обрабатывается',
  READY: 'Готов к использованию',
  FAILED: 'Не удалось обработать',
  ARCHIVED: 'В архиве',
};

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/knowledge`);

  let documents;
  try {
    documents = await createKnowledgeWorkspaceService().list({
      userId: session.user.id,
      organizationId,
      brandId,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }

  return (
    <main className="app-content" aria-labelledby="knowledge-title">
      <section className="page-heading">
        <div>
          <p className="eyebrow">База знаний</p>
          <h1 id="knowledge-title">Документы бренда</h1>
          <p className="muted">
            Здесь отображаются только документы активного бренда. Добавление источников, повторная
            обработка неудачных документов и поиск развиваются в рамках W6.
          </p>
        </div>
        <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
          К брендам
        </Link>
      </section>
      <div className="organization-layout">
        <section className="panel" aria-labelledby="knowledge-list-title">
          <h2 id="knowledge-list-title">Документы</h2>
          {documents.length ? (
            <ul className="organization-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <div>
                    <h3>{document.title}</h3>
                    <p className="muted">
                      {documentTypeLabel[document.type] ?? 'Документ'} · {document._count.chunks}{' '}
                      фрагм.
                    </p>
                  </div>
                  <div className="knowledge-document-actions">
                    <span className="badge">
                      {documentStatusLabel[document.status] ?? 'Неизвестный статус'}
                    </span>
                    {document.status === 'FAILED' ? (
                      <KnowledgeRetryButton
                        organizationId={organizationId}
                        brandId={brandId}
                        documentId={document.id}
                      />
                    ) : null}
                    {document.status === 'READY' ? (
                      <KnowledgeIndexButton
                        organizationId={organizationId}
                        brandId={brandId}
                        documentId={document.id}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">У этого бренда пока нет документов базы знаний.</p>
          )}
        </section>
        <section className="panel">
          <KnowledgeIntakeForms organizationId={organizationId} brandId={brandId} />
        </section>
        <section className="panel">
          <KnowledgeSearchForm organizationId={organizationId} brandId={brandId} />
        </section>
      </div>
    </main>
  );
}
