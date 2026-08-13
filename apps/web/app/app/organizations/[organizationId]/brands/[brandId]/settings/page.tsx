import Link from 'next/link';
import { AccessDeniedError, createBrandContextService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { BrandContextForm } from '../../../../../../../components/brand-context-form';

const objectText = (value: unknown) =>
  value && typeof value === 'object' && 'text' in value && typeof value.text === 'string'
    ? value.text
    : '';
const lines = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').join('\n')
    : '';

export default async function BrandSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string }>;
}) {
  const { organizationId, brandId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/login?next=/app/organizations/${organizationId}/brands/${brandId}/settings`);
  try {
    const { brand, generation } = await createBrandContextService().get({
      userId: session.user.id,
      organizationId,
      brandId,
    });
    const profile = generation?.profile;
    const voice = generation?.voices[0];
    return (
      <main className="app-content" aria-labelledby="brand-context-title">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Настройки бренда</p>
            <h1 id="brand-context-title">Контекст {brand.name}</h1>
            <p className="muted">
              Эти данные используются только в границах активного бренда при подготовке контента.
            </p>
          </div>
          <Link
            className="text-link"
            href={`/app/organizations/${organizationId}/brands/${brandId}`}
          >
            К обзору бренда
          </Link>
        </section>
        <section className="panel">
          <BrandContextForm
            organizationId={organizationId}
            brandId={brandId}
            values={{
              description: brand.description ?? '',
              websiteUrl: brand.websiteUrl ?? '',
              positioning: objectText(profile?.positioning),
              targetAudience: objectText(profile?.targetAudience),
              offers: lines(profile?.offers),
              constraints: lines(profile?.constraints),
              forbiddenClaims: lines(profile?.forbiddenClaims),
              toneSummary: voice?.toneSummary ?? '',
              styleRules: lines(voice?.styleRules),
              forbiddenWords: lines(voice?.forbiddenWords),
            }}
          />
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
