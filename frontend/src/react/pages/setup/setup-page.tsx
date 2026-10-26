/* 首次运行页：取题目、画表单，成功后在同一页换成完成态。
 *
 * 题目接口只对运行 Peach 的这台电脑开放；别的设备打开时它回 403，页面不画表单，只说去哪里打开。 */
import { useEffect, useState } from 'react';

import { Button } from '@/components/base/buttons/button';

import { Note } from '../../components/note';
import { AuthCard } from '../auth-card';
import { describeFailure, fetchQuestions, SetupRequestError, type SetupDone, type SetupQuestions } from './setup-api';
import { SetupDoneView } from './setup-done';
import { SetupForm } from './setup-form';
import { SetupRestore } from './setup-restore';

type View =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'failed'; message: string }
  | { kind: 'form'; setup: SetupQuestions }
  | { kind: 'done'; done: SetupDone };

export function SetupPage() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchQuestions(controller.signal).then(
      (setup) => setView({ kind: 'form', setup }),
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setView(cause instanceof SetupRequestError && cause.status === 403
          ? { kind: 'denied' }
          : { kind: 'failed', message: describeFailure(cause) });
      });
    return () => controller.abort();
  }, [attempt]);

  if (view.kind === 'done') return <SetupDoneView done={view.done} />;
  const retry = () => {
    setView({ kind: 'loading' });
    setAttempt((count) => count + 1);
  };
  return (
    <AuthCard title="Welcome to Peach" lede="Add a library to start organizing your collection." busy={view.kind === 'loading'}>
      {view.kind === 'denied' ? <Note tone="error">Open setup on the computer running Peach.</Note> : null}
      {view.kind === 'failed'
        ? <Note tone="error" action={<Button variant="secondary" onClick={retry}>Retry</Button>}>{view.message}</Note>
        : null}
      {view.kind === 'form' ? <>
        <Button variant="secondary" className="self-start" onClick={() => setRestoring((current) => !current)}>
          {restoring ? 'Back to first-time setup' : 'Use an existing data folder'}
        </Button>
        {restoring
          ? <SetupRestore onDone={(done) => setView({ kind: 'done', done })} />
          : <SetupForm setup={view.setup} onDone={(done) => setView({ kind: 'done', done })} />}
      </> : null}
    </AuthCard>
  );
}
