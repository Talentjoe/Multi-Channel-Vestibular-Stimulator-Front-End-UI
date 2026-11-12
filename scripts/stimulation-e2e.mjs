import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
const node=(id,type,params,x,y)=>({id,type,name:type,status:'idle',position:{x,y},params});
const nodes=[node('w','wave_sine',{frequency:2,amplitude:0.5,offset:0,phase:0},20,20),node('p','stimulate_output',{channel:1},500,20),node('n','stimulate_output',{channel:2},500,300)];
const edges=['positive','negative'].map((port,i)=>({id:`e${i}`,sourceBlockId:'w',sourcePortId:port,targetBlockId:i?'n':'p',targetPortId:'in',signalType:'number'}));
const load=async document=>page.locator('.toolbar input[type=file]').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});
try{
 await page.goto(process.env.STUDIO_URL||'http://127.0.0.1:5174/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.palette-item').count(),19);
 assert.equal(await page.locator('.block-node').count(),13);
 await page.getByRole('button',{name:'Validate Graph',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Structure and zero-sum proof passed'}).waitFor();
 // Default sample is ready to validate, with inline editable and wired parameters.
 const sine=page.locator('[data-node-id=B3]');
 assert.equal(await sine.locator('.wave-parameters input[type=number]').count(),5);
 const wired=sine.locator('.param-field').filter({hasText:'Amplitude'}).locator('input');assert.equal(await wired.isDisabled(),true);
 const path=page.locator('[data-edge-id=e2] .wire-line');const expanded=await path.getAttribute('d');
 await sine.getByRole('button',{name:/Parameters/}).click();
 assert.equal(await sine.locator('.wave-param-row').count(),1);assert.equal(await sine.locator('[data-param-key=amplitude] input').isDisabled(),true);assert.equal(await sine.locator('[data-port-id="param:amplitude"]').count(),1);assert.equal(await sine.locator('[data-port-id="param:frequency"]').count(),0);assert.equal(await sine.locator('.port-out').count(),2);
 assert.equal(await path.getAttribute('d'),expanded);
 const paramAlignment=await page.evaluate(()=>{const path=document.querySelector('[data-edge-id=e1] .wire-line');const pt=path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM());const r=document.querySelector('[data-node-id=B3] [data-port-id="param:amplitude"] .port-term').getBoundingClientRect();return Math.hypot(pt.x-r.left-r.width/2,pt.y-r.top-r.height/2);});assert.ok(paramAlignment<1);
 const alignment=await page.evaluate(()=>{const path=document.querySelector('[data-edge-id=e2] .wire-line');const pt=path.getPointAtLength(0).matrixTransform(path.getScreenCTM());const r=document.querySelector('[data-node-id=B3] .port-out .port-term').getBoundingClientRect();return Math.hypot(pt.x-r.left-r.width/2,pt.y-r.top-r.height/2);});assert.ok(alignment<1);
 await sine.getByRole('button',{name:/Parameters/}).click();
 const plane=page.locator('.graph-canvas > div');const original=await plane.getAttribute('style');const bounds=await page.locator('.graph-canvas').boundingBox();await page.mouse.move(bounds.x+300,bounds.y+500);await page.mouse.wheel(120,0);await page.waitForFunction(old=>document.querySelector('.graph-canvas > div').getAttribute('style')!==old,original);
 const shifted=await plane.getAttribute('style');await page.keyboard.down('Shift');await page.mouse.wheel(0,100);await page.keyboard.up('Shift');await page.waitForFunction(old=>document.querySelector('.graph-canvas > div').getAttribute('style')!==old,shifted);
 // Live input and chart refresh can change without stopping execution.
 await page.getByRole('button',{name:'Run',exact:true}).click();await page.getByRole('button',{name:'Confirm Run',exact:true}).click();
 await page.getByRole('button',{name:'Front Panel',exact:true}).click();
 assert.equal(await page.getByRole('img',{name:/Channel .* live waveform/}).count(),8);
 const liveSlider=page.getByRole('slider',{name:'Live value B2'});assert.equal(await liveSlider.isEnabled(),true);
 await liveSlider.focus();await page.keyboard.press('Home');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.channel-chart output')).every(e=>Number(e.textContent)===0));
 await page.getByRole('spinbutton',{name:'Display refresh (Hz)'}).fill('5');
 await liveSlider.focus();await page.keyboard.press('End');
 await page.waitForFunction(()=>Math.abs(Number(document.querySelectorAll('.channel-chart output')[2].textContent))===1);
 assert.equal(await page.locator('.runtime-state-value').innerText(),'RUNNING');
 await page.getByRole('spinbutton',{name:'Display refresh (Hz)'}).fill('60');
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.getByRole('button',{name:'Block Diagram',exact:true}).click();
 await load({version:2,nodes,edges:[],settings:{frequency:1000,limit:1}});
 for(const [index,target] of ['p','n'].entries()){
   const from=await page.locator('[data-node-id=w] .port-out').nth(index).locator('.port-term').boundingBox();
   const to=await page.locator(`[data-node-id=${target}] .port-in .port-term`).boundingBox();
   await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();
 }
 assert.equal(await page.locator('.wire').count(),2);
 await page.getByRole('button',{name:'Validate Graph',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Structure and zero-sum proof passed'}).waitFor();
 await page.getByRole('button',{name:'Run',exact:true}).click();await page.getByRole('button',{name:'Confirm Run',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.runtime-state-value')?.textContent==='RUNNING');
 await page.getByRole('button',{name:'Front Panel',exact:true}).click();await page.getByRole('heading',{name:/RUNNING/}).waitFor();
 await page.waitForFunction(()=>Number(document.querySelector('.dash-panel h3')?.textContent?.match(/t = ([\d.]+)/)?.[1])>0.1);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.runtime-state-value')?.textContent==='PAUSED');
 await page.getByRole('button',{name:'Run',exact:true}).click();await page.getByRole('button',{name:'Confirm Run',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.runtime-state-value')?.textContent==='RUNNING');
 await page.getByRole('button',{name:'E-STOP',exact:true}).click();await page.getByRole('button',{name:'RESET',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export Period CSV',exact:true}).click();const download=await pending;
 const csv=await fs.readFile(await download.path(),'utf8');const lines=csv.split('\n');assert.equal(lines.length,501);assert.equal(lines[0],'time_s,ch_1,ch_2,ch_3,ch_4,ch_5,ch_6,ch_7,ch_8');
 for(const line of lines.slice(1)){const a=line.split(',').map(Number);assert.ok(Math.abs(a[1]+a[2])<1e-12);assert.ok(a.slice(3).every(v=>v===0));}
 await page.getByRole('button',{name:'Block Diagram',exact:true}).click();await page.getByRole('button',{name:'Center',exact:true}).click();
 const canvas=await page.locator('.graph-canvas').boundingBox();
 await page.mouse.move(canvas.x+3,canvas.y+3);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width-5,canvas.y+canvas.height-5,{steps:8});await page.mouse.up();assert.equal(await page.locator('.block-node.is-selected').count(),3);
 const before=await page.locator('[data-node-id=w]').boundingBox();await page.mouse.move(before.x+80,before.y+15);await page.mouse.down();await page.mouse.move(before.x+120,before.y+55,{steps:5});await page.mouse.up();assert.equal(await page.locator('.block-node.is-selected').count(),3);
 await page.mouse.move(canvas.x+10,canvas.y+canvas.height-15);await page.keyboard.down('Space');await page.mouse.down();await page.mouse.move(canvas.x+70,canvas.y+canvas.height-45,{steps:4});await page.mouse.up();await page.keyboard.up('Space');
 await page.getByRole('button',{name:'Center',exact:true}).click();
 await page.locator('.block-node').first().click();await page.keyboard.press('Control+a');await page.keyboard.press('Delete');assert.equal(await page.locator('.block-node').count(),0);
 await load({version:1,nodes:[...nodes,node('old','fake_emg',{},0,0)],edges});assert.equal(await page.locator('.block-node').count(),3);
 assert.deepEqual(errors,[]);console.log('PASS: catalog, migration, preflight, runtime, pause/resume, emergency reset, CSV, center and bulk delete; no page errors');
}finally{await browser.close();}
