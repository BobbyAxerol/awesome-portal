import {AuthError} from "../auth/auth.service";
import {AccessPolicyError} from "./access.contract";
import {CommandError} from "./command.contract";
/** Fixed public dictionary key/action. No raw source reason or payload. */
export class CommandHttpError extends AuthError {
  readonly publicCopyKey:string;
  readonly safeNextAction:"QUERY_SAME_INTENT"|"REVIEW_BLOCKER";
  constructor(code:string,message:string,status:number){super(code,message,status);this.publicCopyKey=code;
    this.safeNextAction=["COMMAND_UNAVAILABLE","COMMAND_STATUS_UNVERIFIED","COMMAND_RETRY_REQUIRED",
      "REGISTRATION_UNAVAILABLE","REGISTRATION_RECEIPT_UNVERIFIED"].includes(code)?"QUERY_SAME_INTENT":"REVIEW_BLOCKER";}
}

/** One public boundary for named command and parent-detail reads. Never expose
 * provider diagnostics; hidden and unknown receipts have identical envelopes. */
export async function commandHttpCall<T>(call:()=>Promise<T>):Promise<T> {
  try { return await call(); }
  catch(error) {
    if(error instanceof CommandError || error instanceof AccessPolicyError)
      throw new CommandHttpError(error.status===404?"COMMAND_RESOURCE_NOT_FOUND":error.code,
        "The requested command is not available. Review its status before retrying.",error.status);
    throw new CommandHttpError("COMMAND_UNAVAILABLE",
      "The command service is unavailable. Query the same intent before retrying.",503);
  }
}
