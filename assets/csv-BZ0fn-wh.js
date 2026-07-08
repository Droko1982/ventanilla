function r(n){const o=t=>{let e=String(t??"");return/^[=+\-@]/.test(e)&&(e="'"+e),'"'+e.replace(/"/g,'""')+'"'};return n.map(t=>t.map(o).join(",")).join(`\r
`)}function a(n,o){const t=new Blob(["\uFEFF"+r(n)],{type:"text/csv;charset=utf-8"}),e=URL.createObjectURL(t),c=document.createElement("a");c.href=e,c.download=o,c.click(),setTimeout(()=>URL.revokeObjectURL(e),1e3)}export{a as d};
