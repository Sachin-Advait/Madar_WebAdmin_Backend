import {build} from 'vite';
import vm from 'node:vm';
import react from '@vitejs/plugin-react';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),admin=path.join(root,'apps/admin'),output=path.join(root,'data/offline-build');
await build({root:admin,configFile:false,plugins:[react()],define:{'import.meta.env.VITE_SHOWCASE':JSON.stringify('1')},base:'./',build:{outDir:output,emptyOutDir:true,assetsInlineLimit:100000000,cssCodeSplit:false,modulePreload:false,rollupOptions:{output:{inlineDynamicImports:true,format:'iife',entryFileNames:'preview.js',assetFileNames:'[name][extname]'}}}});
let js=await readFile(path.join(output,'preview.js'),'utf8'),css=await readFile(path.join(output,'style.css'),'utf8');
for(const [relative,mime]of [['madar-logo.png','image/png'],['madar-hub-logo.png','image/png'],...['horizon','architecture','learning','landscape'].map(x=>['art/'+x+'.svg','image/svg+xml'])]){
 const data='data:'+mime+';base64,'+(await readFile(path.join(admin,'public',relative))).toString('base64');js=js.split('./'+relative).join(data).split('/'+relative).join(data);css=css.split('./'+relative).join(data).split('/'+relative).join(data);
}
new vm.Script(js);
const linkedAssets=[...css.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1].replace(/['"]/g,''));
if(linkedAssets.some(u=>!u.startsWith('data:')))throw Error('Offline CSS still refers to external assets');
js=js.replaceAll('</script','<\\/script');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MADAR Experience Studio — Offline Preview</title><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>';
await mkdir(path.join(root,'demo'),{recursive:true});await writeFile(path.join(root,'demo/MADAR_Offline_Preview.html'),html);console.log('Offline preview written: '+Buffer.byteLength(html)+' bytes');
