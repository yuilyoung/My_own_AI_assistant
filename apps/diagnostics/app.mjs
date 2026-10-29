import {TurnGate} from './core.mjs';
import {Player} from './player.mjs';
import {MicrophoneRecorder} from './recorder.mjs';
import {VoiceInput} from './voice-input.mjs';

const $=id=>document.getElementById(id);
const gate=new TurnGate();
const player=new Player(value=>{$('level').style.width=(value*100)+'%';});
let token='',session=null,mode='assistant',active=null,controller=null,connected=false,sttEnabled=false;
const voice=new VoiceInput({
 recorder:new MicrophoneRecorder(),request,
 onResult:text=>{$('message').value=text;$('voice-hint').textContent='인식 결과를 확인·수정한 뒤 전송하세요.';},
 onState:kind=>{
  const labels={idle:'대기',opening:'마이크 권한 확인 중',recording:'녹음 중 · 최대 30초',transcribing:'음성 인식 중'};
  $('microphone').textContent=kind==='recording'?'녹음 완료':'마이크로 입력';
  state(labels[kind],kind!=='idle');
 },onError:showError,
});
const params=new URLSearchParams(location.hash.slice(1));
try {token=params.get('token')||sessionStorage.getItem('assistant-token')||'';}catch{}
if(location.hash)history.replaceState(null,'',location.pathname);
$('token').value=token;

