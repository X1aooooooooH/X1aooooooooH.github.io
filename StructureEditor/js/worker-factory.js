window.BlockFlowWorkers=(()=>{
 const scriptUrl=document.currentScript?.src||new URL('./worker-factory.js',location.href).href;
 const editorRoot=new URL('../',scriptUrl);
 const files=Object.freeze({snapshot:'snapshot.js',batch:'batch.js',geometry:'geometry-baker.js'});
 const workers=new Set();
 const create=id=>{
  const file=files[id];
  if(!file)throw new Error('未知后台任务：'+id);
  const worker=new Worker(new URL('workers/'+file+'?v=2.12.2',editorRoot).href,{name:'BlockFlow-'+id});
  workers.add(worker);
  const terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{terminate();workers.delete(worker);};
  return worker;
 };
 window.addEventListener('pagehide',()=>{for(const worker of workers)worker.terminate();workers.clear();},{once:true});
 return Object.freeze({create});
})();
                                                                           
