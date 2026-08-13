'use client';

import { useActionState } from 'react';
import {
  addResearchTextAction,
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
      <section className="organization-form" aria-labelledby="research-external-title">
        <h3>Страница по URL</h3>
        <p id="research-external-title" className="muted">
          Внешнее извлечение будет доступно после подключения исследовательского провайдера.
        </p>
        <button className="button button-secondary" type="button" disabled>
          Добавить URL
        </button>
      </section>
      <section className="organization-form" aria-labelledby="research-search-title">
        <h3>Найти источники</h3>
        <p id="research-search-title" className="muted">
          Поиск источников находится в ограниченном режиме и не запускается без подготовленного
          подключения.
        </p>
        <button className="button button-secondary" type="button" disabled>
          Найти источники
        </button>
      </section>
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
