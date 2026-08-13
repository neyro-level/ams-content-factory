'use server';

import { createEditorialApprovalService, getAuth } from '@ams-content-factory/core';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

type Route = { organizationId: string; brandId: string; contentProjectId: string };

export async function editorialAction(route: Route, formData: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return;
  const actor = {
    userId: session.user.id,
    organizationId: route.organizationId,
    brandId: route.brandId,
  };
  const service = createEditorialApprovalService();
  const action = String(formData.get('editorialAction') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (action === 'request-review')
    await service.requestReview(actor, { contentProjectId: route.contentProjectId });
  else if (action === 'approve')
    await service.approve(actor, {
      contentProjectId: route.contentProjectId,
      ...(note ? { note } : {}),
    });
  else if (action === 'return-to-draft')
    await service.returnToDraft(actor, {
      contentProjectId: route.contentProjectId,
      ...(note ? { note } : {}),
    });
  else if (action === 'reject')
    await service.reject(actor, {
      contentProjectId: route.contentProjectId,
      ...(note ? { note } : {}),
    });
  else if (action === 'comment')
    await service.comment(actor, { contentProjectId: route.contentProjectId, body: note });
  else throw new Error('Unsupported editorial action.');
  revalidatePath(
    `/app/organizations/${route.organizationId}/brands/${route.brandId}/content/${route.contentProjectId}`,
  );
}
