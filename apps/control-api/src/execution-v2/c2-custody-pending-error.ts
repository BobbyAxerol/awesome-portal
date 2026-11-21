/** The exact original may exist, but no bearer was delivered. Resume the same
 * lease after recovering independent custody; never mint a replacement. */
export class C2CustodyPendingError extends Error {
  constructor(readonly lease_id:string) {super("C2_CUSTODY_OR_REVALIDATION_PENDING");}
}
