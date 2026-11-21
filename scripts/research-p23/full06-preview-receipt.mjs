#!/usr/bin/env node
/** Exact percent-equity backend preview proof, preserving Claude's served web. */
import {runPreviewReceipt} from './full03-preview-receipt.mjs';
runPreviewReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),
  process.argv.find(a=>a.startsWith('--action='))?.slice(9),undefined,'full06')
  .catch(error=>{console.error('FULL06 preview refused:',error.message);process.exitCode=1;});
