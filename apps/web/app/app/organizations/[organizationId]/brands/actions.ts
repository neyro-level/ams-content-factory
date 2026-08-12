'use server';

import { BrandInputError, createBrandService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type CreateBrandState = { error?: string; success?: string };

export async function createBrandAction(
  organizationId: string,
  _previous: CreateBrandState,
  formData: FormData,
): Promise<CreateBrandState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  try {
    const brand = await createBrandService().create(
      { userId: session.user.id, organizationId },
      String(formData.get('name') ?? ''),
    );
    revalidatePath(`/app/organizations/${organizationId}/brands`);
    return { success: `Бренд «${brand.name}» создан.` };
  } catch (error) {
    if (error instanceof BrandInputError) return { error: error.message };
    return { error: 'Недостаточно прав или организация недоступна.' };
  }
}
