import { ComponentModel } from '../../model/ComponentModel.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { FooterManifest } from '../../schema/FooterManifest.js';
import { StationModel } from '../../model/StationModel.js';
import { DateTime } from 'luxon';
import { assert } from '../../util/assert.js';

const FEATURED_STATION_IDS = ['DBG', 'HBF', 'OTP', 'JUR', 'WDN', 'CGA'];

export function buildFooterManifest() {
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/footer_manifest.json',
  );

  const lastUpdatedAt = DateTime.now().setZone('Asia/Singapore').toISO();
  assert(lastUpdatedAt != null);

  const result: FooterManifest = {
    components: ComponentModel.getAll(),
    featuredStations: FEATURED_STATION_IDS.map((id) => StationModel.getOne(id)),
    lastUpdatedAt,
  };
  writeFileSync(filePath, JSON.stringify(result, null, 2));
}
