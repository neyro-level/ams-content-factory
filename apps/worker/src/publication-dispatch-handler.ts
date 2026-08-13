import {
  createPublicationDispatchService,
  createPublishingService,
  createTokenEncryptor,
} from '@ams-content-factory/core';
import {
  InstagramPublishingProvider,
  InstagramPublishingRuntimeClient,
  UnavailablePublishingProvider,
  VkPublishingProvider,
  VkPublishingRuntimeClient,
  type PublishingProvider,
} from '@ams-content-factory/providers';
import type { createWorkflowRunRepository } from '@ams-content-factory/db';

type WorkflowRunRepository = ReturnType<typeof createWorkflowRunRepository>;
type WorkflowRun = NonNullable<Awaited<ReturnType<WorkflowRunRepository['find']>>>;

function configuredProvider(
  platform: 'VK' | 'INSTAGRAM',
  create: () => PublishingProvider,
): PublishingProvider {
  try {
    return create();
  } catch (error) {
    return new UnavailablePublishingProvider(
      platform,
      error instanceof Error ? error.message : 'runtime configuration is missing.',
    );
  }
}

function createProductionPublishingProviders() {
  return {
    VK: configuredProvider('VK', () => new VkPublishingProvider(new VkPublishingRuntimeClient())),
    INSTAGRAM: configuredProvider(
      'INSTAGRAM',
      () => new InstagramPublishingProvider(new InstagramPublishingRuntimeClient()),
    ),
  };
}

export function createProductionPublicationDispatchHandler() {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY is required for publication dispatch.');
  const publishing = createPublishingService({
    encryptor: createTokenEncryptor(encryptionKey),
    providers: createProductionPublishingProviders(),
  });
  const dispatch = createPublicationDispatchService({ publishingService: publishing });
  return (run: WorkflowRun) => dispatch.dispatch(run);
}
