import { useState, useRef, useEffect, useCallback } from "react";

const YT_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const C = {
  bg:"#060D1A", deep:"#0A1628", surface:"#0F1E35", card:"#162540",
  border:"#1E3358", borderHi:"#2A4A7A", accentDim:"#A8BFDA",
  blue:"#1A6FBF", blueBright:"#2A8FEF", blueGlow:"#1A6FBF33",
  text:"#F0F6FF", muted:"#5A7A9F", mutedHi:"#7A9ABF", tag:"#0D2444",
  green:"#22C97A", red:"#FF5A5A", gold:"#F5C842",
};

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Manrope:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;overflow-x:hidden}
body{background:${C.bg};color:${C.text};font-family:'Manrope',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
.app{width:100%;max-width:430px;margin:0 auto;height:100svh;display:flex;flex-direction:column;overflow:hidden;position:relative}
.app::before{content:'';position:fixed;top:-180px;left:-80px;width:420px;height:420px;background:radial-gradient(circle,${C.blue}15 0%,transparent 70%);pointer-events:none;z-index:0}

.hdr{padding:52px 18px 13px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:60;background:${C.bg}EE;backdrop-filter:blur(14px);border-bottom:1px solid ${C.border}}
.logo{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;letter-spacing:-.5px}
.logo em{color:${C.blueBright};font-style:normal}
.logo-tag{font-size:9px;font-weight:700;letter-spacing:2px;color:${C.muted};text-transform:uppercase;margin-top:1px}
.hdr-acts{display:flex;gap:8px}
.ibtn{width:36px;height:36px;border-radius:10px;background:${C.card};border:1px solid ${C.border};color:${C.accentDim};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:all .15s;flex-shrink:0}
.ibtn:active{transform:scale(.92)}

.nav{display:flex;justify-content:space-around;padding:7px 4px 28px;background:${C.deep}EE;backdrop-filter:blur(14px);border-top:1px solid ${C.border};z-index:60;width:100%;flex-shrink:0}
.ni{display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;padding:5px 12px;border-radius:12px;transition:all .15s;color:${C.muted};font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.ni.on{color:${C.text}}
.ni.on .niw{background:${C.blueGlow};border-color:${C.borderHi};color:${C.blueBright}}
.niw{width:40px;height:40px;border-radius:12px;background:transparent;border:1px solid transparent;display:flex;align-items:center;justify-content:center;font-size:19px;transition:all .2s;margin-bottom:1px}
.ni:active{transform:scale(.92)}

.con{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px;padding-bottom:20px;position:relative;z-index:1;-webkit-overflow-scrolling:touch}
.sh{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:${C.muted};text-transform:uppercase;margin-bottom:10px;margin-top:20px}
.sh:first-child{margin-top:4px}
.sh-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;margin-top:20px}
.sh-row:first-child{margin-top:4px}
.sa{font-size:12px;font-weight:700;color:${C.blueBright};cursor:pointer}

.wcard{background:${C.card};border:1px solid ${C.border};border-radius:20px;overflow:hidden;margin-bottom:12px;cursor:pointer;transition:transform .15s,border-color .2s}
.wcard:active{transform:scale(.985)}
.wcard.feat{border-color:${C.borderHi}}
.wthumb{width:100%;height:148px;background:linear-gradient(160deg,${C.surface} 0%,${C.deep} 60%,#091525 100%);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.wthumb::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,${C.card} 100%)}
.thmoji{font-size:52px;position:relative;z-index:1}
.cbadge{position:absolute;top:11px;left:11px;z-index:2;background:${C.blueBright};color:#fff;font-size:9px;font-weight:700;letter-spacing:1.5px;padding:3px 9px;border-radius:6px;text-transform:uppercase}
.csrc{position:absolute;top:11px;right:11px;z-index:2;background:#00000066;color:${C.accentDim};font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px;backdrop-filter:blur(8px)}
.cbody{padding:13px 15px 15px}
.ctitle{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.3px;margin-bottom:7px;line-height:1.15}
.cpills{display:flex;gap:7px;flex-wrap:wrap}
.pill{background:${C.tag};border:1px solid ${C.border};border-radius:8px;font-size:10px;padding:3px 9px;color:${C.mutedHi};font-weight:600}
.pill.hi{border-color:${C.blueBright}44;color:${C.blueBright}}
.pill.grn{border-color:${C.green}44;color:${C.green}}

.hscroll{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;margin-bottom:18px}
.scard{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:10px 8px;min-width:0;width:100%}
.sval{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:${C.blueBright}}
.slbl{font-size:9px;color:${C.muted};font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-top:2px}

.flbl{font-size:10px;font-weight:700;color:${C.muted};letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}
.tinput{background:${C.card};border:1.5px solid ${C.border};border-radius:13px;padding:13px 15px;color:${C.text};font-family:'Manrope',sans-serif;font-size:14px;width:100%;outline:none;transition:border-color .2s;resize:none;box-sizing:border-box}
.tinput:focus{border-color:${C.blueBright}66}
.tinput::placeholder{color:${C.muted}}
select.tinput{appearance:none;cursor:pointer}

.btn{background:${C.blueBright};color:#fff;border:none;border-radius:13px;padding:15px;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;letter-spacing:.3px;cursor:pointer;width:100%;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.btn:active{transform:scale(.97);opacity:.9}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none}
.btn.ghost{background:${C.card};color:${C.text};border:1.5px solid ${C.border}}
.btn.ghost:active{border-color:${C.borderHi}}
.btn.grn{background:${C.green};color:#000}
.btn.sm{padding:9px 14px;font-size:12px;border-radius:10px;width:auto}
.row2{display:flex;gap:9px}
.row2>.btn{flex:1}

.tipcard{background:linear-gradient(135deg,${C.blue}22,${C.blue}08);border:1px solid ${C.borderHi};border-radius:18px;padding:17px}
.tiptitle{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:${C.blueBright};letter-spacing:.5px;margin-bottom:11px}
.tipstep{display:flex;align-items:flex-start;gap:9px;margin-bottom:8px;font-size:12px;line-height:1.4;color:${C.accentDim}}
.tipn{min-width:19px;height:19px;background:${C.blueBright};color:#fff;border-radius:5px;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.ubox{background:${C.card};border:1.5px dashed ${C.border};border-radius:17px;padding:20px;text-align:center;cursor:pointer;transition:border-color .2s}
.ubox:active{border-color:${C.blueBright}}

.loading-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;gap:18px;text-align:center}
.wl{display:flex;gap:5px;align-items:center;height:36px}
.wb{width:4px;border-radius:4px;background:${C.blueBright};animation:wave 1s ease-in-out infinite}
.wb:nth-child(1){animation-delay:0s}.wb:nth-child(2){animation-delay:.1s}.wb:nth-child(3){animation-delay:.2s}.wb:nth-child(4){animation-delay:.3s}.wb:nth-child(5){animation-delay:.4s}
@keyframes wave{0%,100%{height:8px;opacity:.4}50%{height:32px;opacity:1}}

.dtwrap{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:80px}
.dthdr{padding:52px 15px 11px;display:flex;align-items:center;gap:11px;position:sticky;top:0;z-index:10;background:${C.bg}EE;backdrop-filter:blur(14px);border-bottom:1px solid ${C.border}}
.backbtn{width:36px;height:36px;border-radius:10px;background:${C.card};border:1px solid ${C.border};color:${C.text};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:17px;flex-shrink:0}
.dttitle{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;flex:1;line-height:1.1}
.videoarea{width:100%;aspect-ratio:16/9;background:${C.deep};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;position:relative;overflow:hidden}
.videoarea iframe{width:100%;height:100%;border:none;position:absolute;inset:0}
.statsrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;padding:13px 15px}
.stcell{background:${C.card};border:1px solid ${C.border};border-radius:13px;padding:11px 9px;text-align:center}
.stval{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;color:${C.blueBright}}
.stlbl{font-size:8px;color:${C.muted};font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:3px}
.notesbox{background:${C.surface};border:1px solid ${C.border};border-radius:13px;padding:13px 15px;margin:0 15px 13px;font-size:12px;line-height:1.6;color:${C.accentDim}}
.noteslbl{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};margin-bottom:5px}

.exlist{display:flex;flex-direction:column;gap:8px;padding:0 15px}
.exitem{background:${C.card};border:1px solid ${C.border};border-radius:15px;padding:12px 13px;display:flex;align-items:center;gap:11px;transition:border-color .15s}
.exnum{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:${C.border};min-width:22px}
.exemoji{font-size:19px;min-width:22px}
.exinfo{flex:1;min-width:0}
.exname{font-weight:700;font-size:13px;margin-bottom:2px;letter-spacing:-.2px}
.exdetail{font-size:11px;color:${C.muted}}
.exsrc{font-size:9px;color:${C.blue};margin-top:3px;font-weight:700}
.ex-vid-btn{display:flex;align-items:center;gap:4px;background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:4px 9px;font-size:10px;font-weight:700;color:${C.mutedHi};cursor:pointer;transition:all .15s;flex-shrink:0;white-space:nowrap}
.ex-vid-btn:active{border-color:${C.blueBright};color:${C.blueBright}}

.vid-drawer{overflow:hidden;transition:max-height .35s cubic-bezier(.4,0,.2,1);max-height:0}
.vid-drawer.open{max-height:280px}
.vid-drawer-inner{padding:0 13px 13px}
.vid-frame{width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;position:relative}
.vid-frame iframe{width:100%;height:100%;border:none}
.vid-frame-placeholder{width:100%;aspect-ratio:16/9;border-radius:12px;background:${C.surface};border:1px solid ${C.border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:12px;color:${C.muted}}
.vid-meta{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.vid-title{font-size:11px;font-weight:600;color:${C.accentDim};flex:1;line-height:1.3}
.vid-src{font-size:10px;color:${C.muted}}

.awrap{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:80px;-webkit-overflow-scrolling:touch}
.ahdr{padding:52px 15px 11px;display:flex;align-items:center;gap:11px;position:sticky;top:0;z-index:10;background:${C.bg}EE;backdrop-filter:blur(14px);border-bottom:1px solid ${C.border}}
.atimer{font-family:'DM Mono',monospace;font-size:14px;font-weight:500;color:${C.blueBright};background:${C.blueGlow};padding:5px 11px;border-radius:9px;border:1px solid ${C.borderHi}}
.prog-bar-bg{height:4px;background:${C.border};border-radius:4px;margin:0 15px 14px;overflow:hidden}
.prog-bar{height:4px;background:${C.blueBright};border-radius:4px;transition:width .4s}

.vid-overlay{position:fixed;inset:0;background:#000000EE;z-index:200;display:flex;flex-direction:column;animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.vid-overlay-hdr{padding:52px 16px 14px;display:flex;align-items:center;gap:12px;background:${C.bg};border-bottom:1px solid ${C.border}}
.vid-overlay-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:800;flex:1}
.vid-overlay-body{flex:1;display:flex;flex-direction:column;padding:16px;gap:12px;overflow-y:auto}
.vid-overlay-player{width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}
.vid-overlay-player iframe{width:100%;height:100%;border:none}
.vid-overlay-info{background:${C.card};border:1px solid ${C.border};border-radius:13px;padding:14px}
.vid-overlay-notes{font-size:12px;color:${C.accentDim};line-height:1.6}
.vid-overlay-noteslbl{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};margin-bottom:5px}
.vid-key-stat{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.vid-key-pill{background:${C.tag};border:1px solid ${C.border};border-radius:8px;font-size:11px;padding:4px 10px;color:${C.mutedHi};font-weight:600}

.aex-card{margin:0 15px 11px;background:${C.card};border:1px solid ${C.border};border-radius:17px;overflow:hidden;transition:border-color .2s}
.aex-header{padding:13px 14px;display:flex;align-items:center;gap:10px;cursor:pointer}
.aex-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.aex-status{font-size:11px;color:${C.muted};font-weight:600}
.aex-done{color:${C.green};font-weight:700}

.demo-btn{display:flex;align-items:center;gap:6px;background:${C.blueGlow};border:1px solid ${C.borderHi};border-radius:10px;padding:8px 13px;font-size:12px;font-weight:700;color:${C.blueBright};cursor:pointer;transition:all .2s;margin:0 14px 4px}
.demo-btn:active{background:${C.blue}44}
.demo-btn .pulse{width:8px;height:8px;border-radius:50%;background:${C.blueBright};animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.6}}

.set-rows{padding:0 14px 14px;display:flex;flex-direction:column;gap:7px}
.set-row{background:${C.surface};border:1px solid ${C.border};border-radius:11px;padding:10px 12px;display:grid;grid-template-columns:28px 1fr 1fr 1fr 36px;gap:8px;align-items:center}
.set-lbl{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:${C.muted};text-align:center}
.set-input{background:${C.card};border:1px solid ${C.border};border-radius:8px;padding:6px 4px;color:${C.text};font-family:'DM Mono',monospace;font-size:13px;width:100%;outline:none;text-align:center;transition:border-color .2s;-webkit-user-select:text;user-select:text}
.set-input:focus{border-color:${C.blueBright}66}
.set-col-lbl{font-size:9px;color:${C.muted};font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-align:center}
.set-check{width:30px;height:30px;border-radius:9px;background:${C.card};border:1.5px solid ${C.border};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:all .15s}
.set-check.done{background:${C.green}22;border-color:${C.green}55;color:${C.green}}
.set-check:active{transform:scale(.88)}
.addset-btn{background:${C.surface};border:1px solid ${C.border};border-radius:9px;padding:8px;font-size:12px;font-weight:700;color:${C.muted};cursor:pointer;width:100%;transition:all .15s;text-align:center}
.addset-btn:active{border-color:${C.borderHi};color:${C.text}}

.lctrl{display:flex;gap:7px;overflow-x:auto;padding-bottom:3px;margin-bottom:12px}
.lctrl::-webkit-scrollbar{display:none}
.chip{background:${C.card};border:1.5px solid ${C.border};border-radius:20px;padding:5px 13px;font-size:11px;font-weight:700;color:${C.muted};cursor:pointer;white-space:nowrap;transition:all .15s;flex-shrink:0}
.chip.on{background:${C.blueBright};border-color:${C.blueBright};color:#fff}
.chip:active{transform:scale(.94)}
.frow{display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;margin-bottom:12px}
.frow::-webkit-scrollbar{display:none}
.fchip{background:${C.card};border:1.5px solid ${C.border};border-radius:20px;padding:5px 11px;font-size:10px;font-weight:700;color:${C.muted};cursor:pointer;white-space:nowrap;transition:all .15s;flex-shrink:0}
.fchip.on{background:${C.blue}33;border-color:${C.blueBright}66;color:${C.blueBright}}
.fchip:active{transform:scale(.94)}
.lgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.lgcard{background:${C.card};border:1px solid ${C.border};border-radius:15px;padding:13px 11px;cursor:pointer;transition:all .15s;position:relative}
.lgcard:active{transform:scale(.96);border-color:${C.borderHi}}
.lgcard-tag{position:absolute;top:9px;right:9px;background:${C.tag};border:1px solid ${C.border};border-radius:5px;font-size:8px;color:${C.mutedHi};padding:2px 6px;font-weight:700}
.llitem{background:${C.card};border:1px solid ${C.border};border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:11px;margin-bottom:7px;transition:border-color .15s}
.llitem:active{border-color:${C.borderHi}}
.glbl{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:${C.blueBright};letter-spacing:1.5px;text-transform:uppercase;padding:13px 0 7px;border-bottom:1px solid ${C.border};margin-bottom:9px}

.bwrap{display:flex;flex-direction:column;gap:11px}
.bhdr{background:${C.card};border:1px solid ${C.borderHi};border-radius:17px;padding:15px}
.bnameinput{background:transparent;border:none;outline:none;font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:${C.text};width:100%;letter-spacing:-.3px}
.bnameinput::placeholder{color:${C.muted}}
.bexitem{background:${C.card};border:1px solid ${C.border};border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:9px}
.review-input{background:${C.card};border:1.5px solid ${C.border};border-radius:10px;padding:0;height:36px;line-height:36px;color:${C.text};font-family:'DM Mono',monospace;font-size:13px;width:100%;outline:none;text-align:center;transition:border-color .2s;resize:none;box-sizing:border-box;display:block}
.review-input:focus{border-color:${C.blueBright}66}
.rmbtn{width:27px;height:27px;border-radius:7px;background:${C.surface};border:1px solid ${C.border};color:${C.muted};display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;transition:all .15s;flex-shrink:0}
.rmbtn:active{background:#FF4D4D22;border-color:#FF4D4D55;color:${C.red}}
.picker{background:${C.surface};border:1px solid ${C.border};border-radius:17px;padding:15px;max-height:300px;overflow-y:auto}
.ptitle{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:${C.muted};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:11px}
.pitem{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;cursor:pointer;transition:background .15s;margin-bottom:3px}
.pitem:active{background:${C.card}}

.modal-bg{position:fixed;inset:0;background:#00000088;backdrop-filter:blur(6px);z-index:100;display:flex;flex-direction:column;justify-content:flex-end}
.modal{background:${C.deep};border-top:1px solid ${C.borderHi};border-radius:24px 24px 0 0;padding:20px 18px 36px;display:flex;flex-direction:column;gap:13px;max-height:88vh;overflow-y:auto}
.modal-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.3px}

.streak-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:11px}
.streak-cell{background:${C.card};border:1px solid ${C.border};border-radius:13px;padding:13px 11px;text-align:center}
.streak-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:${C.gold}}
.streak-lbl{font-size:9px;color:${C.muted};font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-top:2px}
.prchart{background:${C.card};border:1px solid ${C.border};border-radius:15px;padding:15px;margin-bottom:11px}
.prchart-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:800;margin-bottom:12px}
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:70px}
.bar-col{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1}
.bar{width:100%;border-radius:5px 5px 0 0;background:${C.blueBright}44;min-height:4px}
.bar.max{background:${C.blueBright}}
.bar-lbl{font-family:'DM Mono',monospace;font-size:8px;color:${C.muted};text-align:center}
.pr-badge{display:inline-flex;align-items:center;gap:5px;background:${C.gold}18;border:1px solid ${C.gold}44;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;color:${C.gold}}
.hlog-item{background:${C.card};border:1px solid ${C.border};border-radius:15px;padding:13px 14px;margin-bottom:9px}
.hlog-date{font-family:'DM Mono',monospace;font-size:10px;color:${C.muted};margin-bottom:5px}
.hlog-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;margin-bottom:6px}
.hlog-stats{display:flex;gap:10px;flex-wrap:wrap}
.hlog-stat{font-size:11px;color:${C.mutedHi};font-weight:600}
.hlog-stat em{color:${C.text};font-style:normal}

.empty{text-align:center;padding:44px 22px;color:${C.muted}}
.empty-icon{font-size:44px;margin-bottom:11px}
.etitle{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:${C.text};margin-bottom:5px}
.esub{font-size:12px;line-height:1.6}

.toast{position:fixed;bottom:94px;left:50%;transform:translateX(-50%) translateY(16px);background:${C.blueBright};color:#fff;padding:9px 18px;border-radius:11px;font-weight:700;font-size:12px;opacity:0;transition:all .25s;pointer-events:none;z-index:999;white-space:nowrap}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

.api-banner{background:${C.gold}18;border:1px solid ${C.gold}44;border-radius:12px;padding:11px 14px;margin-bottom:14px;font-size:11px;color:${C.gold};line-height:1.5;font-weight:600}
`;

const EMO = {"Jump Squats":"🦵","Burpees":"💥","High Knees":"🏃","Mountain Climbers":"⛰️","Lateral Jumps":"↔️","Plank Jacks":"🤸","Tuck Jumps":"⬆️","Sprint in Place":"⚡","Hip Thrusts":"🍑","Romanian Deadlifts":"🏋️","Glute Bridges":"🌉","Sumo Squats":"🦵","Donkey Kicks":"🦵","Fire Hydrants":"🔥","Push-Ups":"💪","Pull-Ups":"🔝","Dips":"⬇️","Rows":"🚣","Lunges":"🚶","Deadlifts":"🏋️","Bench Press":"🛋️","Squats":"🦵","Plank":"🧱","Crunches":"🔄","Leg Raises":"⬆️","Bicep Curls":"💪","Tricep Extensions":"💪","Shoulder Press":"🙌","Lat Pulldowns":"🔝","Kettlebell Swings":"🔔","Kettlebell Deadlifts":"🔔","Goblet Squats":"🔔","Turkish Get-Ups":"🔔","Kettlebell Press":"🔔","Kettlebell Rows":"🔔","Kettlebell Lunges":"🔔","Kettlebell Cleans":"🔔","Kettlebell Snatches":"🔔"};
const MG = {"Legs & Glutes":["Jump Squats","Hip Thrusts","Romanian Deadlifts","Glute Bridges","Sumo Squats","Donkey Kicks","Lateral Jumps","Lunges","Squats","Fire Hydrants","Kettlebell Deadlifts","Goblet Squats","Kettlebell Lunges"],"Core & Cardio":["Mountain Climbers","Plank Jacks","High Knees","Sprint in Place","Burpees","Tuck Jumps","Plank","Crunches","Leg Raises","Kettlebell Swings","Turkish Get-Ups"],"Upper Body":["Push-Ups","Pull-Ups","Dips","Rows","Bench Press","Bicep Curls","Tricep Extensions","Shoulder Press","Lat Pulldowns","Kettlebell Press","Kettlebell Rows","Kettlebell Cleans","Kettlebell Snatches"]};
const getMG = n => { for(const[g,ex] of Object.entries(MG)) if(ex.includes(n)) return g; return "Other"; };
const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtDate = d => new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

const YT_FALLBACKS = {
  "Jump Squats":"Hvj5Jdwu2KY","Burpees":"dZgVxmf6jkA","High Knees":"ZZZoCNMU48U","Mountain Climbers":"nmwgirgXLYM","Lateral Jumps":"k3AkFPYe_dA","Plank Jacks":"5GKg9JTBQME","Tuck Jumps":"rkrIAOoJBxM","Sprint in Place":"fuFMkMeB47g",
  "Hip Thrusts":"xn5XiRhJNmU","Romanian Deadlifts":"JCXUYuzwNrM","Glute Bridges":"OUgsJ8-Vi0E","Sumo Squats":"YUbgHfkk6KY","Donkey Kicks":"SJ1Xuz9D-8Q","Fire Hydrants":"la7AduHtYkw",
  "Push-Ups":"IODxDxX7oi4","Pull-Ups":"eGo4IYlbE5g","Dips":"2z8JmcrW-As","Lunges":"QOVaHwm-Q6U","Squats":"aclHkVaku9U","Plank":"pSHjTRCQxIw","Crunches":"MKmrqckCjXA","Bench Press":"SCVCLChPQFY","Deadlifts":"op9kVnSso6Q","Bicep Curls":"ykJmrZ5v0Oo","Shoulder Press":"qEwKCR5JCog",
  "Kettlebell Swings":"1T5SBH0A9Rs","Goblet Squats":"MeIiIdhvXT4","Turkish Get-Ups":"DSoJIFnVQR8",
};

const DEMO_WORKOUTS = [];
const DEMO_HISTORY = [];

const videoCache = {};
const useExerciseVideo = (exerciseName) => {
  const [videoId, setVideoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");

  const fetch = useCallback(async () => {
    if (!exerciseName) return;
    if (videoCache[exerciseName]) { setVideoId(videoCache[exerciseName].id); setTitle(videoCache[exerciseName].title); return; }
    if (!YT_API_KEY) {
      const fallback = YT_FALLBACKS[exerciseName];
      if (fallback) { setVideoId(fallback); setTitle(`${exerciseName} — proper form`); videoCache[exerciseName] = {id:fallback,title:`${exerciseName} — proper form`}; }
      return;
    }
    setLoading(true);
    try {
      const q = encodeURIComponent(`${exerciseName} exercise proper form tutorial`);
      const res = await window.fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&videoDuration=short&maxResults=1&key=${YT_API_KEY}`);
      const data = await res.json();
      if (data.items?.length) {
        const item = data.items[0];
        const id = item.id.videoId;
        const t = item.snippet.title;
        videoCache[exerciseName] = {id, title:t};
        setVideoId(id); setTitle(t);
      }
    } catch { }
    setLoading(false);
  }, [exerciseName]);

  return { videoId, loading, title, fetch };
};

