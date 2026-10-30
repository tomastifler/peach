/* 用户自配索引器；地址和 API key 分开保存，读取时只返回凭据是否存在。 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { apiGet, apiSend, errorMessage } from '../../api';
import { indexersSkeleton, rememberShape } from '../../configuration-skeleton';
import { randomId } from '../../core/random-id';
import { Disclosure, ErrorText, ExternalLink, Footer, Help, Section, SectionSkeleton, Stack } from './section';
import { busyProps, useAction } from './use-action';

const URL = '/api/configuration/indexers';
interface Indexer {
  key: string; name: string; url: string; enabled: boolean; api_key_set: boolean;
  api_key?: string; clear_api_key?: boolean;
}
interface State { indexers: Indexer[]; max_indexers: number }

export function IndexerSettings({ receipt }: { receipt(message: string): void }) {
  const query = useQuery({ queryKey: ['indexers'], queryFn: ({ signal }) => apiGet<State>(URL, signal), refetchOnMount: 'always' });
  if (query.error) return <ErrorText>{errorMessage(query.error)}</ErrorText>;
  if (query.isFetching) return <SectionSkeleton label="正在读取资源搜索设置" html={indexersSkeleton} />;
  return query.data ? <IndexerForm initial={query.data} receipt={receipt} /> : null;
}

function hostOf(url: string): string {
  try {
    return new globalThis.URL(url).host;
  } catch {
    return url;
  }
}

function IndexerSummary({ row, index }: { row: Indexer; index: number }) {
  const facts = [row.url ? hostOf(row.url) : '未填地址', row.enabled ? '已启用' : '已停用',
    row.api_key_set && !row.clear_api_key ? '已保存 API key' : row.api_key ? 'API key 待保存' : '没有 API key'];
  return <span className="flex min-w-0 items-baseline gap-3">
    <span className="shrink-0 text-text-primary">{row.name || `索引器 ${index + 1}`}</span>
    <span className="truncate text-body-2-regular text-text-secondary">{facts.join(' · ')}</span>
  </span>;
}

function IndexerForm({ initial, receipt }: { initial: State; receipt(message: string): void }) {
  const [rows, setRows] = useState(initial.indexers);
  const action = useAction();
  /* 记下几条索引器、哪条展开，下次骨架照这个结构画。 */
  useEffect(() => { rememberShape('indexers', { open: initial.indexers.map(row => !row.url) }) }, [initial]);
  const update = (key: string, fields: Partial<Indexer>) =>
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...fields } : row));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void action.run('save', (signal) => apiSend<State>(URL, { indexers: rows }, 'POST', signal), (result) => {
      setRows(result.indexers);
      receipt('Indexers saved');
    });
  };
  return (
    <Section title="Resource search" onSubmit={save}>
      <Stack>
        <div className="flex min-w-0 flex-col gap-4">
        <Disclosure summary="索引器连接帮助"><Help>填写 Prowlarr 或 Jackett 提供的 Torznab 地址和 API key。{' '}
          <ExternalLink href="https://github.com/peach-mitao/peach/blob/master/docs/RESOURCE_SEARCH.md">详细配置说明</ExternalLink></Help>
        </Disclosure>
        {/* 一个索引器收成一行摘要：名称、地址主机、启用与凭据状态；点开才是那几栏输入。
            新加的一行（还没有地址）默认展开。 */}
        {rows.map((row, index) => (
          <div key={row.key} className="min-w-0 border-t border-separator-border pt-2">
            <Disclosure defaultOpen={!row.url} summary={<IndexerSummary row={row} index={index} />}>
              <div className="flex min-w-0 flex-col gap-4">
                <Input label="名称" aria-label={`索引器 ${index + 1} 名称`} value={row.name} maxLength={80}
                  isDisabled={Boolean(action.busy)} onChange={(name) => update(row.key, { name })} />
                <Input label="Torznab 地址" aria-label={`索引器 ${index + 1} Torznab 地址`} value={row.url} type="url"
                  autoComplete="off" placeholder="索引器提供的 API 地址" isDisabled={Boolean(action.busy)}
                  onChange={(url) => update(row.key, { url })} />
                <Input label="API key" aria-label={`索引器 ${index + 1} API key`} type="password" autoComplete="new-password"
                  value={row.api_key || ''} placeholder={row.api_key_set ? '已保存，留空不改' : undefined}
                  isDisabled={Boolean(action.busy)} onChange={(api_key) => update(row.key, { api_key })} />
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Checkbox isSelected={row.enabled} isDisabled={Boolean(action.busy)}
                    onChange={(enabled) => update(row.key, { enabled })}>启用</Checkbox>
                  {row.api_key_set ? <Checkbox isSelected={Boolean(row.clear_api_key)}
                    isDisabled={Boolean(action.busy)} onChange={(clear_api_key) => update(row.key, { clear_api_key })}>
                    清除已保存的 API key
                  </Checkbox> : null}
                  <Button variant="danger" type="button" size="small" disabled={Boolean(action.busy)}
                    aria-label={`移除索引器 ${index + 1}`}
                    onClick={() => setRows(rows.filter((item) => item.key !== row.key))}>移除</Button>
                </div>
              </div>
            </Disclosure>
          </div>
        ))}
        </div>
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
      </Stack>
      <Footer>
        <Button variant="secondary" type="button" disabled={Boolean(action.busy) || rows.length >= initial.max_indexers}
          onClick={() => setRows([...rows, { key: randomId(), name: '', url: '', enabled: true, api_key_set: false }])}>
          添加索引器
        </Button>
        <Button type="submit" {...busyProps(action.busy === 'save')}>Save settings</Button>
      </Footer>
    </Section>
  );
}
