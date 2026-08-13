import { describe, expect, it } from 'vitest';
import {
  featureCatalog,
  featureHref,
  featureStatusLabel,
  resolveFeatureCatalog,
} from '../../apps/web/lib/features.js';

describe('V0.1 feature catalog', () => {
  it('keeps future product modules visible and safely routed to product states', () => {
    const base = '/app/organizations/org/brands/brand';
    const planned = featureCatalog.filter((feature) => feature.status === 'PLANNED');
    expect(planned.map((feature) => feature.key)).toEqual(
      expect.arrayContaining([
        'media',
        'video',
        'calendar',
        'publishing',
        'analytics',
        'automation',
        'integrations',
      ]),
    );
    expect(planned.map((feature) => featureHref(base, feature))).toEqual(
      expect.arrayContaining([`${base}/planned/media`, `${base}/planned/publishing`]),
    );
    expect(featureStatusLabel.PLANNED).toBe('В разработке');
  });

  it('renders Content as limited when the real text-generation capability is absent', () => {
    const content = resolveFeatureCatalog({ textGenerationAvailable: false }).find(
      (feature) => feature.key === 'content',
    );
    expect(content).toEqual(expect.objectContaining({ status: 'LIMITED' }));
    expect(content?.description).toContain('AI-генерация');
    expect(
      resolveFeatureCatalog({ textGenerationAvailable: true }).find(
        (feature) => feature.key === 'content',
      ),
    ).toEqual(expect.objectContaining({ status: 'READY' }));
  });
});
