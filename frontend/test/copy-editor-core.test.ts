import { describe, expect, it } from 'vitest';
import '../src/copy-editor-core.js';

const core = (globalThis as unknown as { PeachCopyEditorCore: {
  readJson(response: Response): Promise<unknown>;
  resolveDraft(edits: Record<string, string> | null, original: string): string;
  applyDrafts(root: Node, edits: Record<string, string>, originals: WeakMap<Node, string>, skip?: string): void;
} }).PeachCopyEditorCore;

describe('原位改字核心', () => {
  it('读取 JSON 成功结果与服务端失败原因', async () => {
    await expect(core.readJson(new Response('{"ok":true,"text":""}'))).resolves.toEqual({ ok: true, text: '' });
    await expect(core.readJson(new Response('{"error":"保存失败"}', { status: 500 }))).rejects.toThrow('保存失败');
  });
  it('成功响应缺少 JSON 时保留未确认状态', async () => {
    await expect(core.readJson(new Response(''))).rejects.toMatchObject({ unconfirmed: true });
    await expect(core.readJson(new Response('<html>error</html>', { status: 502 }))).rejects.toMatchObject({ unconfirmed: false });
    await expect(core.readJson(new Response('null'))).rejects.toMatchObject({ unconfirmed: true });
  });
  it('连续修改、删除与循环映射都能终止', () => {
    expect(core.resolveDraft({ 甲: '乙', 乙: '' }, '甲')).toBe('');
    expect(core.resolveDraft({ 甲: '乙', 乙: '甲' }, '甲')).toBe('甲');
    expect(core.resolveDraft(null, '甲')).toBe('甲');
  });
  it('删除草稿保留文本节点身份并跳过编辑器和脚本', () => {
    const root = document.createElement('main');
    root.innerHTML = '<p>  说明  </p><script>说明</script><span data-copy-editor>说明</span>';
    const node = root.querySelector('p')!.firstChild!;
    const originals = new WeakMap<Node, string>();
    core.applyDrafts(root, { 说明: '' }, originals);
    expect(node.textContent).toBe('    ');
    expect(root.querySelector('p')!.firstChild).toBe(node);
    expect(root.querySelector('script')!.textContent).toBe('说明');
    expect(root.querySelector('span')!.textContent).toBe('说明');
    core.applyDrafts(root, { 说明: '' }, originals);
    expect(node.textContent).toBe('    ');
    core.applyDrafts(root, { 说明: '恢复' }, originals);
    expect(node.textContent).toBe('  恢复  ');
  });
});
