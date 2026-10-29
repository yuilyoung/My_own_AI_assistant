export interface Recorder {
 start(onLimit:()=>void): Promise<void>;
 finish(): Promise<ArrayBuffer>;
 cancel(): void;
}
export type VoiceKind='idle'|'opening'|'recording'|'transcribing';
export class VoiceInput {
 constructor(options:{recorder:Recorder;request:<T>(path:string,options?:RequestInit)=>Promise<T>;onResult:(text:string)=>void;onState:(state:VoiceKind)=>void;onError:(error:unknown)=>void;interval?:number});
 kind:VoiceKind;
 cancel():void;
 start(sid:string):Promise<void>;
 finish():Promise<void>;
}
