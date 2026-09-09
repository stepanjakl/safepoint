'use client';

import { IconSetProvider } from '@/components/app-shell/system-icon';
import { SystemCluster } from '@/components/app-shell/system-cluster';
import { ICON_KEYS, type SystemLink } from '@/lib/process/system-links';
import {
  ICON_LIBRARIES,
  ICON_LIBRARY_NOTES,
  ICON_LIBRARY_SETS,
} from './icon-sets';

// A client component because an icon set is a table of components, which cannot
// cross the server boundary as a prop. The page hands over the links, which are
// data, and the gallery resolves the families itself.

// Every noun in the vocabulary, whether or not the promotion run happens to
// touch it. Sources and destinations between them leave three keys unexercised,
// and an icon that is only wrong in the support process is still wrong.
const VOCABULARY: SystemLink[] = ICON_KEYS.map((icon) => ({
  id: icon,
  label: icon,
  icon,
  direction: 'writes',
}));

// The real reads carry freshness, so those discs also show the caution and
// blocked rings — the states where the glyph has to stay legible under a colour
// it did not choose.
export function SystemDiscGallery({
  sources,
  destinations,
}: {
  sources: SystemLink[];
  destinations: SystemLink[];
}) {
  return (
    <div className="space-y-4">
      {ICON_LIBRARIES.map((library) => (
        <div
          key={library}
          className="border-rule-default bg-surface-primary space-y-3 border p-4"
        >
          <div className="space-y-1">
            <p className="readout text-muted">
              {ICON_LIBRARY_NOTES[library].label}
            </p>
            <p className="text-meta text-muted max-w-prose">
              {ICON_LIBRARY_NOTES[library].note}
            </p>
          </div>
          <IconSetProvider set={ICON_LIBRARY_SETS[library]}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <SystemCluster label="Reads" links={sources} />
              <SystemCluster label="Writes" links={destinations} />
            </div>
            <SystemCluster label="All" links={VOCABULARY} />
          </IconSetProvider>
        </div>
      ))}
    </div>
  );
}
