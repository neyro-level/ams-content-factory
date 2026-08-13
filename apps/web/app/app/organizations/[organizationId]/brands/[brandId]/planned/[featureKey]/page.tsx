import Link from 'next/link';
import { AccessDeniedError, createBrandContextService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { FeatureState } from '../../../../../../../../components/feature-state';
import { featureCatalog } from '../../../../../../../../lib/features';

export default async function PlannedFeaturePage({
  params,
}: {
  params: Promise<{ organizationId: string; brandId: string; featureKey: string }>;
}) {
  const { organizationId, brandId, featureKey } = await params;
  const feature = featureCatalog.find(
    (item) => item.key === featureKey && item.status === 'PLANNED',
  );
  if (!feature) notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(
      `/login?next=/app/organizations/${organizationId}/brands/${brandId}/planned/${featureKey}`,
    );
  try {
    await createBrandContextService().get({ userId: session.user.id, organizationId, brandId });
    return (
      <main className="app-content">
        <Link className="text-link" href={`/app/organizations/${organizationId}/brands/${brandId}`}>
          К обзору бренда
        </Link>
        <FeatureState feature={feature} />
      </main>
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
}
