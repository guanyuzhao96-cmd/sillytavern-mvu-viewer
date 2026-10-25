const assert=require('node:assert/strict'),zlib=require('node:zlib');
(async()=>{
 const I=await import('./worldbooks-import.mjs');const {archive}=require('./worldbooks.js');
 const sample={entries:{0:{uid:0,content:'保留未知字段',extra:{x:3}}},unknown:{keep:true}};
 const zip=await archive([{name:'中文世界书',data:sample}]).arrayBuffer();const decoded=await I.readZip(zip);assert.equal(decoded[0].filename,'中文世界书.json');assert.deepEqual(I.validateJson(decoded[0].text),sample);
 // Minimal valid deflated ZIP with a nested filename, without filesystem extraction.
 function deflated(name,text){const filename=Buffer.from(name),body=Buffer.from(text),compressed=zlib.deflateRawSync(body),crc=I.crc32(body);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(filename.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+filename.length,12);end.writeUInt32LE(30+filename.length+compressed.length,16);
  const buffer=Buffer.concat([local,filename,compressed,central,filename,end]);return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 }
 const compressed=deflated('folder/压缩世界书.json',JSON.stringify(sample));const items=await I.readZip(compressed);assert.deepEqual(I.validateJson(items[0].text),sample);
 const loaded=await I.loadImportFiles([new File([compressed],'compressed.zip'),new File(['invalid'],'bad.json'),new File([JSON.stringify(sample)],'plain.json')]);assert.equal(loaded.books.length,2);assert.equal(loaded.errors.length,1);
 const corrupt=zip.slice(0);new Uint8Array(corrupt)[30+new DataView(corrupt).getUint16(26,true)]^=1;await assert.rejects(()=>I.readZip(corrupt));await assert.rejects(()=>I.readZip(new ArrayBuffer(1)),/无效 ZIP/);
 assert.throws(()=>I.validateJson('{"entries":[]}'));assert.deepEqual(I.validateJson('\uFEFF'+JSON.stringify(sample)),sample);
 assert.equal(I.safeName('../../CON.json'),'_CON');assert.equal(I.safeName('folder\\a:b.json'),'a_b');assert(new TextEncoder().encode(I.safeName('字'.repeat(100)+'.json')).length<=180);
 const books=[{filename:'same.json',data:sample},{filename:'same.json',data:sample}];assert.equal(I.planImports(books,['same'],'skip').skipped.length,2);assert.deepEqual(I.planImports(books,['same'],'copy').plans.map(p=>p.name),['same (2)','same (3)']);assert.equal(I.planImports(books,['same'],'overwrite').plans.length,1);assert.equal(I.planImports([{filename:'SAME.json'}],['same'],'overwrite').plans[0].name,'same');assert(I.equalJson({b:1,a:{y:2,x:3}},{a:{x:3,y:2},b:1}));
 console.log('PASS import: STORE/DEFLATE ZIP, UTF-8/nested names, CRC/truncation failures, BOM/native JSON validation, independent invalid-file reports, safe names, duplicate policies and unique targets');
})().catch(e=>{console.error(e);process.exitCode=1});
