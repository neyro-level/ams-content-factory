'use client';

import { useActionState } from 'react';
import {
  createKnowledgeFileAction,
  createKnowledgeTextAction,
  createKnowledgeUrlAction,
  type KnowledgeIntakeState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/knowledge/actions';

const initialState: KnowledgeIntakeState = {};

export function KnowledgeIntakeForms({
  organizationId,
  brandId,
}: {
  organizationId: string;
  brandId: string;
}) {
  const route = { organizationId, brandId };
  const [textState, textAction, textPending] = useActionState(
    createKnowledgeTextAction.bind(null, route),
    initialState,
  );
  const [urlState, urlAction, urlPending] = useActionState(
    createKnowledgeUrlAction.bind(null, route),
    initialState,
  );
  const [fileState, fileAction, filePending] = useActionState(
    createKnowledgeFileAction.bind(null, route),
    initialState,
  );

  return (
    <section className="knowledge-intake" aria-labelledby="knowledge-intake-title">
      <h2 id="knowledge-intake-title">Добавить источник</h2>
      <form
        className="organization-form"
        action={textAction}
        aria-describedby={textState.error ? 'knowledge-text-error' : undefined}
      >
        <h3>Текст</h3>
        <label>
          Название
          <input name="title" required maxLength={300} />
        </label>
        <label>
          Содержимое
          <textarea name="text" required maxLength={1_000_000} />
        </label>
        <IntakeFeedback state={textState} errorId="knowledge-text-error" />
        <button className="button" type="submit" disabled={textPending}>
          {textPending ? 'Добавляем…' : 'Добавить текст'}
        </button>
      </form>
      <form
        className="organization-form"
        action={urlAction}
        aria-describedby={urlState.error ? 'knowledge-url-error' : undefined}
      >
        <h3>URL</h3>
        <label>
          Название
          <input name="title" required maxLength={300} />
        </label>
        <label>
          Адрес
          <input name="sourceUrl" type="url" required inputMode="url" />
        </label>
        <IntakeFeedback state={urlState} errorId="knowledge-url-error" />
        <button className="button button-secondary" type="submit" disabled={urlPending}>
          {urlPending ? 'Проверяем…' : 'Добавить URL'}
        </button>
      </form>
      <form
        className="organization-form"
        action={fileAction}
        aria-describedby={fileState.error ? 'knowledge-file-error' : undefined}
      >
        <h3>Текстовый файл</h3>
        <label>
          Название
          <input name="title" maxLength={300} />
        </label>
        <label>
          Файл
          <input
            name="file"
            type="file"
            required
            accept=".csv,.html,.htm,.json,.md,.txt,.xml,text/*"
          />
        </label>
        <p className="muted">Поддерживаются UTF-8 текстовые файлы до 1 МБ.</p>
        <IntakeFeedback state={fileState} errorId="knowledge-file-error" />
        <button className="button button-secondary" type="submit" disabled={filePending}>
          {filePending ? 'Загружаем…' : 'Добавить файл'}
        </button>
      </form>
    </section>
  );
}

function IntakeFeedback({ state, errorId }: { state: KnowledgeIntakeState; errorId: string }) {
  if (state.error)
    return (
      <p id={errorId} className="form-error" role="alert">
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
