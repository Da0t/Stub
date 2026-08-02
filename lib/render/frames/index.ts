import type { FrameLayers, FrameVariant } from '../types';
import { bisonFrame } from './bison';
import { fogFrame } from './fog';
import { notesFrame } from './notes';
import { rangerFrame } from './ranger';
import { trailFrame } from './trail';

export const frames: Record<FrameVariant, FrameLayers> = {
  ranger_badge: rangerFrame,
  trail_marker: trailFrame,
  fog_layer: fogFrame,
  disco_bison: bisonFrame,
  field_notes: notesFrame,
};
