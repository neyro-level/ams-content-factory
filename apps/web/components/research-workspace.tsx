'use client';

import { useActionState } from 'react';
import {
  addResearchTextAction,
  addResearchUrlAction,
  searchResearchAction,
  type ResearchActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/research/actions';

const initialState: ResearchActionState = {};

export function ResearchWorkspace({
  organizationId,
  brandId,
}: {
  organizationId: string;
  brandId: string;
}) {
  const route = { organizationId, brandId };
  const [textState, textAction, textPending] = useActionState(
    addResearchTextAction.bind(null, route),
    initialState,
  );
  const [urlState, urlAction, urlPending] = useActionState(
    addResearchUrlAction.bind(null, route),
    initialState,
  );
  const [searchState, searchAction, searchPending] = useActionState(
    searchResearchAction.bind(null, route),
    initialState,
  );

  return (
    <section className="research-workspace" aria-labelledby="research-tools-title">
      <h2 id="research-tools-title">Добавить материал</h2>
      <form className="organization-form" action={textAction}>
        <h3>Текст или заметка</h3>
        <label>
          Название
          <input name="title" required maxLength={300} />
        </label>
        <label>
          Содержимое
          <textarea name="content" required maxLength={1_000_000} />
        </label>
        <Feedback state={textState} />
        <button className="button" disabled={textPending}>
          {textPending ? 'Добавляем…' : 'Добавить текст'}
        </button>
      </form>
      <form className="organization-form" action={urlAction}>
        <h3>Страница по URL</h3>
        <label>
          Название
          <input name="title" required maxLength={300} />
        </label>
        <label>
          Адрес
          <input name="sourceUrl" type="url" required inputMode="url" />
        </label>
        <Feedback state={urlState} />
        <button className="button button-secondary" disabled={urlPending}>
          {urlPending ? 'Извлекаем…' : 'Добавить URL'}
        </button>
      </form>
      <form className="organization-form" action={searchAction}>
        <h3>Найти источники</h3>
        <label>
          Запрос
          <input name="query" type="search" required maxLength={500} />
        </label>
        <Feedback state={searchState} />
        <button className="button button-secondary" disabled={searchPending}>
          {searchPending ? 'Ищем…' : 'Найти источники'}
        </button>
      </form>
      {searchState.results?.length ? (
        <ul className="research-results">
          {searchState.results.map((result) => (
            <li key={result.url}>
              <a className="text-link" href={result.url} target="_blank" rel="noreferrer">
                {result.title}
              </a>
              {result.snippet ? <p className="muted">{result.snippet}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Feedback({ state }: { state: ResearchActionState }) {
  if (state.error)
    return (
      <p className={state.blockedExternal ? 'form-blocked' : 'form-error'} role="status">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p className="form-success" role="status">
        {state.success}
      </p>
    );
  return null;
}
