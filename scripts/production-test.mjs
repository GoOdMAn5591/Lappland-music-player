import { build, preview } from 'vite';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { launchBrowser } from './browser.mjs';

const outDir = path.resolve('test-results/portable-build');
await build({base:'/portable/',build:{outDir},logLevel:'warn'});
const source = await fs.readFile('public/assets/lappland/lappland-cutout-transparent.png');
const bundled = await fs.readFile(path.join(outDir,'assets/lappland/lappland-cutout-transparent.png'));
if(createHash('sha256').update(source).digest('hex')!==createHash('sha256').update(bundled).digest('hex')) throw new Error('Artwork changed during bundling');
const assets = await fs.readdir(path.join(outDir,'assets'));
if(assets.some(name=>/\.(?:jpg|jpeg|png|mp3|wav|flac)$/i.test(name))) throw new Error('Unexpected private media in output');
const server = await preview({configFile:false,base:'/portable/',build:{outDir},preview:{host:'127.0.0.1',port:0},logLevel:'warn'});
const browser = await launchBrowser();
try {
  const page = await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];
  const requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);requests.push(response.url());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/portable/`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'跳过入场动画'}).click();
  await expect(page.locator('.portrait-renderer canvas')).toBeVisible();
  await expect(page.locator('.counter-scene canvas')).toBeVisible();
  if(!requests.some(url=>url.endsWith('/portable/assets/lappland/lappland-cutout-transparent.png')))throw new Error('Base-aware portrait URL was not used');
  if(errors.length)throw new Error(errors.join('\n'));
  await page.screenshot({path:'test-results/production-portable.png'});
  console.log('Production subpath, packaged PNG hash, private-asset exclusion and canvas rendering passed.');
} finally {await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
