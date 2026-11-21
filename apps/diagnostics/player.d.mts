export class Player {
 constructor(onLevel:(level:number, brightness:number)=>void);
 unlock():Promise<void>;
 stop():void;
 play(bytes:ArrayBuffer,current:()=>boolean):Promise<void>;
 close():Promise<void>;
}
