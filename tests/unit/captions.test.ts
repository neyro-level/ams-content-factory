import {
  createCaptionBurnInService,
  evaluateQc,
  toAss,
  toSrt,
} from '../../packages/core/src/index.js';
import { MockFfmpegProvider } from '../../packages/providers/src/index.js';
import { describe, expect, it } from 'vitest';

describe('captions and QC', () => {
  const words = [
    { word: 'First', startMs: 1_250, endMs: 1_900 },
    { word: 'second', startMs: 2_500, endMs: 3_100 },
  ];

  it('renders subtitles from provider timestamps and burns them through the isolated provider', async () => {
    expect(toSrt(words)).toContain('00:00:01,250 --> 00:00:01,900');
    expect(toSrt(words)).toContain('00:00:02,500 --> 00:00:03,100');
    expect(toAss(words)).toContain('0:00:01.25,0:00:01.90');
    await expect(
      createCaptionBurnInService({ ffmpeg: new MockFfmpegProvider() }).burn({
        videoKey: 'private/source.mp4',
        captionKey: 'private/captions.ass',
        outputKey: 'private/final.mp4',
      }),
    ).resolves.toEqual({ outputKey: 'private/final.mp4' });
  });

  it.each([
    ['technical', { passed: false, issues: ['invalid-codec'] }],
    ['visual', { passed: false, issues: ['caption-safe-zone'] }],
    ['content', { passed: false, issues: ['missing-hook'] }],
  ] as const)('fails QC when the required %s section fails', (_section, failedSection) => {
    expect(
      evaluateQc({
        technical: _section === 'technical' ? failedSection : { passed: true, issues: [] },
        visual: _section === 'visual' ? failedSection : { passed: true, issues: [] },
        content: _section === 'content' ? failedSection : { passed: true, issues: [] },
      }),
    ).toEqual({ status: 'FAILED', issues: failedSection.issues });
  });

  it('fails QC when the optional compliance section fails', () => {
    expect(
      evaluateQc({
        technical: { passed: true, issues: [] },
        visual: { passed: true, issues: [] },
        content: { passed: true, issues: [] },
        compliance: { passed: false, issues: ['missing-disclosure'] },
      }),
    ).toEqual({ status: 'FAILED', issues: ['missing-disclosure'] });
  });

  it('returns PASSED only when every supplied section passes without issues', () => {
    expect(
      evaluateQc({
        technical: { passed: true, issues: [] },
        visual: { passed: true, issues: [] },
        content: { passed: true, issues: [] },
      }),
    ).toEqual({ status: 'PASSED', issues: [] });
  });

  it('returns WARNING when all sections pass but report non-blocking issues', () => {
    expect(
      evaluateQc({
        technical: { passed: true, issues: [] },
        visual: { passed: true, issues: ['low-contrast'] },
        content: { passed: true, issues: [] },
      }),
    ).toEqual({ status: 'WARNING', issues: ['low-contrast'] });
  });
});
