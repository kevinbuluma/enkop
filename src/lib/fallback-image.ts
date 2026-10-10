import { z } from 'zod';

export const fallbackInput = z.object({
  slideId: z.string().uuid(),
  notes: z.string().trim().max(500),
  videoPath: z.string().min(1).max(300),
});

export function fallbackPrompt(notes: string) {
  return [
    'Create one photorealistic cinematic homepage fallback photograph for ENKOP Real Estate from the supplied tour-video frame.',
    'The reference is a frame from the actual video. Preserve its architecture, room layout, furniture, materials, colours, landscape and camera viewpoint. Do not invent rooms, amenities or buildings.',
    'Quiet luxury architectural editorial photography, balanced natural light, subtle cinematic colour grading, crisp realistic detail, wide 16:9 composition. No text, logos, people or watermarks.',
    notes ? `Optional style direction (apply only to lighting and photographic treatment, not property identity): ${notes}` : '',
  ].filter(Boolean).join(' ');
}