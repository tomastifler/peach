import { useSyncExternalStore } from 'react';
import { nameRevision, subscribeNames } from '../core/entity-names';

/** 名称偏好及资料投影更新时，只重画显示，不改查询缓存里的身份。 */
export function useEntityNames(): number {
  return useSyncExternalStore(subscribeNames, nameRevision, nameRevision);
}
