'use client';

import { useActionState } from 'react';
import {
  indexKnowledgeDocumentAction,
  searchKnowledgeAction,
  type KnowledgeIntakeState,
  type KnowledgeSearchState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/knowledge/actions';

const initialSearchState: KnowledgeSearchState = {};
const initialIndexState: KnowledgeIntakeState = {};

export function KnowledgeSearchForm({
  organizationId,
  brandId,
}: {
  organizationId: string;
  brandId: string;
}) {
  const [state, searchAction, pending] = useActionState(
    searchKnowledgeAction.bind(null, { organizationId, brandId }),
    initialSearchState,
  );

  return (
    <section className="knowledge-search" aria-labelledby="knowledge-search-title">
      <h2 id="knowledge-search-title">Поиск по базе знаний</h2>
      <p className="muted">
        Поиск по добавленным материалам использует совпадение текста и смысловую релевантность.
      </p>
      <form className="organization-form" action={searchAction}>
        <label>
          Запрос
          <input name="query" required maxLength={500} type="search" />
        </label>
        <button className="button button-secondary" type="submit" disabled={pending}>
          {pending ? 'Ищем…' : 'Найти'}
        </button>
      </form>
      {state.error ? (
        <p className={state.blockedExternal ? 'form-blocked' : 'form-error'} role="status">
          {state.error}
        </p>
      ) : null}
      {state.hits ? (
        state.hits.length ? (
          <ol className="knowledge-search-results">
            {state.hits.map((hit) => (
              <li key={hit.chunkId}>
                <p>{hit.content}</p>
                <span className="muted">Релевантность: {hit.score.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">
            Совпадений пока нет. Сначала добавьте документ в поисковый индекс.
          </p>
        )
      ) : null}
    </section>
  );
}

export function KnowledgeIndexButton({
  organizationId,
  brandId,
  documentId,
}: {
  organizationId: string;
  brandId: string;
  documentId: string;
}) {
  const [state, indexAction, pending] = useActionState(
    indexKnowledgeDocumentAction.bind(null, { organizationId, brandId }, documentId),
    initialIndexState,
  );

  return (
    <form className="knowledge-index" action={indexAction}>
      <button className="button button-secondary" type="submit" disabled={pending}>
        {pending ? 'Индексируем…' : 'В индекс'}
      </button>
      {state.error ? (
        <p className="form-blocked" role="status">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
