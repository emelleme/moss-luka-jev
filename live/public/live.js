import * as T from 'three';
import {GLTFLoader} from './replay/assets/GLTFLoader.js';
const $=id=>document.getElementById(id);
let state=null,sceneName='can',modelReady=false,lastEventKey='',toastTimer,legacyName=null;
const scene=new T.Scene();scene.fog=new T.FogExp2(0x0c1520,.45);
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch(e){$('phase').textContent='3D UNAVAILABLE';$('action').textContent='Enable browser graphics acceleration, then reload.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
$('viewport').appendChild(renderer.domElement);
const camera=new T.PerspectiveCamera(38,1,.01,20);camera.up.set(0,0,1);
const center=new T.Vector3(.075,0,.15);let yaw=-.95,elevation=.6,distance=1.04;
function updateCamera(){camera.position.set(center.x+distance*Math.cos(yaw)*Math.cos(elevation),center.y+distance*Math.sin(yaw)*Math.cos(elevation),center.z+distance*Math.sin(elevation));camera.lookAt(center);}
updateCamera();
scene.add(new T.HemisphereLight(0xcbeaf4,0x243343,2.2));
const light=new T.DirectionalLight(0xffe2cf,3);light.position.set(.2,-.8,2);light.castShadow=true;
light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.1,far:5});light.shadow.bias=-.0002;scene.add(light);
const rim=new T.DirectionalLight(0x6cf8c7,1.2);rim.position.set(-1,1,.6);scene.add(rim);
const mat=(c,metalness=.12)=>new T.MeshStandardMaterial({color:c,metalness,roughness:.55});
function mesh(geo,material,parent=scene){const m=new T.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const ground=mesh(new T.BoxGeometry(1.7,1.3,.025),mat(0x172735));ground.position.set(.05,0,-.014);
const grid=new T.GridHelper(1.6,32,0x3b5563,0x263d4b);grid.rotation.x=Math.PI/2;grid.position.z=.0003;scene.add(grid);
const edge=new T.LineSegments(new T.EdgesGeometry(ground.geometry),new T.LineBasicMaterial({color:0x486575}));edge.position.copy(ground.position);scene.add(edge);
const nodes={},jawMeshes={left:[],right:[]},jawCenters={};const physicsMeshes={};
for(const [name,color,size] of [['palm',0x389985,[.11,.034,.016]],['gripper_mount',0x283d48,[.036,.034,.036]],['pad_left',0x55c9ad,[.008,.030,.048]],['pad_right',0x55c9ad,[.008,.030,.048]]])physicsMeshes[name]=mesh(new T.BoxGeometry(...size),mat(color));
const cg=new T.CylinderGeometry(.033,.033,.115,48);cg.rotateX(Math.PI/2);
physicsMeshes.can=mesh(cg,mat(0xff947e,.55));
for(const z of [-.0575,.0575]){const cap=mesh(new T.CylinderGeometry(.0333,.0333,.0015,48).rotateX(Math.PI/2),mat(0xc7d1d5,.8),physicsMeshes.can);cap.position.z=z;}
for(const z of [-.0575,.0575]){const rim=mesh(new T.TorusGeometry(.032,.0012,8,48),mat(0xc7d1d5,.8),physicsMeshes.can);rim.position.z=z;}
const tab=mesh(new T.TorusGeometry(.006,.0015,8,20),mat(0xc7d1d5,.8),physicsMeshes.can);tab.scale.y=1.5;tab.position.set(0,.003,.059);
const ring=mesh(new T.TorusGeometry(.048,.0012,6,48),new T.MeshBasicMaterial({color:0x6cf8c7}));ring.position.set(.315,0,.0016);
const tracks=new T.Group(),roverVisual=new T.Group();scene.add(tracks,roverVisual);const treadMeshes=[];
for(const side of [-1,1])for(let i=0;i<68;i++){
 const t=mesh(new T.BoxGeometry(.0085,.036,.008),mat(0x2e3c44),tracks);
 treadMeshes.push({mesh:t,side,index:i});
}
function moveTracks(x){
 tracks.position.x=x;roverVisual.position.x=x;
 const L=.5+2*Math.PI*.036;
 for(const {mesh:t,side,index} of treadMeshes){
 const s=((index/68*L-x)%L+L)%L;let xx,z,a;
 if(s<.25){xx=-.125+s;z=.036;a=0;}else if(s<.25+Math.PI*.036){a=Math.PI/2-(s-.25)/.036;xx=.125+.036*Math.cos(a);z=.036*Math.sin(a);a-=Math.PI/2;}
 else if(s<.5+Math.PI*.036){xx=.125-(s-.25-Math.PI*.036);z=-.036;a=0;}
 else{a=-Math.PI/2-(s-.5-Math.PI*.036)/.036;xx=-.125+.036*Math.cos(a);z=.036*Math.sin(a);a-=Math.PI/2;}
 t.position.set(xx,side*.121,z+.041);t.rotation.y=-a;
 }
}
moveTracks(0);
new GLTFLoader().load('./replay/assets/moss.glb',g=>{
 g.scene.traverse(o=>{
  if(o.name.startsWith('arm_'))nodes[o.name.slice(4)]=o;
 if(['grip_133','grip_159'].includes(o.name))jawMeshes.left.push(o);
 if(['grip_134','grip_160'].includes(o.name))jawMeshes.right.push(o);
 if(o.name==='grip_159'||o.name==='grip_160'){
  o.geometry.computeBoundingBox();jawCenters[o.name==='grip_159'?'left':'right']=o.geometry.boundingBox.getCenter(new T.Vector3());
 }
  if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
 });scene.add(g.scene);for(const child of [...g.scene.children])if(!child.name.startsWith('arm_'))roverVisual.attach(child);modelReady=true;
 for(const n of ['palm','pad_left','pad_right','gripper_mount'])physicsMeshes[n].visible=false;
},undefined,()=>toast('The CAD model could not load. Refresh to retry.'));

let frames=[],lastGeneration=-1;
function accept(s){
 state=s;
 if(s.generation!==lastGeneration){frames=[];lastGeneration=s.generation;}
 frames.push({s,time:performance.now()});if(frames.length>5)frames.shift();
 const o=s.observation, api=$('api-toggle');api.setAttribute('aria-checked',String(s.api_enabled));
 $('api-note').textContent=s.api_enabled?(s.key_ready?'ON · PAY PER CALL':'ON · SERVER KEY MISSING'):'API OFF · FREE REPLAY';
 $('mode-label').textContent='LIVE API';
 $('run').disabled=(s.api_enabled&&!s.key_ready)||s.running||s.pending||!modelReady;
 $('instruction').readOnly=!s.api_enabled;
 $('reach-modal').hidden=!o.reposition_notice;
 $('scenario-description').textContent=legacyName?'V0.1: recorded target selection and scripted motion.':({can:'Pick up a full-size can and drop it into the bin.',miss:'A first attempt misses. MOSS uses feedback to try again.',far:'The can is too far away. MOSS drives closer, then picks it up.',offset:'The can sits off the centre line. MOSS lines up with the offset and picks it up.'}[o.scenario]||'');
 $('run').textContent=s.running?'RUNNING…':s.api_enabled?'RUN LIVE →':'PLAY REPLAY →';$('pause').textContent=!s.running&&o.moving?'RESUME':'PAUSE';$('pause').disabled=!s.running&&!o.moving;$('stop').disabled=!s.running&&!o.moving;
 document.querySelectorAll('#manual button').forEach(b=>b.disabled=s.running||s.pending||o.moving||!modelReady);
 $('phase').textContent=s.error?'PAUSED':s.pending?'JEV IS CHOOSING':s.running?(s.mode==='manual'?'MANUAL PHYSICS CHECK':s.mode==='replay'?'REPLAY · NO API CALLS':'LIVE PHYSICS'):o.settled_in_bin?'COLLECTED':'READY / PAUSED';
 $('action').textContent=s.pending?'Reading the latest state…':o.moving?(o.last_action==='reposition'?'MOSS is repositioning':`${o.last_action.toUpperCase()} · ${s.running?'moving':'paused'}`):o.last_result;
 $('contacts').textContent=`${o.finger_contacts} / 2`;$('calls').textContent=`${s.calls} / ${s.call_limit} calls`;$('cost').textContent=`$${s.cost.toFixed(6)}`;
 if(s.decision){
  $('decision').textContent=s.decision.action.toUpperCase();$('source').textContent=s.decision.source==='jev_recorded'?'TypeSafe Jev · recorded response':'TypeSafe Jev · live API response';$('latency').textContent=`${s.decision.latency_ms} ms`;
  const probs=s.decision.probabilities||{};
  $('probabilities').replaceChildren(...Object.entries(probs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,value])=>{
   const row=document.createElement('div');row.className='prob';const label=document.createElement('span');label.textContent=name;
   const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=`${Math.max(0,Math.min(100,Number(value)*100))}%`;bar.append(fill);
   const number=document.createElement('b');number.textContent=`${Math.round(value*100)}%`;row.append(label,bar,number);return row;
  }));
 }else{
  $('decision').textContent=s.mode==='manual'&&o.last_action?'PHYSICS CHECK':'Your call. Its next move.';
  $('source').textContent=s.mode==='manual'&&o.last_action?'Manual action · no Jev decision':(s.api_enabled?'Live decisions · ':'Recorded Jev decisions · ')+(s.api_enabled?(s.key_ready?'API ready':'server key missing'):'Free replay ready');
  $('latency').textContent='—';$('probabilities').replaceChildren();
 }
 const key=JSON.stringify(s.events.slice(-5));if(key!==lastEventKey){lastEventKey=key;$('events').replaceChildren(...s.events.slice(-5).reverse().map(e=>{const li=document.createElement('li');li.className=e.kind;li.textContent=e.text;return li;}));}
 $('error').hidden=!s.error;
 if(s.error){const exhausted=s.error.code==='credits_exhausted';$('error-title').textContent=exhausted?'KEEP MOSS RUNNING':'SESSION PAUSED';$('error-text').textContent=s.error.message;$('donate').hidden=!exhausted;}
 ring.visible=!o.held&&!o.in_bin;ring.position.set(o.object_m[0],o.object_m[1],.0016);
 sceneName=o.scenario;document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('selected',b.dataset.scene===sceneName));
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
async function command(command,extra={}){
 try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,...extra})});const s=await r.json();if(!r.ok)throw new Error(s.error);accept(s);}
 catch(e){toast(e.message);}
}
$('api-toggle').onclick=async()=>{if(legacyName){await selectModern('can');await command('api',{enabled:true});}else await command('api',{enabled:!state?.api_enabled});};
$('run').onclick=()=>command('run',{instruction:$('instruction').value});
$('pause').onclick=()=>command(state?.running?'pause':'resume');$('stop').onclick=()=>command('stop');$('reset').onclick=()=>command('reset',{scenario:sceneName});
async function selectModern(name){distance=name==='far'?1.3:1.04;legacyName=null;document.body.classList.remove('legacy-view');$('legacy-frame').hidden=true;$('legacy-frame').src='about:blank';$('version-label').textContent='V0.2 · CONTACT PHYSICS';document.querySelectorAll('[data-legacy]').forEach(b=>b.classList.remove('selected'));await command('reset',{scenario:name});}
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>selectModern(b.dataset.scene));
document.querySelectorAll('[data-legacy]').forEach(b=>b.onclick=async()=>{await command('api',{enabled:false});legacyName=b.dataset.legacy;document.body.classList.add('legacy-view');$('legacy-frame').hidden=false;$('legacy-frame').src=`replay/?embed=1&mission=${encodeURIComponent(legacyName)}`;$('version-label').textContent='V0.1 · RECORDED DEMO';$('scenario-description').textContent='V0.1: recorded target selection and scripted motion.';document.querySelectorAll('[data-legacy]').forEach(x=>x.classList.toggle('selected',x===b));});
for(const a of ['reposition','approach','align','close','lift','retry','clear','carry','release','home']){const b=document.createElement('button');b.textContent=a.toUpperCase();b.onclick=()=>command('manual',{action:a});$('manual').append(b);}
function zoom(f){distance=T.MathUtils.clamp(distance*f,.48,1.9);updateCamera();}
$('zoom-in').onclick=()=>zoom(.88);$('zoom-out').onclick=()=>zoom(1.14);$('camera-reset').onclick=()=>{yaw=-.95;elevation=.6;distance=1.04;updateCamera();};
let drag=null;
renderer.domElement.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);};
renderer.domElement.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.006;elevation=T.MathUtils.clamp(elevation+(e.clientY-drag.y)*.005,.12,1.35);drag={x:e.clientX,y:e.clientY};updateCamera();};
renderer.domElement.onpointerup=()=>drag=null;renderer.domElement.onpointercancel=()=>drag=null;
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(e.deltaY*.001));},{passive:false});
new ResizeObserver(()=>{const r=$('viewport').getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height);}).observe($('viewport'));
const m4=new T.Matrix4(),q1=new T.Quaternion(),q2=new T.Quaternion(),p1=new T.Vector3(),p2=new T.Vector3();
function quat(wxyz){return new T.Quaternion(wxyz[1],wxyz[2],wxyz[3],wxyz[0]);}
function render(){
 if(frames.length){
  const now=performance.now()-70;let a=frames[0],b=frames.at(-1);
  for(let i=1;i<frames.length;i++)if(frames[i].time>=now){a=frames[i-1];b=frames[i];break;}
  const t=b.time===a.time?1:T.MathUtils.clamp((now-a.time)/(b.time-a.time),0,1);
  for(const [name,pose] of Object.entries(b.s.transforms.bodies)){
   const node=nodes[name];if(!node)continue;const prev=a.s.transforms.bodies[name]||pose;
   node.matrixAutoUpdate=true;node.position.fromArray(prev).lerp(p2.fromArray(pose),t);
   node.quaternion.copy(quat(prev.slice(3))).slerp(quat(pose.slice(3)),t);
  }
  for(const [name,g] of Object.entries(b.s.transforms.geoms)){
   const node=physicsMeshes[name],prev=a.s.transforms.geoms[name]||g;
   p1.fromArray(prev.p);p2.fromArray(g.p);node.position.copy(p1).lerp(p2,t);
   const rotation=r=>m4.set(r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1);
   q1.setFromRotationMatrix(rotation(prev.r));q2.setFromRotationMatrix(rotation(g.r));node.quaternion.copy(q1).slerp(q2,t);
  }
  const baseA=a.s.observation.base_x_m||0,baseB=b.s.observation.base_x_m||0;
  const baseX=T.MathUtils.lerp(baseA,baseB,t);moveTracks(baseX);
  center.x=b.s.observation.scenario==='far'?.23:.075;updateCamera();
  const frame=nodes.gripper_frame_link;
  if(frame)for(const side of ['left','right']){
   const target=physicsMeshes['pad_'+side].position.clone().sub(frame.position).applyQuaternion(frame.quaternion.clone().invert());
   if(jawCenters[side])for(const jaw of jawMeshes[side])jaw.position.copy(target).sub(jawCenters[side]);
  }
 }
 renderer.render(scene,camera);requestAnimationFrame(render);
}
render();
async function poll(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw new Error('Server unavailable');accept(await r.json());}catch(e){$('phase').textContent='SERVER DISCONNECTED';$('action').textContent='Start the local simulation server.';$('run').disabled=true;}finally{setTimeout(poll,45);}}
await command('api',{enabled:false});
poll();
