import React,{useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import './style.css';
type Mode='assistant'|'companion';
type Session={id:string};
type Turn={id:string;segments:{text:string}[];status:string};
function App(){
 const[token,setToken]=useState(new URLSearchParams(location.hash.slice(1)).get('token')||'');
 const[connected,setConnected]=useState(false),[mode,setMode]=useState<Mode>('assistant');
 const connectedRef=useRef(false);
 const[session,setSession]=useState<Session|null>(null),[input,setInput]=useState('');
 const[messages,setMessages]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),controller=useRef<AbortController|null>(null),active=useRef<{sid:string;tid:string}|null>(null);
 const api=async<T,>(path:string,init:RequestInit={}):Promise<T>=>{const response=await fetch('/api'+path,{...init,headers:{Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});if(!response.ok)throw Error('HTTP '+response.status);return response.status===204?undefined as T:await response.json() as T;};
 const stop=()=>{generation.current++;controller.current?.abort();controller.current=null;const old=active.current;active.current=null;if(old)void api('/sessions/'+old.sid+'/turns/'+old.tid,{method:'DELETE'}).catch(()=>{});setBusy(false);};
 const switchMode=async(next:Mode)=>{stop();setMode(next);setSession(null);setMessages([]);setInput('');if(!connectedRef.current)return;const gen=generation.current;try{const s=await api<Session>('/sessions',{method:'POST',body:JSON.stringify({mode:next})});if(gen===generation.current)setSession(s);}catch(e){if(gen===generation.current)setError(String(e));}};
 const connect=async()=>{stop();setError('');const gen=generation.current;try{await api('/status');if(gen!==generation.current)return;const s=await api<Session>('/sessions',{method:'POST',body:JSON.stringify({mode})});if(gen!==generation.current)return;connectedRef.current=true;setConnected(true);history.replaceState(null,'',location.pathname);setSession(s);}catch(e){if(gen===generation.current)setError(String(e));}};
 const send=async(e:React.FormEvent)=>{e.preventDefault();if(!session||busy||!input.trim())return;stop();const gen=generation.current,sid=session.id,abort=new AbortController();controller.current=abort;const current=()=>gen===generation.current&&!abort.signal.aborted;setBusy(true);setMessages(v=>[...v,'나: '+input]);const text=input;setInput('');try{const turn=await api<Turn>('/sessions/'+sid+'/turns',{method:'POST',body:JSON.stringify({text}),signal:abort.signal});if(!current()){void api('/sessions/'+sid+'/turns/'+turn.id,{method:'DELETE'}).catch(()=>{});return;}active.current={sid,tid:turn.id};let seen=0;while(current()){const result=await api<Turn>('/sessions/'+sid+'/turns/'+turn.id,{signal:abort.signal});if(!current())return;for(const segment of result.segments.slice(seen))setMessages(v=>[...v,'AI: '+segment.text]);seen=result.segments.length;if(result.status==='completed'||result.status==='cancelled')break;if(result.status==='error')throw Error('모델 오류');await new Promise(r=>setTimeout(r,250));}}catch(e){if(current())setError(String(e));}finally{if(current()){active.current=null;setBusy(false);}}};
 return <main><h1>My own AI assistant</h1><p>React 텍스트 UI · Live2D 및 음성은 아직 연결되지 않았습니다.</p>{!connected?<div><input aria-label="토큰" type="password" value={token} onChange={e=>setToken(e.target.value)}/><button onClick={()=>void connect()}>연결</button></div>:<><nav><button onClick={()=>void switchMode('assistant')}>개인 비서</button><button onClick={()=>void switchMode('companion')}>가상 소개팅</button></nav><p>모드: {mode} / {session?'연결됨':'세션 대기'}</p><section role="log">{messages.map((m,i)=><p key={i}>{m}</p>)}</section><form onSubmit={e=>void send(e)}><textarea aria-label="메시지" value={input} onChange={e=>setInput(e.target.value)} disabled={!session||busy}/><button disabled={!session||busy}>전송</button><button type="button" disabled={!busy} onClick={stop}>중지</button></form></>}{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