const ExerciseVideoDrawer = ({ exercise, open }) => {
  const { videoId, loading, title, fetch } = useExerciseVideo(exercise.name);
  const containerRef = useRef(null);

  useEffect(() => { if (open && !videoId) fetch(); }, [open]);
  useEffect(() => {
    if (open && containerRef.current) {
      setTimeout(() => containerRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"}), 100);
    }
  }, [open]);

  if (!open) return null;
  return (
    <div ref={containerRef} className={`vid-drawer ${open?"open":""}`}>
      <div className="vid-drawer-inner">
        {loading ? (
          <div className="vid-frame-placeholder"><div style={{fontSize:28}}>🔍</div><div>Finding demo video...</div></div>
        ) : videoId ? (
          <>
            <div className="vid-frame">
              <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"/>
            </div>
            <div className="vid-meta">
              <div className="vid-title">{title}</div>
              <div className="vid-src">YouTube</div>
            </div>
          </>
        ) : (
          <div className="vid-frame-placeholder"><div style={{fontSize:28}}>📹</div><div>No demo found</div></div>
        )}
      </div>
    </div>
  );
};

const VideoOverlay = ({ exercise, onClose }) => {
  const { videoId, loading, title, fetch } = useExerciseVideo(exercise.name);
  useEffect(() => { fetch(); }, []);
  return (
    <div className="vid-overlay">
      <div className="vid-overlay-hdr">
        <div className="backbtn" onClick={onClose}>←</div>
        <div className="vid-overlay-title">{exercise.name}</div>
      </div>
      <div className="vid-overlay-body">
        {loading ? (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,gap:12,color:C.muted}}>
            <div className="wl">{[1,2,3,4,5].map(i=><div key={i} className="wb"/>)}</div>
            <div style={{fontSize:12}}>Finding demo...</div>
          </div>
        ) : videoId ? (
          <div className="vid-overlay-player">
            <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"/>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,gap:12,color:C.muted,background:C.surface,borderRadius:14}}>
            <div style={{fontSize:40}}>📹</div><div style={{fontSize:13}}>No demo video found</div>
          </div>
        )}
        <div className="vid-overlay-info">
          <div className="vid-overlay-noteslbl">Exercise Details</div>
          <div className="vid-key-stat">
            <span className="vid-key-pill">🔁 {exercise.sets} sets</span>
            <span className="vid-key-pill">✕ {exercise.reps} reps</span>
            {exercise.weight && <span className="vid-key-pill">⚖️ {exercise.weight}</span>}
            <span className="vid-key-pill">⏸ Rest {exercise.rest||"60s"}</span>
          </div>
          {exercise.notes && <div className="vid-overlay-notes" style={{marginTop:10}}>{exercise.notes}</div>}
        </div>
        <button className="btn ghost" onClick={onClose}>← Back to Workout</button>
      </div>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState("home");
  const [search, setSearch] = useState("");
  const [onboarded, setOnboarded] = useState(()=>{try{return localStorage.getItem("sl_onboarded")==="1";}catch{return false;}});
  const [workouts, setWorkouts] = useState(()=>{try{const s=localStorage.getItem("sl_workouts");return s?JSON.parse(s):[];}catch{return[];}});
  const [history, setHistory] = useState(()=>{try{const s=localStorage.getItem("sl_history");return s?JSON.parse(s):[];}catch{return[];}});
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [importUrl, setImportUrl] = useState("");
  const [importCaption, setImportCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({show:false,msg:""});
  const [libView, setLibView] = useState("grid");
  const [libFilter, setLibFilter] = useState("All");
  const [builderMode, setBuilderMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customExercises, setCustomExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showCreateEx, setShowCreateEx] = useState(false);
  const [newEx, setNewEx] = useState({name:"",muscleGroup:"Legs & Glutes",defaultSets:"3",defaultReps:"10",defaultWeight:"",notes:"",videoUrl:""});
  const [ownExercises, setOwnExercises] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [timerSec, setTimerSec] = useState(0);
  const [expandedEx, setExpandedEx] = useState(0);
  const [videoOverlay, setVideoOverlay] = useState(null);
  const [showCompletion, setShowCompletion] = useState(null);
  const [pendingWorkout, setPendingWorkout] = useState(null);
  const [openVideos, setOpenVideos] = useState({});
  const timerRef = useRef(null);
  const fileRef = useRef();
  const videoRef = useRef();

  const library = [
    ...workouts.flatMap(w=>w.exerciseList.map(ex=>({...ex,workoutId:w.id,workoutTitle:w.title,influencer:w.influencer||w.source,muscleGroup:getMG(ex.name),isOwn:false}))),
    ...ownExercises.map(ex=>({...ex,workoutId:"own",workoutTitle:"My Exercises",influencer:"You",isOwn:true,sets:ex.defaultSets,reps:ex.defaultReps,weight:ex.defaultWeight})),
  ].filter((ex,i,arr)=>arr.findIndex(e=>e.name===ex.name&&e.workoutId===ex.workoutId)===i);

  useEffect(()=>{try{localStorage.setItem("sl_workouts",JSON.stringify(workouts));}catch{}},[workouts]);
  useEffect(()=>{try{localStorage.setItem("sl_history",JSON.stringify(history));}catch{}},[history]);

  const completeOnboarding = ()=>{try{localStorage.setItem("sl_onboarded","1");}catch{}setOnboarded(true);};
  const showToast = msg=>{setToast({show:true,msg});setTimeout(()=>setToast({show:false,msg:""}),2200);};

  useEffect(()=>{
    if(activeWorkout){timerRef.current=setInterval(()=>setTimerSec(s=>s+1),1000);}
    else{clearInterval(timerRef.current);setTimerSec(0);}
    return()=>clearInterval(timerRef.current);
  },[activeWorkout]);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    const s=p.get("url");
    if(s){setImportUrl(decodeURIComponent(s));setTab("import");}
  },[]);

  const analyzeWithAI = async()=>{
    if(!importUrl&&!importCaption) return;
    setLoading(true);
    try{
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:importUrl,caption:importCaption})});
      const data=await res.json();
      let parsed;
      if(data.exerciseList){
        parsed=data;
      } else {
        const text=data.content?.find(b=>b.type==="text")?.text||data.content?.[0]?.text||"";
        parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      }
      const nw={id:Date.now(),emoji:"✨",isOwn:false,...parsed,videoId:parsed.videoId||null,youtubeId:parsed.videoId||null};
      setImportUrl("");setImportCaption("");setLoading(false);
      setPendingWorkout(nw);setTab("review");
    }catch(e){console.error("Analysis error:",e);setLoading(false);showToast("Analysis failed — try again");}
  };

  const startWorkout=workout=>{
    const session={workoutId:workout.id,workoutTitle:workout.title,startTime:Date.now(),
      exercises:workout.exerciseList.map(ex=>({...ex,sets:Array.from({length:parseInt(ex.sets)||3},(_,i)=>({setNum:i+1,reps:ex.reps||"",weight:ex.weight||"",time:"",done:false}))}))};
    setActiveWorkout(session);setExpandedEx(0);setTab("active");
  };

  const updateSet=useCallback((ei,si,field,val)=>{
    setActiveWorkout(prev=>{const ex=prev.exercises.map((e,i)=>i===ei?{...e,sets:e.sets.map((s,j)=>j===si?{...s,[field]:val}:s)}:e);return{...prev,exercises:ex};});
  },[]);

  const toggleSetDone=(ei,si)=>{
    setActiveWorkout(prev=>{
      const ex=[...prev.exercises];
      const sets=ex[ei].sets.map((s,i)=>i===si?{...s,done:!s.done}:s);
      ex[ei]={...ex[ei],sets};
      if(sets.every(s=>s.done)&&ei<ex.length-1) setTimeout(()=>setExpandedEx(ei+1),400);
      return{...prev,exercises:ex};
    });
  };

  const addSet=ei=>{
    setActiveWorkout(prev=>{const ex=[...prev.exercises];ex[ei]={...ex[ei],sets:[...ex[ei].sets,{setNum:ex[ei].sets.length+1,reps:"",weight:"",time:"",done:false}]};return{...prev,exercises:ex};});
  };

  const finishWorkout=()=>{
    if(!activeWorkout) return;
    const vol=activeWorkout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).reduce((b,s)=>{const r=parseFloat(s.reps)||0,w=parseFloat(s.weight)||1;return b+(r*w);},0),0);
    const log={id:Date.now(),workoutId:activeWorkout.workoutId,workoutTitle:activeWorkout.workoutTitle,date:new Date().toISOString(),duration:timerSec,totalVolume:Math.round(vol),exercises:activeWorkout.exercises};
    setHistory(p=>[log,...p]);
    setShowCompletion({title:activeWorkout.workoutTitle,duration:timerSec,volume:Math.round(vol),sets:activeWorkout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0),exercises:activeWorkout.exercises.length});
    setActiveWorkout(null);setVideoOverlay(null);
  };

  const saveOwnExercise=()=>{
    if(!newEx.name.trim()) return;
    setOwnExercises(p=>[...p,{...newEx,id:Date.now()}]);
    showToast(`${newEx.name} saved ✓`);
    setNewEx({name:"",muscleGroup:"Legs & Glutes",defaultSets:"3",defaultReps:"10",defaultWeight:"",notes:"",videoUrl:""});
    setShowCreateEx(false);
  };

  const addToCustom=ex=>{
    if(customExercises.find(e=>e.name===ex.name)){showToast("Already added");return;}
    setCustomExercises(p=>[...p,ex]);showToast(`${ex.name} added ✓`);
  };

  const saveCustomWorkout=()=>{
    if(!customExercises.length) return;
    const w={id:Date.now(),title:customName||"My Custom Workout",tag:"Custom",emoji:"⚡",source:"Custom",duration:customExercises.length*4,level:"Custom",influencer:"You",isOwn:true,videoId:null,youtubeId:null,notes:"Custom workout built in SetList.",
      exerciseList:customExercises.map(e=>({name:e.name,sets:e.sets||e.defaultSets||"3",reps:e.reps||e.defaultReps||"10",rest:"60s",weight:e.weight||e.defaultWeight||"",notes:e.notes||""}))};
    setWorkouts(p=>[w,...p]);
    setCustomName("");setCustomExercises([]);setBuilderMode(false);setShowPicker(false);
    setSelectedWorkout(w);setTab("detail");showToast("Custom workout saved 🔥");
  };

  const analytics = {
    totalWorkouts: history.length,
    totalVolume: history.reduce((a,h)=>a+(h.totalVolume||0),0),
    streak: (()=>{let s=0,d=new Date();d.setHours(0,0,0,0);for(let i=0;i<30;i++){if(history.some(h=>new Date(h.date).toDateString()===d.toDateString()))s++;else if(i>0)break;d.setDate(d.getDate()-1);}return s;})(),
    prByExercise: (()=>{const prs={};history.forEach(log=>log.exercises.forEach(ex=>ex.sets.filter(s=>s.done).forEach(s=>{const w=parseFloat(s.weight)||0;if(w>0&&(!prs[ex.name]||w>prs[ex.name]))prs[ex.name]=w;})));return prs;})(),
    weeklyVol: (()=>{const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],vals=Array(7).fill(0),now=new Date();history.forEach(h=>{const diff=Math.floor((now-new Date(h.date))/86400000);if(diff<7){const di=(6-diff+now.getDay())%7;vals[di]+=(h.totalVolume||0);}});return{days,vals};})(),
  };

  const renderHome=()=>{
    const filtered=workouts.filter(w=>
      w.title?.toLowerCase().includes(search.toLowerCase())||
      w.tag?.toLowerCase().includes(search.toLowerCase())||
      w.influencer?.toLowerCase().includes(search.toLowerCase())||
      w.level?.toLowerCase().includes(search.toLowerCase())
    );
    return(
      <div className="con">
        <div className="sh-row"><span className="sh" style={{margin:0}}>Overview</span></div>
        <div className="hscroll">
          {[["Workouts",workouts.length],["Exercises",library.length],["Logged",analytics.totalWorkouts],["Streak 🔥",analytics.streak]].map(([l,v])=>(
            <div key={l} className="scard"><div className="sval">{v}</div><div className="slbl">{l}</div></div>
          ))}
        </div>
        <div style={{marginBottom:13,position:"relative"}}>
          <div style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</div>
          <input className="tinput" placeholder="Search workouts..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:38,borderRadius:13}} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"/>
          {search&&<div style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",fontSize:18,cursor:"pointer",color:C.muted}} onClick={()=>setSearch("")}>×</div>}
        </div>
        <div className="sh-row">
          <span className="sh" style={{margin:0}}>{search?`Results · ${filtered.length}`:"All Workouts"}</span>
          <span className="sa" onClick={()=>setTab("import")}>+ Import</span>
        </div>
        {workouts.length===0?(
          <div className="empty">
            <div className="empty-icon">🏋️</div>
            <div className="etitle">No Workouts Yet</div>
            <div className="esub">Tap Import to add your first workout from YouTube, Instagram, or TikTok.</div>
            <button className="btn" style={{marginTop:16}} onClick={()=>setTab("import")}>⚡ Import a Workout</button>
          </div>
        ):filtered.length===0?(
          <div className="empty"><div className="empty-icon">🔍</div><div className="etitle">No Results</div><div className="esub">Try a different search term.</div></div>
        ):filtered.map((w,i)=>(
          <div key={w.id} className={`wcard ${i===0&&!search?"feat":""}`} onClick={()=>{setSelectedWorkout(w);setTab("detail");}}>
            <div className="wthumb" style={(w.videoId||w.youtubeId)?{backgroundImage:`url(https://img.youtube.com/vi/${w.videoId||w.youtubeId}/hqdefault.jpg)`,backgroundSize:"cover",backgroundPosition:"center"}:{}}>
              {!(w.videoId||w.youtubeId)&&<span className="thmoji">{w.emoji}</span>}
              <span className="cbadge">{w.tag}</span>
              <span className="csrc">{w.isOwn?"✦ Mine":w.influencer||w.source}</span>
            </div>
            <div className="cbody">
              <div className="ctitle">{w.title}</div>
              <div className="cpills">
                <span className="pill hi">⏱ {w.duration}m</span>
                <span className="pill">🏋️ {w.exerciseList?.length} exercises</span>
                <span className="pill">{w.level}</span>
                {w.isOwn&&<span className="pill grn">✦ Custom</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ImportScreen=()=>{
    const isInstagramOrTikTok = importUrl && (importUrl.includes("instagram.com") || importUrl.includes("tiktok.com"));
    const canAnalyze = (importUrl || importCaption) && (!isInstagramOrTikTok || importCaption.trim().length > 0);
    return(
      loading?(
        <div className="con">
          <div className="loading-wrap">
            <div className="wl">{[1,2,3,4,5].map(i=><div key={i} className="wb"/>)}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:19,fontWeight:800}}>Building Your Workout</div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.5,textAlign:"center"}}>Transcribing and extracting exercises from your video.</div>
          </div>
        </div>
      ):(
        <div className="con" style={{display:"flex",flexDirection:"column",gap:13}}>
          <div style={{background:`linear-gradient(135deg,${C.blue}22,${C.blue}08)`,border:`1px solid ${C.borderHi}`,borderRadius:18,padding:17}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:5}}>Turn any workout into a structured routine</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>Paste a YouTube link and SetList will transcribe the audio and extract every exercise automatically.</div>
          </div>
          <div>
            <div className="flbl">Post URL <span style={{color:C.muted,fontWeight:400,textTransform:"none",letterSpacing:0}}>(YouTube, Instagram, TikTok)</span></div>
            <input className="tinput" placeholder="https://www.youtube.com/watch?v=..." value={importUrl} onChange={e=>setImportUrl(e.target.value)} autoComplete="off"/>
            {isInstagramOrTikTok&&(
              <div style={{marginTop:7,background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"8px 12px",fontSize:11,color:C.gold,lineHeight:1.5}}>
                📋 Instagram and TikTok links need a description for accurate results. Paste the caption below.
              </div>
            )}
          </div>
          <div>
            <div className="flbl">Workout Description <span style={{color:C.blueBright,fontWeight:700,textTransform:"none",letterSpacing:0}}>← paste caption for best results</span></div>
            <textarea className="tinput" rows={5} placeholder={`Paste the caption, description, or type the workout yourself.\n\nExample:\n4x12 Kettlebell Swings\n3x10 Goblet Squats\n3x15 Romanian Deadlifts`} value={importCaption} onChange={e=>setImportCaption(e.target.value)}/>
            <div style={{fontSize:10,color:C.muted,marginTop:5}}>💡 YouTube links auto-transcribe. For Instagram/TikTok paste the caption.</div>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:13,padding:"11px 14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>How to get best results</div>
            {[["YouTube ✓","Paste the link — audio is transcribed automatically"],["Instagram","Paste link + copy the caption from the post"],["TikTok","Paste link + copy the caption or describe the workout"],["No link","Just type or paste the workout directly below"]].map(([p,t])=>(
              <div key={p} style={{display:"flex",gap:9,marginBottom:6,fontSize:12,lineHeight:1.4}}>
                <span style={{fontWeight:700,color:C.blueBright,minWidth:80,fontSize:11}}>{p}</span>
                <span style={{color:C.accentDim}}>{t}</span>
              </div>
            ))}
          </div>
          <button className="btn" onClick={analyzeWithAI} disabled={!canAnalyze}>⚡ Build Workout</button>
          {isInstagramOrTikTok&&!importCaption.trim()&&(
            <div style={{textAlign:"center",fontSize:11,color:C.muted}}>Add a description above to enable analysis</div>
          )}
        </div>
      )
    );
  };

  const DetailScreen=()=>{
    const w=selectedWorkout;
    if(!w) return null;
    const logs=history.filter(h=>h.workoutId===w.id);
    const ytId = w.videoId||w.youtubeId||null;
    return(
      <div className="dtwrap">
        <div className="dthdr">
          <div className="backbtn" onClick={()=>setTab("home")}>←</div>
          <div className="dttitle">{w.title}</div>
        </div>
        {ytId ? (
          <div className="videoarea">
            <iframe src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"/>
          </div>
        ) : (
          <div className="videoarea">
            <span style={{fontSize:50}}>{w.emoji}</span>
            <span style={{fontSize:12,color:C.muted}}>{w.influencer||w.source}</span>
          </div>
        )}
        <div className="statsrow">
          <div className="stcell"><div className="stval">{w.duration}</div><div className="stlbl">Minutes</div></div>
          <div className="stcell"><div className="stval">{w.exerciseList?.length}</div><div className="stlbl">Exercises</div></div>
          <div className="stcell"><div className="stval">{logs.length}</div><div className="stlbl">Times Done</div></div>
        </div>
        {w.notes&&<div className="notesbox"><div className="noteslbl">Coach Notes</div>{w.notes}</div>}
        <div style={{padding:"0 15px 9px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div className="sh" style={{margin:0}}>Exercises</div>
          <span style={{fontSize:10,color:C.muted}}>Tap ▶ for demo video</span>
        </div>
        <div className="exlist">
          {w.exerciseList?.map((ex,i)=>{
            const vidOpen = openVideos[ex.name];
            return(
              <div key={i} style={{background:C.card,border:`1px solid ${vidOpen?C.borderHi:C.border}`,borderRadius:15,overflow:"hidden",transition:"border-color .2s"}}>
                <div className="exitem" style={{background:"transparent",border:"none",borderRadius:0}}>
                  <div className="exnum">{String(i+1).padStart(2,"0")}</div>
                  <div className="exemoji">{EMO[ex.name]||"💪"}</div>
                  <div className="exinfo">
                    <div className="exname">{ex.name}</div>
                    <div className="exdetail">{ex.sets} sets · {ex.reps} reps{ex.weight?` · ${ex.weight}`:""} · Rest {ex.rest}</div>
                    <div className="exsrc">{w.influencer||w.source}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                    {analytics.prByExercise[ex.name]&&<div style={{fontSize:10,color:C.gold,fontWeight:700}}>PR {analytics.prByExercise[ex.name]}lb</div>}
                    <div className="ex-vid-btn" onClick={e=>{e.preventDefault();e.stopPropagation();setOpenVideos(p=>({...p,[ex.name]:!p[ex.name]}));}}>
                      {vidOpen?"▼ Hide":"▶ Demo"}
                    </div>
                  </div>
                </div>
                <ExerciseVideoDrawer exercise={ex} open={!!vidOpen}/>
              </div>
            );
          })}
        </div>
        <div style={{padding:15,display:"flex",flexDirection:"column",gap:9}}>
          <button className="btn" onClick={()=>startWorkout(w)}>▶ Start Workout</button>
          <div className="row2">
            <button className="btn ghost" onClick={()=>{setBuilderMode(true);setCustomExercises([...(w.exerciseList||[])]);setCustomName(`${w.title} (remix)`);setTab("library");}}>✦ Remix</button>
            <button className="btn ghost" onClick={()=>setTab("progress")}>📊 Progress</button>
          </div>
          <button className="btn" style={{background:C.red}} onClick={()=>{if(window.confirm("Delete this workout?")){setWorkouts(p=>p.filter(x=>x.id!==w.id));setTab("home");}}}>🗑 Delete Workout</button>
        </div>
      </div>
    );
  };

  const ActiveWorkoutScreen=()=>{
    if(!activeWorkout) return null;
    const totalSets=activeWorkout.exercises.reduce((a,ex)=>a+ex.sets.length,0);
    const doneSets=activeWorkout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0);
    const pct=totalSets>0?Math.round(doneSets/totalSets*100):0;
    return(
      <>
        {videoOverlay&&<VideoOverlay exercise={videoOverlay} onClose={()=>setVideoOverlay(null)}/>}
        <div className="awrap" style={{display:videoOverlay?"none":"flex",flexDirection:"column"}}>
          <div className="ahdr">
            <div className="backbtn" onClick={()=>{setActiveWorkout(null);setVideoOverlay(null);setTab("home");}}>←</div>
            <div className="dttitle" style={{fontSize:15}}>{activeWorkout.workoutTitle}</div>
            <div className="atimer">{fmtTime(timerSec)}</div>
          </div>
          <div style={{padding:"10px 15px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:C.muted,fontWeight:600}}>{doneSets}/{totalSets} sets · {pct}%</span>
            <span style={{fontSize:11,color:C.blueBright,fontWeight:700,cursor:"pointer"}} onClick={finishWorkout}>Finish ✓</span>
          </div>
          <div className="prog-bar-bg"><div className="prog-bar" style={{width:`${pct}%`}}/></div>
          {activeWorkout.exercises.map((ex,ei)=>{
            const allDone=ex.sets.every(s=>s.done);
            const open=expandedEx===ei;
            return(
              <div key={ei} className="aex-card" style={{borderColor:open?`${C.blueBright}55`:allDone?`${C.green}33`:C.border}}>
                <div className="aex-header" onClick={()=>setExpandedEx(open?-1:ei)}>
                  <span style={{fontSize:20}}>{EMO[ex.name]||"💪"}</span>
                  <div className="aex-title">{ex.name}</div>
                  <span className={allDone?"aex-status aex-done":"aex-status"}>{allDone?"✓ Done":`${ex.sets.filter(s=>s.done).length}/${ex.sets.length}`}</span>
                  <span style={{color:C.muted,fontSize:13,marginLeft:4}}>{open?"▲":"▼"}</span>
                </div>
                {open&&(
                  <>
                    <div className="demo-btn" onClick={()=>setVideoOverlay(ex)}>
                      <div className="pulse"/>
                      <span>Watch Demo · {ex.name}</span>
                      <span style={{marginLeft:"auto",fontSize:11,opacity:.7}}>Full screen →</span>
                    </div>
                    <div className="set-rows">
                      <div style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr 1fr 36px",gap:8,paddingBottom:4}}>
                        {["Set","Reps","Weight","Time",""].map((l,i)=><div key={i} className="set-col-lbl">{l}</div>)}
                      </div>
                      {ex.sets.map((s,si)=>(
                        <div key={si} className="set-row" style={{background:s.done?`${C.green}0A`:C.surface,borderColor:s.done?`${C.green}33`:C.border}}>
                          <div className="set-lbl">S{si+1}</div>
                          <input className="set-input" placeholder="—" value={s.reps} onChange={e=>updateSet(ei,si,"reps",e.target.value)} inputMode="decimal" autoComplete="off"/>
                          <input className="set-input" placeholder="lb" value={s.weight} onChange={e=>updateSet(ei,si,"weight",e.target.value)} inputMode="decimal" autoComplete="off"/>
                          <input className="set-input" placeholder="—" value={s.time||""} onChange={e=>updateSet(ei,si,"time",e.target.value)} inputMode="decimal" autoComplete="off"/>
                          <div className={`set-check ${s.done?"done":""}`} onClick={()=>toggleSetDone(ei,si)}>{s.done?"✓":"○"}</div>
                        </div>
                      ))}
                      <div className="addset-btn" onClick={()=>addSet(ei)}>+ Add Set</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div style={{padding:15}}><button className="btn grn" onClick={finishWorkout}>✓ Finish & Log Workout</button></div>
        </div>
      </>
    );
  };

  const LibraryScreen=()=>{
    const cats=["All",...Object.keys(MG),"Other"];
    const filtered=libFilter==="All"?library:library.filter(e=>e.muscleGroup===libFilter);
    if(builderMode) return(
      <div className="con">
        <div className="bwrap">
          <div className="bhdr">
            <input className="bnameinput" placeholder="Name your workout..." value={customName} onChange={e=>setCustomName(e.target.value)}/>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>{customExercises.length} exercises selected</div>
          </div>
          {customExercises.length===0&&<div className="empty" style={{padding:20}}><div className="esub">Add exercises from your library or create new ones</div></div>}
          {customExercises.map((ex,i)=>(
            <div key={i} className="bexitem">
              <span style={{color:C.muted,fontSize:15}}>⠿</span>
              <span style={{fontSize:18}}>{EMO[ex.name]||"💪"}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{ex.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{ex.sets||ex.defaultSets} sets · {ex.reps||ex.defaultReps} · {ex.influencer||"You"}</div>
              </div>
              <div className="rmbtn" onClick={()=>setCustomExercises(p=>p.filter((_,j)=>j!==i))}>×</div>
            </div>
          ))}
          <div className="row2">
            <button className="btn ghost sm" onClick={()=>{setShowPicker(p=>!p);setShowCreateEx(false);}}>{showPicker?"▲ Hide Library":"＋ From Library"}</button>
            <button className="btn ghost sm" onClick={()=>{setShowCreateEx(true);setShowPicker(false);}}>✦ New Exercise</button>
          </div>
          {showPicker&&(
            <div className="picker">
              <div className="ptitle">Exercise Library · {library.length}</div>
              {library.map((ex,i)=>(
                <div key={i} className="pitem" onClick={()=>addToCustom(ex)}>
                  <span style={{fontSize:19}}>{EMO[ex.name]||"💪"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13}}>{ex.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>{ex.influencer} · {ex.muscleGroup}</div>
                  </div>
                  <span style={{color:C.blueBright,fontSize:20}}>+</span>
                </div>
              ))}
            </div>
          )}
          <div className="row2">
            <button className="btn ghost" onClick={()=>{setBuilderMode(false);setCustomExercises([]);setCustomName("");setShowPicker(false);}}>Cancel</button>
            <button className="btn" style={{flex:2}} onClick={saveCustomWorkout} disabled={!customExercises.length}>Save Workout</button>
          </div>
        </div>
      </div>
    );
    return(
      <div className="con">
        <div className="sh-row">
          <span className="sh" style={{margin:0}}>Exercise Library · {library.length}</span>
          <span className="sa" onClick={()=>setBuilderMode(true)}>+ Build</span>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button className="btn sm" onClick={()=>setBuilderMode(true)}>✦ Build Workout</button>
          <button className="btn sm ghost" onClick={()=>setShowCreateEx(true)}>＋ New Exercise</button>
        </div>
        <div className="lctrl">
          {["grid","list","grouped"].map(v=>(
            <div key={v} className={`chip ${libView===v?"on":""}`} onClick={()=>setLibView(v)}>
              {v==="grid"?"⊞ Grid":v==="list"?"≡ List":"⊟ Grouped"}
            </div>
          ))}
        </div>
        <div className="frow">
          {cats.map(c=><div key={c} className={`fchip ${libFilter===c?"on":""}`} onClick={()=>setLibFilter(c)}>{c}</div>)}
        </div>
        {library.length===0?(
          <div className="empty"><div className="empty-icon">📚</div><div className="etitle">Library is Empty</div><div className="esub">Import workouts or create your own exercises.</div></div>
        ):libView==="grid"?(
          <div className="lgrid">
            {filtered.map((ex,i)=>(
              <div key={i} className="lgcard" onClick={()=>setVideoOverlay(ex)}>
                {ex.isOwn&&<div style={{position:"absolute",top:9,left:9,background:`${C.green}22`,border:`1px solid ${C.green}44`,borderRadius:5,fontSize:8,color:C.green,padding:"2px 6px",fontWeight:700}}>Mine</div>}
                <div className="lgcard-tag">{ex.muscleGroup?.split(" ")[0]}</div>
                <div style={{fontSize:26,marginBottom:7,marginTop:ex.isOwn?16:0}}>{EMO[ex.name]||"💪"}</div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{ex.name}</div>
                <div style={{fontSize:10,color:C.muted}}>{ex.sets||ex.defaultSets} sets · {ex.reps||ex.defaultReps}</div>
                <div style={{fontSize:9,color:C.blueBright,marginTop:5,fontWeight:700}}>{ex.influencer}</div>
                <div style={{fontSize:9,color:C.muted,marginTop:4}}>▶ Tap for demo</div>
              </div>
            ))}
          </div>
        ):libView==="list"?(
          <div>
            {filtered.map((ex,i)=>(
              <div key={i} className="llitem" onClick={()=>setVideoOverlay(ex)}>
                <span style={{fontSize:21}}>{EMO[ex.name]||"💪"}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{ex.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{ex.sets||ex.defaultSets} sets · {ex.reps||ex.defaultReps} · Rest {ex.rest||"—"}</div>
                  <div style={{fontSize:9,color:C.blueBright,marginTop:2,fontWeight:700}}>{ex.influencer}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  <div style={{background:C.tag,border:`1px solid ${C.border}`,borderRadius:7,fontSize:9,padding:"2px 7px",color:C.mutedHi,fontWeight:700}}>{ex.muscleGroup?.split(" ")[0]}</div>
                  <div style={{fontSize:9,color:C.muted}}>▶ Demo</div>
                </div>
              </div>
            ))}
          </div>
        ):(
          <div>
            {Object.entries(MG).map(([group])=>{
              const exs=filtered.filter(e=>e.muscleGroup===group);
              if(!exs.length) return null;
              return(<div key={group}>
                <div className="glbl">{group} · {exs.length}</div>
                {exs.map((ex,i)=>(
                  <div key={i} className="llitem" onClick={()=>setVideoOverlay(ex)}>
                    <span style={{fontSize:21}}>{EMO[ex.name]||"💪"}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{ex.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{ex.sets||ex.defaultSets} sets · {ex.reps||ex.defaultReps}</div>
                      <div style={{fontSize:9,color:C.blueBright,marginTop:2,fontWeight:700}}>{ex.influencer}</div>
                    </div>
                    <div style={{fontSize:9,color:C.muted}}>▶ Demo</div>
                  </div>
                ))}
              </div>);
            })}
          </div>
        )}
        {library.length>0&&!builderMode&&<div style={{padding:"16px 0 8px"}}><button className="btn" onClick={()=>setBuilderMode(true)}>⚡ Build Custom Workout</button></div>}
      </div>
    );
  };

  const ProgressScreen=()=>{
    const maxVol=Math.max(...analytics.weeklyVol.vals,1);
    const prs=Object.entries(analytics.prByExercise);
    return(
      <div className="con">
        <div className="sh-row"><span className="sh" style={{margin:0}}>Your Progress</span></div>
        <div className="streak-row">
          <div className="streak-cell"><div className="streak-val">{analytics.streak}</div><div className="streak-lbl">Streak 🔥</div></div>
          <div className="streak-cell"><div className="streak-val">{analytics.totalWorkouts}</div><div className="streak-lbl">Total</div></div>
          <div className="streak-cell"><div className="streak-val">{analytics.totalVolume>0?`${Math.round(analytics.totalVolume/1000)}k`:0}</div><div className="streak-lbl">Volume lb</div></div>
        </div>
        <div className="prchart">
          <div className="prchart-title">Weekly Volume</div>
          <div className="bar-chart">
            {analytics.weeklyVol.vals.map((v,i)=>(
              <div key={i} className="bar-col">
                <div className={`bar ${v===maxVol&&v>0?"max":""}`} style={{height:`${Math.max(v/maxVol*100,4)}%`}}/>
                <div className="bar-lbl">{analytics.weeklyVol.days[i]}</div>
              </div>
            ))}
          </div>
        </div>
        {prs.length>0&&(
          <div className="prchart">
            <div className="prchart-title">Personal Records 🏆</div>
            {prs.map(([name,w])=>(
              <div key={name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                <span style={{fontSize:18,cursor:"pointer"}} onClick={()=>setVideoOverlay({name,sets:"—",reps:"—",rest:"—"})}>{EMO[name]||"💪"}</span>
                <div style={{flex:1,fontWeight:700,fontSize:13}}>{name}</div>
                <div className="pr-badge">🏆 {w} lb</div>
              </div>
            ))}
          </div>
        )}
        <div className="sh">Workout History</div>
        {history.length===0?(
          <div className="empty"><div className="empty-icon">📅</div><div className="etitle">No Workouts Logged</div><div className="esub">Start a workout to begin tracking progress.</div></div>
        ):history.map(h=>(
          <div key={h.id} className="hlog-item">
            <div className="hlog-date">{fmtDate(h.date)} · {fmtTime(h.duration)}</div>
            <div className="hlog-title">{h.workoutTitle}</div>
            <div className="hlog-stats">
              <span className="hlog-stat"><em>{h.exercises?.length}</em> exercises</span>
              <span className="hlog-stat"><em>{h.exercises?.reduce((a,e)=>a+e.sets.filter(s=>s.done).length,0)}</em> sets</span>
              {(h.totalVolume||0)>0&&<span className="hlog-stat"><em>{(h.totalVolume||0).toLocaleString()}</em> lb vol</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const CreateExModal=()=>(
    <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setShowCreateEx(false);}}>
      <div className="modal">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div className="modal-title">Create Exercise</div>
          <div style={{fontSize:22,cursor:"pointer",color:C.muted}} onClick={()=>setShowCreateEx(false)}>×</div>
        </div>
        <div><div className="flbl">Exercise Name *</div><input className="tinput" placeholder="e.g. Bulgarian Split Squat" value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))}/></div>
        <div><div className="flbl">Muscle Group</div>
          <select className="tinput" value={newEx.muscleGroup} onChange={e=>setNewEx(p=>({...p,muscleGroup:e.target.value}))}>
            {[...Object.keys(MG),"Other"].map(g=><option key={g}>{g}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:9}}>
          <div style={{flex:1}}><div className="flbl">Sets</div><input className="tinput" placeholder="3" value={newEx.defaultSets} onChange={e=>setNewEx(p=>({...p,defaultSets:e.target.value}))}/></div>
          <div style={{flex:1}}><div className="flbl">Reps</div><input className="tinput" placeholder="10" value={newEx.defaultReps} onChange={e=>setNewEx(p=>({...p,defaultReps:e.target.value}))}/></div>
          <div style={{flex:1}}><div className="flbl">Weight</div><input className="tinput" placeholder="lb" value={newEx.defaultWeight} onChange={e=>setNewEx(p=>({...p,defaultWeight:e.target.value}))}/></div>
        </div>
        <div><div className="flbl">Notes / Form Cues</div><textarea className="tinput" rows={3} placeholder="Tempo, breathing, key cues..." value={newEx.notes} onChange={e=>setNewEx(p=>({...p,notes:e.target.value}))}/></div>
        <div><div className="flbl">Video Reference URL (YouTube)</div><input className="tinput" placeholder="https://youtube.com/..." value={newEx.videoUrl} onChange={e=>setNewEx(p=>({...p,videoUrl:e.target.value}))}/></div>
        <button className="btn" onClick={saveOwnExercise} disabled={!newEx.name.trim()}>Save to Library</button>
      </div>
    </div>
  );

  const OnboardingScreen=()=>{
    const [slide,setSlide]=useState(0);
    const slides=[
      {emoji:"🏋️",title:"Welcome to SetList",sub:"Your personal workout library.\nImport any workout from YouTube,\nInstagram, or TikTok in seconds."},
      {emoji:"⚡",title:"How It Works",sub:"Paste a YouTube link and our AI\ntranscribes the video and extracts\nevery exercise automatically."},
      {emoji:"🔥",title:"Build Your Library",sub:"Save workouts, track your progress,\nbuild custom routines, and\nnever lose a workout again."},
    ];
    const s=slides[slide];
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"60px 28px 48px",textAlign:"center",background:C.bg}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
          <div style={{width:120,height:120,borderRadius:32,background:`linear-gradient(135deg,${C.blue}44,${C.blueBright}22)`,border:`1px solid ${C.borderHi}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:56}}>{s.emoji}</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,letterSpacing:"-.5px",marginBottom:12,color:C.text}}>{s.title}</div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.7,whiteSpace:"pre-line"}}>{s.sub}</div>
          </div>
          <div style={{display:"flex",gap:7,marginTop:8}}>
            {slides.map((_,i)=>(
              <div key={i} style={{width:i===slide?24:7,height:7,borderRadius:4,background:i===slide?C.blueBright:C.border,transition:"all .3s"}}/>
            ))}
          </div>
        </div>
        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
          {slide<slides.length-1?(
            <>
              <button className="btn" onClick={()=>setSlide(s=>s+1)}>Continue →</button>
              <button className="btn ghost" onClick={completeOnboarding} style={{padding:11,fontSize:12,color:C.muted}}>Skip</button>
            </>
          ):(
            <button className="btn" onClick={completeOnboarding}>Get Started 🔥</button>
          )}
        </div>
      </div>
    );
  };

  const ReviewScreen=()=>{
    const [draft, setDraft] = useState(pendingWorkout);
    if(!draft) return null;

    const updateField=(field,val)=>setDraft(p=>({...p,[field]:val}));
    const updateExercise=(i,field,val)=>setDraft(p=>({...p,exerciseList:p.exerciseList.map((ex,j)=>j===i?{...ex,[field]:val}:ex)}));
    const removeExercise=i=>setDraft(p=>({...p,exerciseList:p.exerciseList.filter((_,j)=>j!==i)}));
    const addExercise=()=>setDraft(p=>({...p,exerciseList:[...p.exerciseList,{name:"New Exercise",sets:"3",reps:"10",rest:"60s",weight:"",notes:""}]}));
    const saveWorkout=()=>{
      setWorkouts(p=>[draft,...p]);
      setPendingWorkout(null);
      setSelectedWorkout(draft);
      setTab("detail");
      showToast("Workout saved ✓");
    };

    return(
      <div className="dtwrap">
        <div className="dthdr">
          <div className="backbtn" onClick={()=>{setPendingWorkout(null);setTab("import");}}>←</div>
          <div className="dttitle">Review Workout</div>
          <div style={{fontSize:11,color:C.blueBright,fontWeight:700,cursor:"pointer"}} onClick={saveWorkout}>Save ✓</div>
        </div>
        {draft.videoId&&(
          <div className="videoarea">
            <iframe src={`https://www.youtube.com/embed/${draft.videoId}?rel=0&modestbranding=1`} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"/>
          </div>
        )}
        <div style={{padding:"13px 15px",display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <div className="flbl">Workout Title</div>
            <input className="tinput" value={draft.title} onChange={e=>updateField("title",e.target.value)}/>
          </div>
          <div style={{display:"flex",gap:9}}>
            <div style={{flex:1}}>
              <div className="flbl">Type</div>
              <select className="tinput" value={draft.tag} onChange={e=>updateField("tag",e.target.value)}>
                {["HIIT","Strength","Cardio","Yoga","Core","Full Body"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <div className="flbl">Level</div>
              <select className="tinput" value={draft.level} onChange={e=>updateField("level",e.target.value)}>
                {["Beginner","Intermediate","Advanced"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:11,padding:"9px 13px",fontSize:11,color:C.gold,lineHeight:1.5}}>
            ✏️ Review and fix any exercises below before saving. AI may not be perfect.
          </div>
        </div>
        <div style={{padding:"0 15px 9px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div className="sh" style={{margin:0}}>Exercises · {draft.exerciseList?.length}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,padding:"0 15px"}}>
          {draft.exerciseList?.map((ex,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:15,padding:"12px 13px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{fontSize:20}}>{EMO[ex.name]||"💪"}</div>
                <input className="tinput" value={ex.name} onChange={e=>updateExercise(i,"name",e.target.value)} style={{flex:1,padding:"7px 11px",fontSize:13,fontWeight:700}}/>
                <div className="rmbtn" onClick={()=>removeExercise(i)}>×</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7}}>
                {[["Sets",ex.sets||ex.Sets,"sets"],["Reps",ex.reps||ex.Reps,"reps"],["Rest",ex.rest||ex.Rest,"rest"]].map(([lbl,val,field])=>(
                  <div key={field}>
                    <div style={{fontSize:8,color:C.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{lbl}</div>
                    <input className="review-input" value={val||""} onChange={e=>updateExercise(i,field,e.target.value)} autoComplete="off" inputMode="decimal"/>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{background:C.surface,border:`1.5px dashed ${C.border}`,borderRadius:13,padding:"12px",textAlign:"center",cursor:"pointer",fontSize:13,color:C.muted,fontWeight:700}} onClick={addExercise}>
            + Add Exercise
          </div>
        </div>
        <div style={{padding:15}}>
          <button className="btn" onClick={saveWorkout}>Save Workout ✓</button>
        </div>
      </div>
    );
  };
  const CompletionScreen=()=>{
    const c=showCompletion;
    const [dots]=useState(()=>Array.from({length:40},(_,i)=>({id:i,x:Math.random()*100,delay:Math.random()*0.8,dur:1.2+Math.random()*1.2,color:["#2A8FEF","#22C97A","#F5C842","#FF5A5A","#A855F7"][Math.floor(Math.random()*5)],size:4+Math.random()*8})));
    useEffect(()=>{if(window.navigator.vibrate)window.navigator.vibrate([100,50,100]);},[]);
    return(
      <div style={{position:"fixed",inset:0,background:C.bg,zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"80px 28px 60px",textAlign:"center",overflow:"hidden"}}>
        <style>{`@keyframes confetti{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}@keyframes popIn{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
        {dots.map(d=>(
          <div key={d.id} style={{position:"absolute",left:`${d.x}%`,top:-20,width:d.size,height:d.size,borderRadius:d.size>8?4:50,background:d.color,animation:`confetti ${d.dur}s ${d.delay}s ease-in forwards`,pointerEvents:"none"}}/>
        ))}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,animation:"popIn .5s ease forwards"}}>
          <div style={{fontSize:80}}>🎉</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,marginBottom:8}}>Workout Complete!</div>
            <div style={{fontSize:14,color:C.muted}}>{c.title}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",marginTop:8}}>
            {[["⏱",fmtTime(c.duration),"Duration"],["🏋️",c.exercises,"Exercises"],["✅",c.sets,"Sets Done"],["🔥",c.volume>0?`${c.volume}lb`:"—","Volume"]].map(([icon,val,lbl])=>(
              <div key={lbl} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 10px"}}>
                <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:C.blueBright}}>{val}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",marginTop:2}}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
        <button className="btn" onClick={()=>{setShowCompletion(null);setTab("progress");}}>View Progress 📊</button>
      </div>
    );
  };

const renderMain=()=>{
    if(showCompletion) return <CompletionScreen/>;
    if(!onboarded) return <OnboardingScreen/>;
    if(tab==="active") return <ActiveWorkoutScreen/>;
    if(tab==="detail") return <DetailScreen/>;
    if(tab==="review") return <ReviewScreen/>;
    if(tab==="import") return <ImportScreen/>;
    if(tab==="library") return <LibraryScreen/>;
    if(tab==="progress") return <ProgressScreen/>;
    return renderHome();
  };

  return(
    <>
      <style>{STYLES}</style>
      <div className="app">
        {tab!=="detail"&&tab!=="active"&&(
          <div className="hdr">
            <div><div className="logo">Set<em>List</em></div><div className="logo-tag">by you</div></div>
          </div>
        )}
        {renderMain()}
        {tab!=="active"&&(
          <div className="nav">
            {[{id:"home",icon:"🏠",label:"Home"},{id:"import",icon:"＋",label:"Import"},{id:"library",icon:"📚",label:"Library"},{id:"progress",icon:"📊",label:"Progress"}].map(n=>(
              <div key={n.id} className={`ni ${tab===n.id?"on":""}`} onClick={()=>{setBuilderMode(false);setShowPicker(false);setVideoOverlay(null);setTab(n.id);}}>
                <div className="niw">{n.icon}</div>{n.label}
              </div>
            ))}
          </div>
        )}
        {videoOverlay&&tab!=="active"&&<VideoOverlay exercise={videoOverlay} onClose={()=>setVideoOverlay(null)}/>}
        {showCreateEx&&<CreateExModal/>}
        <div className={`toast ${toast.show?"show":""}`}>{toast.msg}</div>
      </div>
    </>
  );
}
