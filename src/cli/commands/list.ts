import { FileStore } from '#repo/common/FileStore.js';
import { MRTDownRepository } from '#repo/MRTDownRepository.js';

export type ListOptions = {
  dataDir: string;
  entity:
    | 'issue'
    | 'town'
    | 'landmark'
    | 'operator'
    | 'station'
    | 'line'
    | 'service';
  json?: boolean;
};

function nameEn(item: { name?: { 'en-SG'?: string } }): string {
  return item.name?.['en-SG'] ?? '—';
}

export function runList(opts: ListOptions): number {
  const store = new FileStore(opts.dataDir);
  const repo = new MRTDownRepository({ store });

  switch (opts.entity) {
    case 'issue': {
      const bundles = repo.issues.list();
      if (opts.json) {
        console.log(
          JSON.stringify(
            bundles.map((b) => ({
              id: b.issue.id,
              type: b.issue.type,
              title: b.issue.title['en-SG'],
            })),
            null,
            2,
          ),
        );
      } else {
        for (const b of bundles) {
          console.log(`${b.issue.id}  ${b.issue.title['en-SG'] ?? b.issue.id}`);
        }
      }
      break;
    }
    case 'town': {
      const items = repo.towns.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}`);
        }
      }
      break;
    }
    case 'landmark': {
      const items = repo.landmarks.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}`);
        }
      }
      break;
    }
    case 'operator': {
      const items = repo.operators.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}`);
        }
      }
      break;
    }
    case 'station': {
      const items = repo.stations.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}`);
        }
      }
      break;
    }
    case 'line': {
      const items = repo.lines.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}  ${item.type}`);
        }
      }
      break;
    }
    case 'service': {
      const items = repo.services.list();
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        for (const item of items) {
          console.log(`${item.id}  ${nameEn(item)}  ${item.lineId}`);
        }
      }
      break;
    }
    default: {
      const _: never = opts.entity;
      console.error(`Unknown entity: ${opts.entity}`);
      return 1;
    }
  }

  return 0;
}
