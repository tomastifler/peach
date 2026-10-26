/* tutorial 域控制器：本域状态与动作，启动由 Application 的生命周期统一安装。 */
import { cameFromSetup, writeShell } from './../shell/index';
import { isCurrentPostSetupTutorialRequest, nextPostSetupTutorialRequest, postSetupTutorialCollapsed, postSetupTutorialMarker, postSetupTutorialSignature, postSetupTutorialSkipped, resetPostSetupTutorialState, setPostSetupTutorialCollapsed, setPostSetupTutorialMarker, setPostSetupTutorialSkipped } from '../ui-kit';
import { peachHistory, shellNavigate } from './../history/index';
import { $, api, icon } from '../core';
import { navigationState } from './navigation.js';
import { applicationEffects } from './effects';
import { receiptsState } from './receipts.js';
export const tutorialState = { postSetupTutorialDone: undefined, postSetupTutorialNeedsReopen: undefined, postSetupTutorialTasks: undefined, postSetupTutorialHtml: undefined, writePostSetupTutorialDone: undefined, readPostSetupTutorialDone: undefined, openTutorialTarget: undefined };

export async function reopenPostSetupTutorial(){
  resetPostSetupTutorialState();
  await tutorialState.writePostSetupTutorialDone(false);
  await syncPostSetupTutorial();
}

export async function syncPostSetupTutorial(){
  const root=$('#postSetupTutorial');if(!root)return;
  const hide=()=>{root.hidden=true;root.innerHTML='';delete root.dataset.tutorialSignature;
    root.removeAttribute('aria-busy')};
  if(tutorialState.postSetupTutorialNeedsReopen){
    tutorialState.postSetupTutorialNeedsReopen=false;
    await tutorialState.writePostSetupTutorialDone(false).catch(()=>{});
  }
  if(postSetupTutorialMarker()!=='pending'||await tutorialState.readPostSetupTutorialDone()){hide();return}
  const request=nextPostSetupTutorialRequest();root.hidden=false;root.setAttribute('aria-busy','true');
  if(!root.firstElementChild){
    root.innerHTML=`<article class="post-setup-notification post-setup-loading">${icon('compass')}<p>Checking setup progress…</p></article>`;
  }
  try{
    const tasks=await tutorialState.postSetupTutorialTasks();
    if(!isCurrentPostSetupTutorialRequest(request))return;
    const knownKeys=new Set(tasks.map(task=>task.key));
    const skipped=new Set([...postSetupTutorialSkipped()].filter(key=>knownKeys.has(key)));
    setPostSetupTutorialSkipped(skipped);
    const visible=tasks.filter(task=>!skipped.has(task.key));
    const pending=visible.filter(task=>!task.done);
    if(!pending.length){
      setPostSetupTutorialMarker('complete');hide();
      await tutorialState.writePostSetupTutorialDone(true).catch(()=>{});
      return
    }
    const signature=postSetupTutorialSignature(visible);
    if(root.dataset.tutorialSignature===signature){root.removeAttribute('aria-busy');return}
    root.innerHTML=tutorialState.postSetupTutorialHtml(visible,skipped.size,tasks.length);
    root.dataset.tutorialSignature=signature;root.removeAttribute('aria-busy');
    const next=pending[0];
    const collapse=root.querySelector('[data-tutorial-collapse]');
    applicationEffects.handler(collapse, 'onclick', ()=>{
      const card=root.querySelector('.post-setup-notification');
      const collapsed=card.dataset.collapsed!=='true';
      card.dataset.collapsed=String(collapsed);setPostSetupTutorialCollapsed(collapsed);
      collapse.setAttribute('aria-expanded',String(!collapsed));
      collapse.setAttribute('aria-label',collapsed?'Expand setup guide':'Collapse setup guide');
      collapse.innerHTML=icon(collapsed?'chevron-up':'chevron-down');
    });
    root.querySelectorAll('[data-tutorial-skip]').forEach(button=>applicationEffects.handler(button, 'onclick', ()=>{
      const skippedNow=postSetupTutorialSkipped(),key=button.dataset.tutorialSkip;
      skippedNow.add(key);setPostSetupTutorialSkipped(skippedNow);
      receiptsState.actionReceipt(`Skipped "${button.dataset.tutorialLabel}"`,{undo:async()=>{
        const restored=postSetupTutorialSkipped();restored.delete(key);setPostSetupTutorialSkipped(restored);
        setPostSetupTutorialMarker('pending');await syncPostSetupTutorial();
      }});
      void syncPostSetupTutorial();
    }));
    const byKey=new Map(visible.map(task=>[task.key,task]));
    root.querySelectorAll('[data-tutorial-task]').forEach(link=>applicationEffects.handler(link, 'onclick', event=>{
      const task=byKey.get(link.dataset.tutorialTask);
      if(!task||event.metaKey||event.ctrlKey||event.shiftKey||event.button)return;
      event.preventDefault();tutorialState.openTutorialTarget(task);
    }));
    applicationEffects.handler(root.querySelector('[data-tutorial-action]'), 'onclick', ()=>tutorialState.openTutorialTarget(next));
  }catch{
    if(!isCurrentPostSetupTutorialRequest(request))return;
    /* 取数失败时这张卡是死的：没有清单，也没有下一步。给一条重试和一个关闭，
       不然它只能一直杵在右下角占着地方。 */
    root.innerHTML=`<article class="post-setup-notification post-setup-error">${icon('alert')}
      <div><h2>Cannot check setup progress right now</h2><p>It will be checked again after you switch pages or reopen the app.</p>
      <div class="post-setup-error-actions"><button class="geist-button" type="button" data-tutorial-retry>Retry</button>
      <button class="geist-button" type="button" data-tutorial-dismiss>Close</button></div></div></article>`;
    root.removeAttribute('aria-busy');
    applicationEffects.handler(root.querySelector('[data-tutorial-retry]'), 'onclick', ()=>{
      delete root.dataset.tutorialSignature;root.innerHTML='';void syncPostSetupTutorial();
    });
    applicationEffects.handler(root.querySelector('[data-tutorial-dismiss]'), 'onclick', hide);
  }
}

