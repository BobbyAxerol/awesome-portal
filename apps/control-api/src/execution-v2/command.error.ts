import {AuthError} from "../auth/auth.service";
/** Fixed public dictionary key/action. No raw source reason or payload. */
export class CommandHttpError extends AuthError {
  readonly publicCopyKey:string;
  readonly safeNextAction:"QUERY_SAME_INTENT"|"REVIEW_BLOCKER";
  constructor(code:string,message:string,status:number){super(code,message,status);this.publicCopyKey=code;
    this.safeNextAction=["COMMAND_UNAVAILABLE","COMMAND_STATUS_UNVERIFIED","COMMAND_RETRY_REQUIRED"].includes(code)?"QUERY_SAME_INTENT":"REVIEW_BLOCKER";}
}
