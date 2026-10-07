import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = worker;
if(!Promise.withResolvers)Promise.withResolvers=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

window.renderVerificationDocument = async ({ data, pages = [] }) => {
  const bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0));
  const pdf=await getDocument({data:bytes,isEvalSupported:false}).promise;
  try {
    const selected=pages.length?pages:Array.from({length:Math.min(6,pdf.numPages)},(_,index)=>index+1),rendered=[];
    if(selected.some(number=>!Number.isInteger(number)||number<1||number>pdf.numPages))throw new Error('请求页码超出实际文档范围');
    for(const number of selected){
      const page=await pdf.getPage(number),original=page.getViewport({scale:1});
      const scale=Math.min(1.5,1400/original.width,2000/original.height),viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const text=(await page.getTextContent()).items.map(item=>item.str||'').join(' ');
      rendered.push({page:number,width:canvas.width,height:canvas.height,text,image:canvas.toDataURL('image/png')});
      page.cleanup();
    }
    return {pageCount:pdf.numPages,pages:rendered,renderedAll:new Set(selected).size===pdf.numPages};
  }finally{await pdf.destroy();}
};
