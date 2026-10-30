import { STAGES } from '../../settings/library-policy-settings';
import type { SetupFolder } from './setup-api';

export function libraryFields(row?: SetupFolder): Partial<SetupFolder> {
  return row ? {
    library_id: row.library_id, library: row.library, library_icon: row.library_icon, library_color: row.library_color,
    library_policy: row.library_policy, library_stages: row.library_stages,
  } : {};
}

export function processingSummary(row: SetupFolder): string {
  if (row.library_policy === 'local') return '仅使用本地资料';
  if (row.library_policy !== 'custom') return '自动补全';
  const stages = STAGES.filter(([key]) => row.library_stages?.split(',').includes(key)).map(([, label]) => label);
  return stages.length ? `自定义：${stages.join('、')}` : '自定义：只读取本地 NFO 和图片';
}
