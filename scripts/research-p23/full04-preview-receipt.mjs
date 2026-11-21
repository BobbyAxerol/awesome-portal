#!/usr/bin/env node
/** Reuse the pinned Research preview custody probe without weakening FULL03. */
import {runPreviewReceipt} from './full03-preview-receipt.mjs';
runPreviewReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),
  process.argv.find(a=>a.startsWith('--action='))?.slice(9),
  process.argv.find(a=>a.startsWith('--preserve-concurrent-web-image='))?.slice('--preserve-concurrent-web-image='.length),'full04')
  .catch(error=>{console.error('FULL04 preview probe refused:',error.message);process.exitCode=1;});
