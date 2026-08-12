'use server';

import {
  createOrganizationService,
  getAuth,
  OrganizationInputError,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

export type CreateOrganizationState = { error?: string; success?: string };

export async function createOrganizationAction(
  _previous: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };

  try {
    const organization = await createOrganizationService().createForUser(
      session.user.id,
      String(formData.get('name') ?? ''),
    );
    revalidatePath('/app/organizations');
    return { success: `Организация «${organization.name}» создана.` };
  } catch (error) {
    if (error instanceof OrganizationInputError) return { error: error.message };
    throw error;
  }
}
