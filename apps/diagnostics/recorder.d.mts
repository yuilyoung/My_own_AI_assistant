export class MicrophoneRecorder {
 start(onLimit?:()=>void):Promise<void>;
 finish():Promise<ArrayBuffer>;
 cancel():void;
}
