/**
 * The small vanilla-JS runtime that powers behaviors in compiled sections.
 * It is written as plain JS (not TS) so it can be inlined verbatim into exports.
 * Every instance of the section on a page is initialised independently.
 */
const RUNTIME = String.raw`(function(){
var ROOT="__ROOT__";
var reduce=!!window.SG_EDITOR||window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function opts(el){try{return JSON.parse(el.getAttribute("data-sg-opts")||"{}")}catch(e){return{}}}
function nearest(p){var el=p.parentElement;while(el&&!el.hasAttribute("data-sg-behavior"))el=el.parentElement;return el}
function own(scope,name){return Array.prototype.slice.call(scope.querySelectorAll('[data-sg-part="'+name+'"]')).filter(function(p){return nearest(p)===scope})}
var uid=0;function ensureId(el,p){if(!el.id)el.id=ROOT+"-"+p+"-"+(++uid);return el.id}
function onVisible(el,cb,threshold){if(!("IntersectionObserver" in window)){cb();return}var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){cb();io.disconnect()}})},{threshold:threshold||0.15});io.observe(el)}

var B={
reveal:function(el){var o=opts(el);if(o.stagger)el.style.setProperty("--sg-stagger",o.stagger+"ms");if(o.distance)el.style.setProperty("--sg-reveal-distance",o.distance+"px");
  var kids=Array.prototype.slice.call(el.querySelectorAll(":scope > [data-sg-reveal]"));
  if(reduce){kids.forEach(function(k){k.classList.add("is-visible")});return}
  onVisible(el,function(){kids.forEach(function(k){k.classList.add("is-visible")})})},
tabs:function(el){var tabs=own(el,"tab"),panels=own(el,"panel");if(!tabs.length)return;
  var list=tabs[0].parentElement;list.setAttribute("role","tablist");
  function select(i,focus){tabs.forEach(function(t,j){var on=i===j;t.setAttribute("aria-selected",on);t.tabIndex=on?0:-1;t.classList.toggle("is-active",on);if(panels[j]){panels[j].hidden=!on;panels[j].classList.toggle("is-active",on)}});if(focus)tabs[i].focus()}
  tabs.forEach(function(t,i){t.setAttribute("role","tab");var p=panels[i];if(p){p.setAttribute("role","tabpanel");t.setAttribute("aria-controls",ensureId(p,"panel"));p.setAttribute("aria-labelledby",ensureId(t,"tab"));p.tabIndex=0}
    t.addEventListener("click",function(){select(i)});
    t.addEventListener("keydown",function(e){var n=tabs.length,k=e.key,to=null;if(k==="ArrowRight"||k==="ArrowDown")to=(i+1)%n;else if(k==="ArrowLeft"||k==="ArrowUp")to=(i-1+n)%n;else if(k==="Home")to=0;else if(k==="End")to=n-1;if(to!==null){e.preventDefault();select(to,true)}})});
  var start=tabs.findIndex(function(t){return t.classList.contains("is-active")});select(start<0?0:start)},
accordion:function(el){var o=opts(el);var items=own(el,"item");
  items.forEach(function(item,i){var trig=item.querySelector('[data-sg-part="trigger"]'),content=item.querySelector('[data-sg-part="content"]');if(!trig||!content)return;
    if(trig.tagName!=="BUTTON"){trig.setAttribute("role","button");trig.tabIndex=0}
    trig.setAttribute("aria-controls",ensureId(content,"content"));
    function set(on){item.classList.toggle("is-active",on);trig.setAttribute("aria-expanded",on);trig.classList.toggle("is-active",on)}
    set(item.classList.contains("is-active")||(o.firstOpen==="true"&&i===0));
    function toggle(){var on=!item.classList.contains("is-active");if(on&&o.single!=="false")items.forEach(function(x){if(x!==item){x.classList.remove("is-active");var t=x.querySelector('[data-sg-part="trigger"]');if(t){t.setAttribute("aria-expanded","false");t.classList.remove("is-active")}}});set(on)}
    trig.addEventListener("click",toggle);
    trig.addEventListener("keydown",function(e){if(trig.tagName!=="BUTTON"&&(e.key==="Enter"||e.key===" ")){e.preventDefault();toggle()}})})},
carousel:function(el){var o=opts(el);var track=own(el,"track")[0];if(!track)return;var slides=own(el,"slide");
  track.setAttribute("tabindex","0");track.setAttribute("role","region");if(!track.getAttribute("aria-label"))track.setAttribute("aria-label","Carousel");
  slides.forEach(function(s,i){s.setAttribute("role","group");s.setAttribute("aria-roledescription","slide");s.setAttribute("aria-label",(i+1)+" of "+slides.length)});
  function step(){var s=slides[0];return s?s.getBoundingClientRect().width+parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||0):track.clientWidth}
  function go(d){track.scrollBy({left:d*step(),behavior:reduce?"auto":"smooth"})}
  own(el,"prev").forEach(function(b){if(!b.getAttribute("aria-label"))b.setAttribute("aria-label","Previous");b.addEventListener("click",function(){go(-1)})});
  own(el,"next").forEach(function(b){if(!b.getAttribute("aria-label"))b.setAttribute("aria-label","Next");b.addEventListener("click",function(){go(1)})});
  track.addEventListener("keydown",function(e){if(e.key==="ArrowRight"){e.preventDefault();go(1)}if(e.key==="ArrowLeft"){e.preventDefault();go(-1)}});
  var dots=own(el,"dots")[0],dotBtns=[];
  if(dots){dots.innerHTML="";slides.forEach(function(s,i){var b=document.createElement("button");b.type="button";b.setAttribute("aria-label","Go to slide "+(i+1));b.addEventListener("click",function(){track.scrollTo({left:s.offsetLeft-track.offsetLeft,behavior:reduce?"auto":"smooth"})});dots.appendChild(b);dotBtns.push(b)})}
  function update(){var idx=Math.round(track.scrollLeft/Math.max(1,step()));slides.forEach(function(s,i){s.classList.toggle("is-active",i===idx)});dotBtns.forEach(function(b,i){b.setAttribute("aria-current",i===idx)})}
  var raf=0;track.addEventListener("scroll",function(){cancelAnimationFrame(raf);raf=requestAnimationFrame(update)},{passive:true});update();
  if(o.autoplay==="true"&&!reduce){var paused=false,timer=setInterval(function(){if(paused)return;if(track.scrollLeft+track.clientWidth>=track.scrollWidth-4)track.scrollTo({left:0});else go(1)},parseInt(o.interval||"5000",10));
    ["mouseenter","focusin"].forEach(function(ev){el.addEventListener(ev,function(){paused=true})});["mouseleave","focusout"].forEach(function(ev){el.addEventListener(ev,function(){paused=false})})}},
toggle:function(el){var sw=own(el,"switch")[0];if(!sw)return;var alts=Array.prototype.slice.call(el.querySelectorAll("[data-alt]"));
  alts.forEach(function(a){a.setAttribute("data-orig",a.textContent)});
  if(!sw.hasAttribute("role"))sw.setAttribute("role","switch");
  function set(on){sw.setAttribute("aria-checked",on);sw.classList.toggle("is-active",on);el.classList.toggle("is-active",on);
    alts.forEach(function(a){var v=on?a.getAttribute("data-alt"):a.getAttribute("data-orig");if(reduce){a.textContent=v;return}a.style.transition="opacity .15s";a.style.opacity="0";setTimeout(function(){a.textContent=v;a.style.opacity="1"},150)})}
  sw.addEventListener("click",function(){set(sw.getAttribute("aria-checked")!=="true")});set(false)},
counter:function(el){var o=opts(el);var txt=el.textContent;var m=txt.match(/-?[\d,.]+/);if(!m)return;var target=parseFloat(m[0].replace(/,/g,""));var dec=(m[0].split(".")[1]||"").length;
  var fmt=function(v){var s=v.toFixed(dec);return m[0].indexOf(",")>-1?Number(s).toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec}):s};
  if(reduce)return;el.setAttribute("aria-label",txt);var dur=parseInt(o.duration||"1600",10);
  onVisible(el,function(){var t0=null;function f(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur);var e=1-Math.pow(1-p,3);el.textContent=txt.replace(m[0],fmt(target*e));if(p<1)requestAnimationFrame(f);else el.textContent=txt}requestAnimationFrame(f)},0.4)},
modal:function(el){var dlg=own(el,"dialog")[0];if(!dlg||typeof dlg.showModal!=="function")return;var opener=null;
  own(el,"open").forEach(function(b){b.setAttribute("aria-haspopup","dialog");b.addEventListener("click",function(){opener=b;dlg.showModal()})});
  dlg.querySelectorAll('[data-sg-part="close"]').forEach(function(b){if(!b.getAttribute("aria-label"))b.setAttribute("aria-label","Close");b.addEventListener("click",function(){dlg.close()})});
  dlg.addEventListener("click",function(e){if(e.target===dlg)dlg.close()});dlg.addEventListener("close",function(){if(opener)opener.focus()})},
filter:function(el){var btns=own(el,"filter-button"),items=own(el,"filter-item");var live=document.createElement("p");live.setAttribute("aria-live","polite");live.style.cssText="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";el.appendChild(live);
  function apply(f){var n=0;items.forEach(function(it){var tags=(it.getAttribute("data-tags")||"").split(/[ ,]+/);var show=f==="all"||!f||tags.indexOf(f)>-1;it.classList.toggle("is-hidden",!show);if(show)n++});live.textContent=n+" shown"}
  btns.forEach(function(b){b.setAttribute("aria-pressed",b.classList.contains("is-active"));b.addEventListener("click",function(){btns.forEach(function(x){x.setAttribute("aria-pressed",x===b);x.classList.toggle("is-active",x===b)});apply(b.getAttribute("data-filter"))})})},
compare:function(el){var r=own(el,"range")[0];if(!r)return;if(!r.getAttribute("aria-label"))r.setAttribute("aria-label","Comparison position");function set(){el.style.setProperty("--sg-pos",r.value+"%")}r.addEventListener("input",set);set()},
parallax:function(el){if(reduce||window.matchMedia("(max-width: 767px)").matches)return;var o=opts(el);var speed=parseFloat(o.speed||"0.15");var raf=0;
  function f(){var rect=el.getBoundingClientRect();var off=(rect.top+rect.height/2-window.innerHeight/2)*-speed;el.style.transform="translate3d(0,"+off.toFixed(1)+"px,0)"}
  window.addEventListener("scroll",function(){cancelAnimationFrame(raf);raf=requestAnimationFrame(f)},{passive:true});f()}
};
document.querySelectorAll("."+ROOT).forEach(function(root){
  if(root.__sgInit)return;root.__sgInit=true;root.classList.add("is-enhanced");
  var els=[root].concat(Array.prototype.slice.call(root.querySelectorAll("[data-sg-behavior]")));
  els.forEach(function(el){var t=el.getAttribute("data-sg-behavior");if(t&&B[t]){try{B[t](el)}catch(e){console.warn("Section behavior failed:",t,e)}}});
});
})();`;

export function runtimeJs(rootClass: string): string {
  return RUNTIME.replace('"__ROOT__"', JSON.stringify(rootClass));
}
