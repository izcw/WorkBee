"use client";

import { useEffect, useRef } from "react";

const nodes = [
  [50,48,"公共知识库","public"],[20,25,"BeeYo","role"],[50,18,"Codeo","role"],[80,28,"Lexo","role"],
  [20,73,"管理手册","knowledge"],[43,78,"工程基线","knowledge"],[65,75,"技术规范","knowledge"],[85,70,"项目资料","knowledge"],
] as const;
const edges=[[0,1],[0,2],[0,3],[1,4],[2,5],[2,6],[3,7]];

export function KnowledgeGraph(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const c=ref.current;if(!c)return;const x=c.getContext("2d");if(!x)return;const src:Record<string,string>={BeeYo:"/team-avatars/role1.png",Codeo:"/team/codeo.png",Lexo:"/team/lexo.png",knowledge:"/icon/knowledge.png"};const imgs:Record<string,HTMLImageElement>={};Object.entries(src).forEach(([k,s])=>{const i=new Image();i.src=s;i.onload=draw;imgs[k]=i});function draw(){const r=c!.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c!.width=r.width*d;c!.height=r.height*d;x!.setTransform(d,0,0,d,0,0);x!.clearRect(0,0,r.width,r.height);x!.fillStyle="#fff";x!.fillRect(0,0,r.width,r.height);const p=nodes.map(n=>[n[0]*r.width/100,n[1]*r.height/100] as const);x!.strokeStyle="#d7d7e8";x!.lineWidth=1.2;edges.forEach(([a,b])=>{x!.beginPath();x!.moveTo(...p[a]);x!.lineTo(...p[b]);x!.stroke()});nodes.forEach((n,j)=>{const[px,py]=p[j],type=n[3];if(type==="role"){x!.save();x!.beginPath();x!.arc(px,py,17,0,Math.PI*2);x!.clip();const im=imgs[n[2]];if(im?.complete)x!.drawImage(im,px-17,py-17,34,34);x!.restore();x!.strokeStyle="#1313BA";x!.lineWidth=2;x!.beginPath();x!.arc(px,py,18,0,Math.PI*2);x!.stroke()}else{x!.beginPath();x!.arc(px,py,type==="public"?12:9,0,Math.PI*2);x!.fillStyle=type==="public"?"#1313BA":"#191919";x!.fill();if(imgs.knowledge?.complete){x!.save();x!.beginPath();x!.arc(px,py,type==="public"?10:7,0,Math.PI*2);x!.clip();x!.drawImage(imgs.knowledge,px-7,py-7,14,14);x!.restore()}}x!.textAlign="center";x!.font=type==="public"?"600 12px Arial":"500 10px Arial";x!.fillStyle="#25252f";x!.fillText(n[2],px,py+31);x!.font="500 8px Arial";x!.fillStyle=type==="role"?"#6161D1":"#777";x!.fillText(type==="role"?"角色":"知识库",px,py+43)})}const o=new ResizeObserver(draw);o.observe(c);draw();return()=>o.disconnect()},[]);
  return <div className="knowledge-graph"><canvas ref={ref}/><span>公共知识库可被所有角色选择，专属知识库仅连接指定成员</span></div>;
}
