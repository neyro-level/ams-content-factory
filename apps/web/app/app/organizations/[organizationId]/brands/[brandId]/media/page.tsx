import Link from 'next/link';
import { AccessDeniedError, createMediaWorkspaceService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { MediaUploadForm } from '../../../../../../../components/media-upload-form';

const sourceLabels: Record<string, string> = {
  UPLOAD: 'Загрузка',
  AI_GENERATED: 'AI-generated',
  SCREENSHOT: 'Скриншот',
  SCREEN_RECORDING: 'Запись экрана',
  PROVIDER: 'Провайдер',
  RESEARCH: 'Исследование',
  DERIVED: 'Производный файл',
};

export default async function MediaPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  redirect(`/app/organizations/${organizationId}/brands/${brandId}/planned/media`);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/media`);

  try {
    const assets = await createMediaWorkspaceService().list({
      userId: session!.user.id,
      organizationId,
      brandId,
    });
    return (
      <main className="app-content" aria-labelledby="media-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Медиа</p>
            <h1 id="media-title">Приватная медиатека бренда</h1>
            <p className="muted">
              Здесь собраны загруженные, исследовательские, AI-сгенерированные и производные
              материалы только активного бренда.
            </p>
          </div>
          <Link className="text-link" href={`/app/organizations/${organizationId}/brands`}>
            К брендам
          </Link>
        </section>
        <div className="organization-layout">
          <section className="panel" aria-labelledby="media-assets-title">
            <h2 id="media-assets-title">Файлы</h2>
            {assets.length ? (
              <ul className="organization-list">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <div>
                      <h3>{asset.filename}</h3>
                      <p className="muted">
                        {sourceLabels[asset.sourceType] ?? asset.sourceType} · {asset.mimeType} ·{' '}
                        {asset.sizeBytes.toString()} байт
                      </p>
                    </div>
                    <span className="badge">{asset.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">В медиатеке этого бренда пока нет файлов.</p>
            )}
          </section>
          <section className="panel" aria-labelledby="media-upload-title">
            <h2 id="media-upload-title">Добавить файл</h2>
            <p className="muted">
              Файл будет доступен только после записи в private S3-compatible storage.
            </p>
            <MediaUploadForm organizationId={organizationId} brandId={brandId} />
          </section>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
