#!/usr/bin/env node
/** Ordinary P08/P10/child/P05 proof. Never a direct engine shortcut. */
import {full03Receipt} from './full03-product-receipt.mjs';
const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
full03Receipt(option('home'),option('id'),Number(option('attempt')??'1'),'full04')
  .catch(error=>{console.error('FULL04 product refused:',error.message);process.exitCode=1;});
