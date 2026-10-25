// Bounded queue: native deletion APIs with UI side effects must stay serial.
export async function deleteBatch(names, remove, {concurrency=1,stopOnError=true,onProgress=()=>{}}={}) {
  const results=[];let cursor=0,stopped=false;
  async function worker(){
    while(!stopped&&cursor<names.length){
      const name=names[cursor++];
      try{await remove(name);results.push({name,ok:true});}
      catch(error){results.push({name,ok:false,error:error?.message||String(error)});if(stopOnError)stopped=true;}
      onProgress(results.length,names.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),names.length)},worker));
  return results;
}
