'use client';

import { useActionState } from 'react';
import {
  type MediaUploadState,
  uploadMediaAction,
} from '../app/app/organizations/[organizationId]/brands/[brandId]/media/actions';

const initialState: MediaUploadState = {};

export function MediaUploadForm({
  organizationId,
  brandId,
}: {
  organizationId: string;
  brandId: string;
}) {
  const action = uploadMediaAction.bind(null, { organizationId, brandId });
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="organization-form" action={formAction}>
      <label>
        Файл для приватной медиатеки
        <input name="file" type="file" accept="video/mp4,image/png,image/jpeg" required />
      </label>
      <p className="muted">Поддерживаются MP4, PNG и JPEG размером до 100 МБ.</p>
      {state.error ? (
        <p className={state.blockedExternal ? 'form-blocked' : 'form-error'} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Загружаем…' : 'Загрузить файл'}
      </button>
    </form>
  );
}
