"use client";

import { useEffect, useRef } from "react";

type NodeType = "project" | "role" | "skill" | "knowledge" | "minor";
const nodes: Array<[number,number,string,NodeType,string?]> = [
  [50,51,"简历筛选","project"],[32,39,"BeeYo","role","正在协调 Ava 与 Emma"],[55,27,"Ava","role","我先分析候选人技能"],[72,48,"Emma","role","我来补充岗位研究资料"],
  [13,20,"任务分派","skill"],[15,48,"管理团队","skill"],[39,13,"简历分析","skill"],[80,19,"资料检索","skill"],[89,40,"内容整理","skill"],
  [22,76,"管理手册","knowledge"],[43,84,"招聘标准","knowledge"],[66,80,"项目资料","knowledge"],[86,70,"研究方法","knowledge"],
  [7,38,"","minor"],[12,64,"","minor"],[32,60,"","minor"],[57,65,"","minor"],[75,62,"","minor"],[92,56,"","minor"],[56,8,"","minor"],
];
const edges = [[0,1],[0,2],[0,3],[1,4],[1,5],[1,9],[2,6],[2,10],[3,7],[3,8],[3,11],[3,12],[4,13],[5,14],[6,19],[9,14],[10,15],[11,16],[12,17],[8,18],[2,3],[1,2],[1,3],[6,10],[7,12]];

export function NetworkGraph(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;
    const sources:Record<string,string>={BeeYo:"/team-avatars/role1.png",Ava:"/team/ava.png",Emma:"/team/emma.png",skill:"/icon/skill.png",knowledge:"/icon/knowledge.png"};
    const images:Record<string,HTMLImageElement>={};Object.entries(sources).forEach(([key,src])=>{const img=new Image();img.src=src;img.onload=draw;images[key]=img});
    function draw(){const r=canvas!.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas!.width=r.width*d;canvas!.height=r.height*d;ctx!.setTransform(d,0,0,d,0,0);ctx!.clearRect(0,0,r.width,r.height);ctx!.fillStyle="#fff";ctx!.fillRect(0,0,r.width,r.height);const pos=nodes.map(n=>[n[0]*r.width/100,n[1]*r.height/100] as const);ctx!.strokeStyle="#d1d1e3";ctx!.lineWidth=1;edges.forEach(([a,b])=>{ctx!.beginPath();ctx!.moveTo(...pos[a]);ctx!.lineTo(...pos[b]);ctx!.stroke()});nodes.forEach((n,i)=>{const[x,y]=pos[i],type=n[3];if(type==="role"){const img=images[n[2]];ctx!.save();ctx!.beginPath();ctx!.arc(x,y,18,0,Math.PI*2);ctx!.clip();if(img?.complete)ctx!.drawImage(img,x-18,y-18,36,36);else{ctx!.fillStyle="#6161D1";ctx!.fillRect(x-18,y-18,36,36)}ctx!.restore();ctx!.strokeStyle="#1313BA";ctx!.lineWidth=2;ctx!.beginPath();ctx!.arc(x,y,19,0,Math.PI*2);ctx!.stroke();if(n[4]){ctx!.font="500 9px Arial";const w=Math.min(ctx!.measureText(n[4]).width+18,150),bx=x-w/2,by=y-51;ctx!.fillStyle="#fff";ctx!.strokeStyle="#dcdcec";ctx!.lineWidth=1;ctx!.beginPath();ctx!.roundRect(bx,by,w,23,11);ctx!.fill();ctx!.stroke();ctx!.fillStyle="#454552";ctx!.textAlign="center";ctx!.fillText(n[4],x,by+15)}ctx!.font="600 11px Arial";ctx!.fillStyle="#20202a";ctx!.textAlign="center";ctx!.fillText(n[2],x,y+34);return}const radius=type==="project"?12:type==="minor"?3.5:8;ctx!.beginPath();ctx!.arc(x,y,radius,0,Math.PI*2);ctx!.fillStyle=type==="project"?"#1313BA":type==="knowledge"?"#191919":type==="skill"?"#6161D1":"#b8b8c8";ctx!.fill();if((type==="skill"||type==="knowledge")&&images[type]?.complete){ctx!.save();ctx!.beginPath();ctx!.arc(x,y,radius-1,0,Math.PI*2);ctx!.clip();ctx!.drawImage(images[type],x-radius+2,y-radius+2,(radius-2)*2,(radius-2)*2);ctx!.restore()}if(n[2]){ctx!.font=`${type==="project"?"600 15":"500 10"}px Arial`;ctx!.textAlign="center";ctx!.fillStyle="#20202a";ctx!.fillText(n[2],x,y+radius+17);if(type==="skill"||type==="knowledge"){ctx!.font="500 8px Arial";ctx!.fillStyle=type==="skill"?"#6161D1":"#666";ctx!.fillText(type==="skill"?"技能":"知识库",x,y+radius+29)}}})}
    const observer=new ResizeObserver(draw);observer.observe(canvas);draw();return()=>observer.disconnect();
  },[]);
  return <div className="network-graph"><canvas ref={ref}/><div className="graph-legend"><span><i className="role-dot"/>角色头像</span><span><i className="skill-dot"/>技能</span><span><i className="knowledge-dot"/>知识库</span><span><i className="project-dot"/>项目</span></div></div>
}
