import{p as u}from"./index-DXvlLM6M.js";const b=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"],f=104,w=106;function $(e){const i=[f];for(const n of e){const o=n.charCodeAt(0)-32;i.push(o<0||o>94?0:o)}let t=f;for(let n=1;n<i.length;n++)t+=i[n]*n;return i.push(t%103),i.push(w),i}function v(e,i={}){const{moduleWidth:t=2,height:n=48,quiet:o=10,showText:d=!1}=i,x=$(e).map(c=>b[c]).join("");let l=o*t,r=!0,h="";for(const c of x){const p=Number(c)*t;r&&(h+=`<rect x="${l}" y="0" width="${p}" height="${n}" fill="#000"/>`),l+=p,r=!r}const s=Math.round(l+o*t),a=d?16:0;return`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${n+a}" viewBox="0 0 ${s} ${n+a}"><rect width="${s}" height="${n+a}" fill="#fff"/>${h}`+(d?`<text x="${s/2}" y="${n+a-3}" text-anchor="middle" font-family="monospace" font-size="13">${e}</text>`:"")+"</svg>"}function m(e,i){const t=e.barcode||e.internalCode||"",n=t?v(t,{moduleWidth:2,height:40}):"";return`
    <div class="lbl">
      <div class="biz">${i}</div>
      <div class="name">${e.name}</div>
      <div class="price">${u(e.price)}${e.unit==="peso"?"/kg":""}</div>
      <div class="bars">${n}</div>
      <div class="code">${t}</div>
    </div>`}const y=`
    *{font-family:Arial, sans-serif; margin:0; padding:0;}
    body{padding:8px; display:flex; flex-wrap:wrap; gap:8px;}
    .lbl{width:230px; border:1px solid #ccc; border-radius:6px; padding:8px; text-align:center;}
    .biz{font-size:10px; color:#666;}
    .name{font-size:13px; font-weight:bold; margin:3px 0; min-height:32px;}
    .price{font-size:24px; font-weight:800;}
    .bars{margin:6px 0 2px; line-height:0;}
    .bars svg{display:block; margin:0 auto; max-width:100%; height:auto;}
    .code{font-family:'Courier New',monospace; font-size:11px; letter-spacing:1px;}
    @media print { .lbl { page-break-inside: avoid; } }`;function g(e){const i=`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
  <style>${y}</style></head><body>${e}</body></html>`,t=window.open("","_blank","width=720,height=560");t&&(t.document.write(i),t.document.close(),t.focus(),setTimeout(()=>t.print(),300))}function z(e,i,t=1){g(m(e,i).repeat(Math.max(1,t)))}function A(e,i){e.length&&g(e.map(t=>m(t,i)).join(""))}export{A as a,z as p};
