/** 请求失败使用统一的中文原因，不初始化界面或路由状态。 */
export function requestErrorMessage(cause:any,status=0):string{
  const text=String(cause?.message??cause??'');
  const code=Number(status||cause?.status||text.match(/\b(400|401|403|404|408|409|413|429|500|502|503|504)\b/)?.[1]);
  const messages:Record<number,string>={400:'The submission is invalid. Check your input and try again.',401:'Your session has expired. Refresh the page and sign in again.',403:'This device does not have permission for this action. Do it on the computer running Peach.',404:'The requested item no longer exists. Refresh the list.',408:'The request timed out. Try again later.',409:'This action is not allowed in the current state. Refresh and try again.',413:'The submission is too large. Reduce the amount and try again.',429:'Too many requests. Try again later.',500:'The Peach service failed to process this. Try again; if it keeps failing, check the tray log.',502:'The Peach service returned no result. Try again later; if it keeps failing, check the tray log.',503:'The Peach service is temporarily unavailable. Try again later.',504:'Timed out waiting for the service. Try again later.'};
  if(/Failed to fetch|fetch failed|NetworkError|\bLoad failed|network request failed|ERR_CONNECTION/i.test(text))return 'Cannot connect to the Peach service. Check your network connection and that the tray service is running.';
  /* 正文里的 timeout 字样只在没有状态码时才算超时：500 的堆栈里常带着某个库的 timeout 参数名。 */
  if(cause?.name==='TimeoutError'||(!code&&/timed? ?out|timeout/i.test(text)))return 'Timed out waiting for the service. Check the connection and try again.';
  /* 服务端给用户读的整句（中文，或以大写开头、句号收尾的英文）原样显示；堆栈与裸状态词走下面的统一原因。 */
  const sentence=/^[A-Z][^\n]{8,300}[.!?)]$/.test(text)&&!/Traceback|Exception|httpx|\bat \S+\(/.test(text);
  if((/[㐀-鿿]/.test(text)||sentence)&&!/^(请求失败[（(]|Request failed \()/.test(text))return text;
  if(messages[code])return messages[code];
  return 'The action did not complete. Try again; if it keeps failing, check the tray log.';
}
