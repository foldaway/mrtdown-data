import { customType } from 'drizzle-orm/pg-core';

// https://github.com/drizzle-team/drizzle-orm/issues/298#issuecomment-2921934097
export const binary = customType<{
  data: Buffer;
  default: false;
}>({
  dataType() {
    return 'bytea';
  },
});
