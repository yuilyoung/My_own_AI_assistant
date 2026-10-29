export class Player {
 constructor(onLevel:(level:number)=>void);
 unlock():Promise<void>;
 stop():void;
 play(bytes:ArrayBuffer,current:()=>boolean):Promise<void>;
 close():Promise<void>;
}
