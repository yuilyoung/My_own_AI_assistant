export class MicrophoneRecorder {
 start(onLimit?:()=>void,onFailure?:(error:Error)=>void):Promise<void>;
 finish():Promise<ArrayBuffer>;
 cancel():void;
}
