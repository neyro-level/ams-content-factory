'use client';

import { useActionState, useState } from 'react';
import {
  contentVersionAction,
  type ContentActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/content/actions';

const initialState: ContentActionState = {};

export function ContentVersionControls({
  organizationId,
  brandId,
  contentProjectId,
  sourceVersionId,
  currentBody,
  canWrite,
}: {
  organizationId: string;
  brandId: string;
  contentProjectId: string;
  sourceVersionId?: string;
  currentBody: string;
  canWrite: boolean;
}) {
  const action = contentVersionAction.bind(null, { organizationId, brandId, contentProjectId });
  const [state, formAction, pending] = useActionState(action, initialState);
  const [copied, setCopied] = useState(false);
  if (!canWrite) return null;
  return (
    <section className="editorial-actions" aria-labelledby="version-actions-title">
      <h2 id="version-actions-title">Работа с текстом</h2>
      <form action={formAction} className="organization-form">
        <label>
          Отредактированный текст
          <textarea name="body" defaultValue={currentBody} maxLength={50_000} />
        </label>
        <button
          className="button button-secondary"
          type="submit"
          name="versionAction"
          value="save"
          disabled={pending}
        >
          Сохранить новой версией
        </button>
      </form>
      {sourceVersionId ? (
        <form action={formAction} className="organization-form">
          <input type="hidden" name="sourceVersionId" value={sourceVersionId} />
          <label>
            Инструкция для новой AI-версии
            <input
              name="instruction"
              required
              maxLength={2_000}
              placeholder="Например: сделай короче"
            />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            name="versionAction"
            value="rewrite"
            disabled={pending}
          >
            Создать следующую версию
          </button>
        </form>
      ) : null}
      <button
        className="button"
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(currentBody);
          setCopied(true);
        }}
      >
        Скопировать финальный текст
      </button>
      {copied ? (
        <p className="form-success" role="status">
          Текст скопирован для ручной публикации.
        </p>
      ) : null}
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
