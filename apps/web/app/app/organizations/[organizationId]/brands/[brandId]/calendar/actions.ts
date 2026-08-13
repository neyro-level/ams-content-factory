'use server';

import {
  createPublicationSchedulingService,
  getAuth,
  PublicationSchedulingError,
} from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

type Route = { organizationId: string; brandId: string };
export type PublicationScheduleState = { error?: string; success?: string };

export async function schedulePublicationAction(
  route: Route,
  publicationId: string,
  _previous: PublicationScheduleState,
  formData: FormData,
): Promise<PublicationScheduleState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  const value = formData.get('scheduledAt');
  if (typeof value !== 'string' || !value.trim())
    return { error: 'Укажите дату и время публикации.' };
  const scheduledAt = new Date(value);
  try {
    await createPublicationSchedulingService().schedule(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      { id: publicationId, scheduledAt },
    );
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/calendar`);
    return { success: 'Публикация поставлена в очередь.' };
  } catch (error) {
    if (error instanceof PublicationSchedulingError) return { error: error.message };
    return {
      error: 'Не удалось запланировать публикацию. Проверьте права доступа и статус черновика.',
    };
  }
}

export async function reschedulePublicationAction(
  route: Route,
  publicationId: string,
  _previous: PublicationScheduleState,
  formData: FormData,
): Promise<PublicationScheduleState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  const value = formData.get('scheduledAt');
  if (typeof value !== 'string' || !value.trim())
    return { error: 'Укажите новую дату и время публикации.' };
  const scheduledAt = new Date(value);
  try {
    await createPublicationSchedulingService().reschedule(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      { id: publicationId, scheduledAt },
    );
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/calendar`);
    return { success: 'Время публикации обновлено.' };
  } catch (error) {
    if (error instanceof PublicationSchedulingError) return { error: error.message };
    return {
      error: 'Не удалось перенести публикацию. Проверьте права доступа и её статус.',
    };
  }
}

export async function cancelPublicationAction(
  route: Route,
  publicationId: string,
  _previous: PublicationScheduleState,
): Promise<PublicationScheduleState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Сессия истекла. Войдите снова.' };
  try {
    await createPublicationSchedulingService().cancel(
      { userId: session.user.id, organizationId: route.organizationId, brandId: route.brandId },
      publicationId,
    );
    revalidatePath(`/app/organizations/${route.organizationId}/brands/${route.brandId}/calendar`);
    return { success: 'Публикация отменена до отправки.' };
  } catch (error) {
    if (error instanceof PublicationSchedulingError) return { error: error.message };
    return { error: 'Не удалось отменить публикацию. Проверьте права доступа и её статус.' };
  }
}
