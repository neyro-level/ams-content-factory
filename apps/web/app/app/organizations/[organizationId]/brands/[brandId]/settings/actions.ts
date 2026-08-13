'use server';

import { createBrandContextService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type BrandContextActionState = { error?: string; success?: string };

export async function saveBrandContextAction(
  route: { organizationId: string; brandId: string },
  _previous: BrandContextActionState,
  formData: FormData,
): Promise<BrandContextActionState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  try {
    await createBrandContextService().save(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      {
        description: String(formData.get('description') ?? ''),
        websiteUrl: String(formData.get('websiteUrl') ?? ''),
        positioning: String(formData.get('positioning') ?? ''),
        targetAudience: String(formData.get('targetAudience') ?? ''),
        offers: String(formData.get('offers') ?? ''),
        constraints: String(formData.get('constraints') ?? ''),
        forbiddenClaims: String(formData.get('forbiddenClaims') ?? ''),
        toneSummary: String(formData.get('toneSummary') ?? ''),
        styleRules: String(formData.get('styleRules') ?? ''),
        forbiddenWords: String(formData.get('forbiddenWords') ?? ''),
      },
    );
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/settings`);
    return { success: 'Контекст бренда сохранён.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Не удалось сохранить контекст бренда.',
    };
  }
}
