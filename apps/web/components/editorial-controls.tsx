'use client';

import { useActionState } from 'react';
import {
  editorialAction,
  type EditorialActionState,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/content/[contentProjectId]/actions';

const initialState: EditorialActionState = {};

export function EditorialControls({
  organizationId,
  brandId,
  contentProjectId,
  status,
  canReview,
  canWrite,
}: {
  organizationId: string;
  brandId: string;
  contentProjectId: string;
  status: string;
  canReview: boolean;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    editorialAction.bind(null, { organizationId, brandId, contentProjectId }),
    initialState,
  );
  if (!canWrite && !(status === 'REVIEW' && canReview)) return null;

  return (
    <section className="editorial-actions" aria-labelledby="editorial-actions-title">
      <h2 id="editorial-actions-title">Редакционное согласование</h2>
      {status === 'FACT_CHECK' && canWrite ? (
        <form action={formAction}>
          <button
            className="button"
            type="submit"
            name="editorialAction"
            value="request-review"
            disabled={pending}
          >
            Отправить на review
          </button>
        </form>
      ) : null}
      {status === 'REVIEW' && canReview ? (
        <form action={formAction} className="organization-form">
          <label>
            Комментарий к решению
            <input name="note" maxLength={5000} />
          </label>
          <div>
            <button
              className="button"
              type="submit"
              name="editorialAction"
              value="approve"
              disabled={pending}
            >
              Одобрить вручную
            </button>
            <button
              className="button button-secondary"
              type="submit"
              name="editorialAction"
              value="return-to-draft"
              disabled={pending}
            >
              Вернуть в черновик
            </button>
            <button
              className="button button-secondary"
              type="submit"
              name="editorialAction"
              value="reject"
              disabled={pending}
            >
              Отклонить
            </button>
          </div>
        </form>
      ) : null}
      {canWrite ? (
        <form action={formAction} className="organization-form">
          <label>
            Комментарий
            <textarea name="note" required maxLength={5000} />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            name="editorialAction"
            value="comment"
            disabled={pending}
          >
            Добавить комментарий
          </button>
        </form>
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
