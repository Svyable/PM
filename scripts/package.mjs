#!/usr/bin/env node
/**
 * PM deterministic Chrome extension ZIP builder. Node 20+, no dependencies.
 *
 * node scripts/package.mjs           -> dist/PM-Chrome-Extension-vX.Y.Z.zip
 * node scripts/package.mjs --verify  -> compare every byte to docs/downloads
 *
 * Intentionally uses ZIP STORE and fixed timestamps so GitHub downloads are
 * reproducible and a compiled package cannot silently differ from the source.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'extension/manifest.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('Invalid PM manifest version');
const name='PM-Chrome-Extension-v'+manifest.version+'.zip';
const files=[
  'manifest.json','background.js','content.js',
  'popup.html','popup.css','popup.js',
  'project-panel.js','panel.html','panel.css','panel.js','fleets.js','project-data.js','project-manager.js',
  'icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png',
  'INSTALL.txt'
];
function checksum(bytes){
  let crc=0xffffffff;
  for(const value of bytes){
    crc^=value;
    for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return(crc^0xffffffff)>>>0;
}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n&0xffff);return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
const local=[],central=[];
let pos=0;
for(const file of files){
  const entryName=Buffer.from('extension/'+file,'utf8');
  const bytes=readFileSync(resolve(root,'extension',file));
  const crc=checksum(bytes),size=bytes.length;
  if(size>0xffffffff)throw Error('File too large for ZIP: '+file);
  const localHeader=Buffer.concat([
    u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
    u32(crc),u32(size),u32(size),u16(entryName.length),u16(0)
  ]);
  local.push(localHeader,entryName,bytes);
  const directory=Buffer.concat([
    u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
    u32(crc),u32(size),u32(size),u16(entryName.length),u16(0),
    u16(0),u16(0),u16(0),u32(0),u32(pos),entryName
  ]);
  central.push(directory);
  pos+=localHeader.length+entryName.length+size;
}
const directory=Buffer.concat(central);
const footer=Buffer.concat([
  u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),
  u32(directory.length),u32(pos),u16(0)
]);
const archive=Buffer.concat([...local,directory,footer]);
const digest=createHash('sha256').update(archive).digest('hex');
if(process.argv.includes('--verify')){
  const published=readFileSync(resolve(root,'docs/downloads',name));
  if(!archive.equals(published)){
    throw Error('Committed installer differs from extension source. Rebuild '+name);
  }
  console.log('VERIFIED '+name+' · '+archive.length+' bytes · sha256:'+digest);
}else{
  const output=resolve(root,process.argv.includes('--write-repo')?'docs/downloads':'dist',name);
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,archive);
  console.log(output+' · '+archive.length+' bytes · sha256:'+digest);
}
