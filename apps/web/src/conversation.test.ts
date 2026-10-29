import {expect, it, vi} from 'vitest';
import {Conversation} from './conversation';
import {GatewayClient} from './gateway';
const deferred = <T,>() => {let resolve!: (value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
function setup(){
 const client=new GatewayClient('test');
 vi.spyOn(client,'status').mockResolvedValue({llm:'demo',tts:'none',stt_enabled:false,model:null});
 vi.spyOn(client,'createSession').mockImplementation(async mode=>({id:mode}));
 vi.spyOn(client,'request').mockResolvedValue([]);
 vi.spyOn(client,'cancelTurn').mockResolvedValue();
 const player={unlock:vi.fn(async()=>{}),stop:vi.fn(),close:vi.fn(async()=>{}),play:vi.fn(async()=>{})};
 const recorder={cancel:vi.fn(),start:vi.fn(async()=>{}),finish:vi.fn(async()=>new ArrayBuffer(44))};
 const app=new Conversation(client,player,recorder,0);
 return {app,client,player,recorder};
}
it('discards and cancels a turn created after switching modes',async()=>{
 const {app,client,player}=setup();await app.connect();
 const pending=deferred<{id:string;status:string;segments:[]}>();
 vi.spyOn(client,'createTurn').mockReturnValue(pending.promise);
 const poll=vi.spyOn(client,'pollTurn');
 app.setInput('hello');const sending=app.send();await Promise.resolve();await Promise.resolve();
 await app.changeMode('companion');pending.resolve({id:'late',status:'queued',segments:[]});await sending;
 expect(client.cancelTurn).toHaveBeenCalledWith('assistant','late');expect(poll).not.toHaveBeenCalled();
 expect(app.state.messages).toEqual([]);expect(app.state.mode).toBe('companion');expect(player.stop).toHaveBeenCalled();
});
it('plays authenticated audio and keeps text when playback fails',async()=>{
 const {app,client,player}=setup();await app.connect();
 vi.spyOn(client,'createTurn').mockResolvedValue({id:'t',status:'queued',segments:[]});
 vi.spyOn(client,'pollTurn').mockResolvedValue({id:'t',status:'completed',segments:[{text:'answer',audio_id:'audio'}]});
 vi.spyOn(client,'audio').mockResolvedValue(new ArrayBuffer(12));player.play.mockRejectedValue(new Error('speaker'));
 app.setInput('question');await app.send();
 expect(client.audio).toHaveBeenCalledWith('assistant','audio',expect.any(AbortSignal));
 expect(app.state.messages.map(m=>m.text)).toEqual(['question','answer']);expect(app.state.error).toContain('speaker');expect(app.state.busy).toBe(false);
});
it('puts a transcript in the composer without creating a chat turn',async()=>{
 const {app,client,recorder}=setup();await app.connect();app.state.status!.stt_enabled=true;
 const create=vi.spyOn(client,'createTurn');
 vi.mocked(client.request).mockImplementation(async path=>path.endsWith('/transcriptions')?{id:'job'}:path.endsWith('/job')?{status:'completed',text:'인식 결과'}:undefined);
 await app.toggleMicrophone();expect(recorder.start).toHaveBeenCalled();await app.toggleMicrophone();
 expect(app.state.input).toBe('인식 결과');expect(create).not.toHaveBeenCalled();expect(app.state.voice).toBe('idle');
});
it('ignores stale memory lists when the mode changes',async()=>{
 const {app,client}=setup();const old=deferred<unknown>();
 vi.mocked(client.request).mockImplementation(async path=>path==='/sessions/assistant/memories'?old.promise:[]);
 const connecting=app.connect();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 await app.changeMode('companion');old.resolve([{id:'secret',text:'private'}]);await connecting;
 expect(app.state.memories).toEqual([]);expect(app.state.notes).toEqual([]);
});
