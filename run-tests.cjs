const {spawnSync}=require('node:child_process');
for(const test of ['test.cjs','host-test.cjs','native-test.cjs','cleanup-test.cjs','gallery-test.cjs','startup-test.cjs','modal-test.cjs','edit-import-regression.cjs','native-bridge-test.cjs']){
 const result=spawnSync(process.execPath,[test],{stdio:'inherit',cwd:__dirname,timeout:30000,env:{...process.env,MVU_JSDOM_PATH:'jsdom'}});
 if(result.status!==0){console.error(result.error||'FAIL: '+test);process.exit(result.status||1);}
}
