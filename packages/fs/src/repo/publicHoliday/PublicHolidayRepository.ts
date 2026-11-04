import {
  type PublicHolidayCalendar,
  PublicHolidayCalendarSchema,
} from '@mrtdown/core';
import { DIR_PUBLIC_HOLIDAY } from '../../constants.js';
import { StandardRepository } from '../common/StandardRepository.js';
import type { IStore } from '../common/store.js';

export class PublicHolidayRepository extends StandardRepository<PublicHolidayCalendar> {
  constructor(store: IStore) {
    super(store, DIR_PUBLIC_HOLIDAY);
  }

  protected loadAll(): void {
    // Older exports predate this optional collection.
    if (!this.store.exists(this.dirPath)) {
      this.loaded = true;
      return;
    }
    super.loadAll();
  }

  protected parseItem(json: unknown): PublicHolidayCalendar {
    return PublicHolidayCalendarSchema.parse(json);
  }
}
