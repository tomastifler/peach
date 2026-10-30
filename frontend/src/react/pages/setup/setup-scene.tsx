import type { ReactNode } from 'react';
import { RiFolderLine, RiPlayFill, RiSearchLine } from '@remixicon/react';
import macbook from '../../../../../resources/setup/macbook.png';
import iphone from '../../../../../resources/setup/iphone.png';
import { PeachSilhouette } from './peach-silhouette';

type SceneStep = number | 'restore' | 'done';

function LibraryPreview() {
  return <div data-setup-mini-library="">
    <div data-setup-mini-toolbar=""><span /><span /><span /><RiSearchLine /></div>
    <div data-setup-mini-posters=""><div><RiPlayFill /></div><div /><div /></div>
    <div data-setup-mini-lines=""><span /><span /></div>
  </div>;
}

/** 首次设置的场景说明；使用 Peach 图标与布局，不包含真实馆藏。 */
export function SetupScene({ step }: { step: SceneStep }) {
  const title = step === 0 ? '你的私人媒体空间。' : step === 1 ? '让文件成为馆藏。'
    : step === 2 ? '从书桌，到手边。' : step === 3 ? '全都准备好了。'
    : step === 'restore' ? '从熟悉的地方继续。' : '馆藏，准备开启。';
  const description = step === 0 ? '把喜欢的内容，整理成自己的收藏。'
    : step === 1 ? '按媒体库归类，文件保留在原来的位置。'
    : step === 2 ? '电脑与手机，连接同一套 Peach。'
    : step === 3 ? '确认后保存，扫描按你的选择开始。'
    : step === 'restore' ? '沿用原来的配置与记录，接着使用。' : '进入 Peach，开始探索你的收藏。';
  return <aside data-setup-scene="">
    <div data-setup-scene-brand=""><PeachSilhouette variant="brand" /><span>Peach</span></div>
    <div data-setup-scene-art="" key={step} aria-hidden="true">
      {step === 0 ? <PeachSilhouette variant="welcome" />
        : step === 3 || step === 'done' ? <img data-setup-original-mark="" src="/peach-logo.png" alt="" width={148} height={148} />
        : step === 2 ? <div data-setup-devices="">
        <div data-setup-macbook=""><img src={macbook} alt="" /><div data-setup-device-screen=""><LibraryPreview /></div></div>
        <div data-setup-iphone=""><img src={iphone} alt="" /><div data-setup-device-screen=""><LibraryPreview /></div></div>
      </div> : <div data-setup-library-scene="">
        <LibraryPreview />
        <div data-setup-scene-badge=""><RiFolderLine /><span>你的媒体库</span></div>
      </div>}
    </div>
    <div data-setup-scene-caption="" key={`caption-${step}`}>
      <p className="text-title-2-medium" data-copy-key={`setup.scene.title.${step}`}>{title}</p>
      <p className="text-body-2-regular" data-copy-key={`setup.scene.description.${step}`}>{description}</p>
    </div>
  </aside>;
}

export function SetupShell({ step, children }: { step: SceneStep; children: ReactNode }) {
  return <main data-setup-page=""><div data-setup-window="" data-setup-step={step}>
    <SetupScene step={step} />{children}
  </div></main>;
}