export function installTutorial8() {
writeShell({cameFromSetup:new URLSearchParams(location.search).get('onboarding')==='1'});
tutorialState.postSetupTutorialDone = null;
tutorialState.postSetupTutorialNeedsReopen = false;
if(cameFromSetup){
  setPostSetupTutorialMarker('pending');
  // 数据库里那句「教程做完了」可能是上一次安装留下的，刚走完设置就得撤回。
  tutorialState.postSetupTutorialDone=false;tutorialState.postSetupTutorialNeedsReopen=true;
  const clean=new URL(location.href);clean.searchParams.delete('onboarding');
  shellNavigate(clean,{replace:true,state:peachHistory.navigation.location.state});
}
{
  const clean=new URL(location.href),flag=clean.searchParams.get('agentation');
  if(flag==='on')localStorage.setItem('peach.agentation','on');
  if(flag==='off')localStorage.removeItem('peach.agentation');
  if(flag!==null){
    clean.searchParams.delete('agentation');
    shellNavigate(clean,{replace:true,state:peachHistory.navigation.location.state});
  }
  if(localStorage.getItem('peach.agentation')==='on')import('/dev/agentation.js').catch(()=>{});
}
tutorialState.postSetupTutorialTasks = async()=>{
  const {library,scraping,taste,follow,credentials,review}=await api('/api/post-setup-tutorial');
  const scrapingCredentialSources=(scraping.sources||[]).filter(source=>source.accepts_cookie);
  const savedScrapingCredentials=scrapingCredentialSources.filter(source=>source.cookie_saved);
  const sources=(follow.sources||[]).filter(source=>source.enabled!==false);
  const providers=new Map((credentials.providers||[]).map(row=>[row.provider,row]));
  const required=[...new Set(sources.map(source=>source.provider))]
    .map(provider=>providers.get(provider)).filter(row=>row?.requirement==='required');
  const libraryReady=Number(library.total||0)>0;
  const followReady=sources.length>0;
  const credentialsReady=followReady&&required.every(row=>row.present&&!row.missing?.length);
  const pendingReview=Object.values(review.counts||{})
    .reduce((sum,value)=>sum+(Number(value)||0),0);
  return [
    {key:'library',label:'Complete the first scan',description:libraryReady
      ?`${Number(library.total).toLocaleString()} library items imported.`:'Waiting for the scan to import the first library item.',
      href:'/data-cleanup',done:libraryReady,icon:'scan-search'},
    {key:'scraping',label:'Set up scraping sources and credentials',description:savedScrapingCredentials.length
      ?`Credentials saved for ${savedScrapingCredentials.length.toLocaleString()} scraping sources.`
      :'Check each source and save any sign-in credentials.',
      href:'/sources',done:savedScrapingCredentials.length>0,icon:'settings'},
    {key:'history',label:'Import browser history',description:Number(taste.history_sources||0)>0
      ?`${Number(taste.history_sources).toLocaleString()} browser histories imported.`
      :'Import taste-analysis records from this computer\'s browsers.',
      href:'/taste',setupEntry:true,done:Number(taste.history_sources||0)>0,icon:'history'},
    {key:'follow',label:'Add a follow source',description:followReady
      ?`${sources.length.toLocaleString()} sources enabled.`:'Add creators or sources to follow.',
      href:'/subscriptions?tab=add',done:followReady,icon:'rss'},
    {key:'credentials',label:'Complete follow source credentials',description:!followReady
      ?'Credentials are checked once you add a follow.':required.length
        ?(credentialsReady?'Credentials needed by the current sources are configured.':`${required.length.toLocaleString()} sources need credentials.`)
        :'The current follow sources need no credentials.',
      href:'/subscriptions?tab=source',done:credentialsReady,icon:'key-round'},
    {key:'review',label:'Complete the first review',description:!libraryReady
      ?'After the scan finishes, items that need review will be listed here.':pendingReview
        ?`${pendingReview.toLocaleString()} still need review.`:'The first review queue is clear.',
      href:'/review',done:libraryReady&&pendingReview===0,icon:'square-check-big'},
  ];
};
tutorialState.postSetupTutorialHtml = (tasks,skippedCount,totalCount)=>{
  const ordered=[...tasks].sort((left,right)=>Number(left.done)-Number(right.done));
  const next=tasks.find(task=>!task.done);
  const completeCount=tasks.filter(task=>task.done).length+skippedCount;
  const collapsed=postSetupTutorialCollapsed();
  const rows=ordered.map(task=>`<li class="post-setup-task" data-state="${task.done?'checked':'unchecked'}">
    <a href="${task.href}" data-tutorial-task="${task.key}">
      <span class="post-setup-check" aria-hidden="true">${task.done?icon('check'):icon(task.icon)}</span>
      <span><b>${task.label}</b><small>${task.description}</small></span>
      ${icon('chevron-right')}</a>
    ${task.done?'':`<button class="post-setup-skip" type="button" data-tutorial-skip="${task.key}" data-tutorial-label="${task.label}">Skip</button>`}
    </li>`).join('');
  return `<article class="post-setup-notification" data-collapsed="${collapsed}">
      <header class="post-setup-notification-head">
        <span class="post-setup-notification-icon" aria-hidden="true">${icon('compass')}</span>
        <div><h2>Finish setting up Peach</h2>
        <p>${completeCount}/${totalCount} done.</p></div>
        <button class="post-setup-collapse" type="button" data-tutorial-collapse aria-controls="postSetupTaskList" aria-expanded="${!collapsed}"
          aria-label="${collapsed?'Expand setup guide':'Collapse setup guide'}">${icon(collapsed?'chevron-up':'chevron-down')}</button>
      </header>
      <ol class="post-setup-task-list" id="postSetupTaskList">${rows}</ol>
      <footer><button class="geist-button" type="button" data-tutorial-action="next">Continue: ${next.label}</button></footer>
    </article>`;
};
tutorialState.writePostSetupTutorialDone = async done=>{
  tutorialState.postSetupTutorialDone=done;
  await api('/api/settings',{method:'POST',body:JSON.stringify({postSetupTutorialDone:done})});
};
tutorialState.readPostSetupTutorialDone = async()=>{
  if(tutorialState.postSetupTutorialDone===null){
    try{tutorialState.postSetupTutorialDone=(await api('/api/settings')).postSetupTutorialDone===true}
    catch{tutorialState.postSetupTutorialDone=false}
  }
  return tutorialState.postSetupTutorialDone;
};
tutorialState.openTutorialTarget = task=>{
  if(task.setupEntry)writeShell({cameFromSetup:true});
  navigationState.navigatePath(task.href);
};
}