function showError(error){$('error').textContent=error?.name==='AbortError'?'':String(error?.message||error||'');}
async function request(path,options={}){
 const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...options.headers}});
 if(!response.ok){
   const messages={401:'연결 토큰을 확인하세요.',403:'현재 모드에서 허용되지 않은 요청입니다.',404:'세션 또는 오디오가 만료되었습니다.',413:'녹음 길이나 입력 크기가 제한을 초과했습니다.',415:'16kHz 모노 PCM16 WAV가 필요합니다.',503:'로컬 음성 인식이 비활성화되어 있습니다.',422:'입력 형식이나 실행 가능한 작업 수를 확인하세요.'};
   throw new Error(messages[response.status]||'요청 처리에 실패했습니다. 서버 상태를 확인하세요.');
 }
 return response.status===204?null:response.json();
}
function state(text,busy=false){$('state').textContent=text;$('stop').disabled=!busy;$('send').disabled=busy||!connected;$('message').disabled=!connected;$('microphone').disabled=!connected||!session||!sttEnabled||['opening','transcribing'].includes(voice.kind);}
function message(text,kind){
 $('messages').querySelector('.empty')?.remove();
 const bubble=document.createElement('div');bubble.className='bubble '+kind;
 const label=document.createElement('small');label.textContent=kind==='user'?'나':(mode==='assistant'?'개인 비서':'가상 캐릭터');
 const body=document.createElement('span');body.textContent=text;bubble.append(label,body);$('messages').append(bubble);$('messages').scrollTop=$('messages').scrollHeight;
}
function stop(){
 voice.cancel();
 const marker=gate.next();controller?.abort();controller=null;player.stop();
 const old=active;active=null;
 if(old)request(`/sessions/${old.sid}/turns/${old.tid}`,{method:'DELETE'}).catch(error=>{if(gate.accepts(marker))showError(error);});
 state(connected?'대기':'연결 필요');
}
async function switchMode(next){
 voice.cancel();$('voice-hint').textContent='';$('message').value='';
 const old=active;gate.cancel();controller?.abort();player.stop();active=null;session=null;mode=next;
 const generation=gate.next();
 $('assistant').setAttribute('aria-pressed',String(mode==='assistant'));$('companion').setAttribute('aria-pressed',String(mode==='companion'));
 $('mode-title').textContent=mode==='assistant'?'개인 비서':'가상 소개팅';$('note-form').hidden=mode!=='assistant';$('notes').replaceChildren();$('memories').replaceChildren();$('messages').replaceChildren();
 state('세션 준비 중',true);
 if(old)request(`/sessions/${old.sid}/turns/${old.tid}`,{method:'DELETE'}).catch(()=>{});
 if(!connected){state('연결 필요');return;}
 try{
   const created=await request('/sessions',{method:'POST',body:JSON.stringify({mode})});
   if(!gate.accepts(generation))return;
   session=created;state('대기');await refreshLists();
 }catch(error){if(gate.accepts(generation)){showError(error);state('세션 오류');}}
}
async function connect(event){
 event?.preventDefault();token=$('token').value.trim();showError('');
 try{
  const status=await request('/status');connected=true;sttEnabled=status.stt_enabled===true;
  $('stt').textContent=sttEnabled?'로컬 whisper.cpp':'미연결 · 기본 비활성화';
  try{sessionStorage.setItem('assistant-token',token);}catch{}
  $('pairing').hidden=true;$('profile').textContent=status.profile==='demo'?'DEMO · 고정 응답':'LOCAL · 로컬 모델';
  $('llm').textContent=status.llm==='demo'?'테스트 고정 응답':status.model;
  $('tts').textContent=status.tts==='none'?'미연결 · 텍스트만':'로컬 MeloTTS';
  $('notice').textContent=status.llm==='demo'?'데모 모드입니다. AI가 생성한 답변이 아닌 고정 문구를 반환합니다.':'로컬 모델 모드입니다. 모델·음성 워커의 실행 상태는 첫 대화에서 확인합니다.';
  await switchMode(mode);
 }catch(error){connected=false;$('pairing').hidden=false;showError(error);state('연결 실패');}
}
async function send(event){
 event.preventDefault();const text=$('message').value.trim();if(!text||!session)return;
 showError('');stop();
 const run=gate.next(),sid=session.id;controller=new AbortController();const signal=controller.signal;
 const current=()=>gate.accepts(run)&&session?.id===sid;
 $('message').value='';message(text,'user');state('생각 중',true);
 try{
  // Resume in the user gesture before an asynchronous TTS response arrives.
  try{await player.unlock();}catch{}
  const turn=await request(`/sessions/${sid}/turns`,{method:'POST',body:JSON.stringify({text}),signal});
  if(!current()) {request(`/sessions/${sid}/turns/${turn.id}`,{method:'DELETE'}).catch(()=>{});return;}
  active={sid,tid:turn.id};let index=0;
  while(current()){
   const snapshot=await request(`/sessions/${sid}/turns/${turn.id}`,{signal});if(!current())return;
   while(index<snapshot.segments.length&&current()){
    const segment=snapshot.segments[index++];message(segment.text,'assistant');
    if(segment.audio_id){
      state('말하는 중',true);
      const response=await fetch(`/api/sessions/${sid}/audio/${segment.audio_id}`,{headers:{Authorization:'Bearer '+token},signal});
      if(!response.ok)throw new Error('오디오가 만료되었거나 읽을 수 없습니다.');
      const bytes=await response.arrayBuffer();if(!current())return;
      await player.play(bytes,current);
    }
   }
   if(!current())return;
   if(snapshot.warning)$('error').textContent='TTS 연결에 실패하여 텍스트로만 표시합니다. 다른 서비스로 자동 전환하지 않습니다.';
   if(snapshot.status==='error')throw new Error('로컬 모델 연결 또는 응답 형식 오류입니다. Ollama 실행과 모델 설치를 확인하세요.');
   if(['completed','cancelled'].includes(snapshot.status))break;
   state(snapshot.status==='synthesizing'?'음성 준비 중':'생각 중',true);
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 }catch(error){if(current())showError(error);}
 finally{if(current()){active=null;controller=null;state('대기');$('message').focus();}}
}
async function refreshLists(){
 if(!session)return;const sid=session.id;
 const memories=await request(`/sessions/${sid}/memories`);if(session?.id!==sid)return;
 $('memories').replaceChildren();
 for(const memory of memories){
  const row=document.createElement('div');row.className='item';const text=document.createElement('span');text.textContent=memory.text;
  const button=document.createElement('button');button.textContent='삭제';button.onclick=async()=>{try{await request(`/sessions/${sid}/memories/${memory.id}`,{method:'DELETE'});await refreshLists();}catch(error){showError(error);}};
  row.append(text,button);$('memories').append(row);
 }
 if(mode==='assistant'){
  const notes=await request(`/sessions/${sid}/notes`);if(session?.id!==sid)return;$('notes').replaceChildren();
  for(const note of notes){const row=document.createElement('div');row.className='item';row.textContent=note.text;$('notes').append(row);}
 }
}
async function save(event,kind,input){
 event.preventDefault();if(!session)return;
 try{await request(`/sessions/${session.id}/${kind}`,{method:'POST',body:JSON.stringify({text:$(input).value})});$(input).value='';await refreshLists();}catch(error){showError(error);}
}
$('microphone').onclick=async()=>{
 if(!session||!sttEnabled)return;
 try{
  showError('');
  if(voice.kind==='recording'){await voice.finish();return;}
  stop();$('voice-hint').textContent='녹음 완료를 누르면 인식합니다. 결과는 확인 후 전송하세요.';
  await voice.start(session.id);
 }catch(error){showError(error);}
};
$('pairing').onsubmit=connect;$('chat').onsubmit=send;$('stop').onclick=stop;
$('assistant').onclick=()=>switchMode('assistant');$('companion').onclick=()=>switchMode('companion');
$('remember').onsubmit=e=>save(e,'memories','memory');$('note-form').onsubmit=e=>save(e,'notes','note');
$('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('send').disabled)$('chat').requestSubmit();}};
addEventListener('pagehide',()=>{voice.cancel();gate.cancel();controller?.abort();player.close();});
if(token)connect();
