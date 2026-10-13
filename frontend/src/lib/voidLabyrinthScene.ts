import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import stoneUrl from '../assets/battle/stone-floor-tile.png';
import type { PveTier } from './pveTypes';
import { gameArtUrl } from './artAssets';

export type VoidWorld = { select: (tier: PveTier, node: number) => void; dispose: () => void };

// Environment light only; no connection to combat spell presentation or resolution.
const shaftVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const shaftFragment = `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying vec2 vUv;
void main() {
  float width = mix(0.17, 0.62, 1.0-vUv.y);
  float across = exp(-pow((vUv.x-0.5)/width*2.4, 2.0));
  float ends = smoothstep(0.0,0.2,vUv.y) * (1.0-smoothstep(0.82,1.0,vUv.y));
  float veil = 0.86 + 0.08*sin(vUv.y*19.0-uTime*0.3);
  gl_FragColor = vec4(uColor, across*ends*veil*uStrength);
}
`;
const mistFragment = `
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 cell=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),f.x),mix(hash(cell+vec2(0.,1.)),hash(cell+vec2(1.,1.)),f.x),f.y);
}
void main() {
  vec2 p=vUv*vec2(6.0,2.0)+vec2(uTime*0.009,0.);
  float n=noise(p)*0.6+noise(p*2.0)*0.3+noise(p*4.0)*0.1;
  float edge=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);
  gl_FragColor=vec4(vec3(0.12,0.145,0.155),pow(edge,1.4)*n*0.3);
}
`;

export function createVoidWorld(host: HTMLElement, onContextLost: () => void): VoidWorld {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setClearColor(0x050708, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070b0f, .017);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 140);
  camera.position.set(0, 6.2, 24);
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const blockGeometry = new Map<string, THREE.ExtrudeGeometry>();
  const floating: { object: THREE.Object3D; baseY: number; amplitude: number; phase: number }[] = [];
  let disposed = false, contextLost = false;
  const stone = new THREE.TextureLoader().load(stoneUrl, texture => { if (disposed) texture.dispose(); else draw(0); });
  textures.add(stone); stone.colorSpace = THREE.SRGBColorSpace;
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(1.7, 1.7);
  const masonry = new THREE.MeshStandardMaterial({ color: 0xe0e4dc, map: stone, bumpMap: stone, bumpScale: .13, roughness: .89, metalness: .08 });
  const cutStone = new THREE.MeshStandardMaterial({ color: 0x46525a, roughness: .87, bumpMap: stone, bumpScale: .18 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x9f8550, metalness: .68, roughness: .5, bumpMap: stone, bumpScale: .035 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x171c1b, metalness: .58, roughness: .64 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xe5b97c, toneMapped: false });
  [masonry, cutStone, gold, iron, flame].forEach(material => materials.add(material));
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    geometries.add(geometry); materials.add(material);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function block(x: number, y: number, z: number, w: number, h: number, d: number, material = masonry, parent: THREE.Object3D = scene) {
    const key = [w, h, d].join(':');
    let geometry = blockGeometry.get(key);
    if (!geometry) {
      const profile = new THREE.Shape();
      profile.moveTo(-w/2,-h/2); profile.lineTo(w/2,-h/2); profile.lineTo(w/2,h/2); profile.lineTo(-w/2,h/2); profile.closePath();
      const bevel = Math.min(w,h,d)*.085;
      geometry = new THREE.ExtrudeGeometry(profile, { depth:d, steps:1, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:1 });
      geometry.translate(0,0,-d/2); blockGeometry.set(key, geometry);
    }
    return mesh(geometry, material, x,y,z,parent);
  }
  function suspend(object: THREE.Object3D, amplitude: number, phase: number) {
    floating.push({ object, baseY:object.position.y, amplitude, phase });
  }
  // A cool backlight reveals edges; almost no ambient light fills the void.
  scene.add(new THREE.HemisphereLight(0x9bacb8, 0x0a0806, 1.1));
  const moon = new THREE.DirectionalLight(0xb4c4d0, 4.3);
  moon.position.set(9,17,-13); moon.target.position.set(0,2,-4); scene.add(moon,moon.target);
  moon.castShadow = true; moon.shadow.mapSize.set(1024,1024);
  Object.assign(moon.shadow.camera,{left:-21,right:21,top:18,bottom:-16,near:1,far:62});
  moon.shadow.normalBias=.035; moon.shadow.bias=-.0002;
  const fill = new THREE.DirectionalLight(0x8a969f,1.7); fill.position.set(-10,5,13); scene.add(fill);

  // A fractured causeway has visible thickness and gaps; there is no continuous floor.
  for (let segment=0;segment<9;segment++) {
    const slab=block(0,-.18+segment*.07,10-segment*1.45,4.3+(segment>5?(segment-5)*1.1:0),.44,1.32,masonry);
    slab.rotation.y=Math.sin(segment*2.1)*.016;
    for (const side of [-1,1]) {
      block(side*1.92,slab.position.y+.25,slab.position.z,.025,.016,1.14,gold);
      if(segment%3===0) block(side*2.2,slab.position.y+.58,slab.position.z,.22,.7,.3,cutStone);
    }
  }
  for (const side of [-1,1]) {
    for(let step=0;step<5;step++) block(side*(2.8+step*.82),.36+step*.035,-1.6-step*.42,1.05,.32,1.68,masonry);
  }
  const portals: { group:THREE.Group; rune:THREE.MeshStandardMaterial; spot:THREE.SpotLight; candle:THREE.PointLight; shaft:THREE.ShaderMaterial; card:THREE.Group; baseCardY:number }[]=[];
  for(let index=0;index<3;index++) {
    const group=new THREE.Group(); group.position.set((index-1)*6.8,.35,-4-index*.65); scene.add(group);
    const platform=block(0,-.36,0,5.4,.8,4.7,cutStone,group);
    block(0,.06,0,5.12,.14,4.4,masonry,group);
    // Narrow gold seams outline the slab rather than lighting its whole surface.
    for(const side of [-1,1]) block(side*2.48,.16,.06,.025,.025,4.1,gold,group);
    block(0,.16,2.15,4.96,.025,.025,gold,group);
    const keel=mesh(new THREE.ConeGeometry(1.7,2.9,5),cutStone,0,-2.05,0,group); keel.rotation.z=Math.PI;
    platform.castShadow=true;
    for(const side of [-1,1]) {
      for(let course=0;course<6;course++) {
        const stoneBlock=block(side*1.94,.7+course*.92,0,.77,.84,1.04,masonry,group);
        stoneBlock.rotation.z=side*.012*Math.sin(course*2.4+index);
        block(side*1.95,.7+course*.92,.56,.36,.65,.032,cutStone,group);
      }
      block(side*1.94,.32,0,1.2,.4,1.48,cutStone,group);
      block(side*1.94,5.8,0,1.05,.16,1.3,gold,group);
      block(side*1.94,2.3,.58,.025,2.3,.025,gold,group);
    }
    for(let segment=0;segment<15;segment++) {
      const angle=segment/14*Math.PI;
      // The top-right gap reads as missing architecture, not a complete logo-like ring.
      if(segment===3+index) continue;
      const wedge=block(Math.cos(angle)*1.96,5.65+Math.sin(angle)*1.96,0,.4,.68,1.04,masonry,group);
      wedge.rotation.z=angle-Math.PI/2;
      if(segment===4+index) { wedge.position.y+=.26; wedge.position.z-=.12; wedge.rotation.z+=.16; suspend(wedge,.045,index+1); }
      const gilding=block(Math.cos(angle)*1.98,5.65+Math.sin(angle)*1.98,.57,.032,.44,.025,gold,group);
      gilding.rotation.z=angle-Math.PI/2;
    }
    // Monsters stay card art: a shallow physical card and worn frame sit inside the gate.
    const vision=new THREE.TextureLoader().load(gameArtUrl('/art/void-labyrinth/'+['sentinel','warden','boss'][index]+'-v2.webp'),texture=>{if(disposed)texture.dispose();else draw(0);});
    vision.colorSpace=THREE.SRGBColorSpace; textures.add(vision);
    const card=new THREE.Group(); card.position.set(0,3.6,-.27); card.scale.setScalar(1.12); card.rotation.y=index===0?.055:index===2?-.055:0; group.add(card);
    block(0,0,0,2.48,3.7,.14,iron,card);
    const portrait=new THREE.MeshStandardMaterial({map:vision,color:0xd3c7ab,emissiveMap:vision,emissive:0x5e4a32,emissiveIntensity:.32,roughness:1});
    const face=mesh(new THREE.PlaneGeometry(2.22,3.34),portrait,0,0,.09,card); face.castShadow=false;
    for(const side of [-1,1]) {
      block(side*1.16,0,.1,.026,3.47,.024,gold,card);
      block(0,side*1.75,.1,2.35,.026,.024,gold,card);
    }
    const rune=new THREE.MeshStandardMaterial({color:0x8c7446,emissive:0xb38b48,emissiveIntensity:.18,metalness:.62,roughness:.48});
    const seal=mesh(new THREE.TorusGeometry(1.72,.022,6,80,Math.PI*1.55),rune,0,3.6,-.52,group); seal.rotation.z=.62+index*.3; seal.castShadow=false;
    // Lanterns are the visible sources for the warm pools on the basalt.
    for(const side of [-1,1]) {
      block(side*1.53,.4,1.26,.28,.6,.28,iron,group);
      mesh(new THREE.CylinderGeometry(.16,.2,.1,8),gold,side*1.53,.75,1.26,group);
      const fire=mesh(new THREE.SphereGeometry(.067,8,6),flame,side*1.53,.91,1.26,group); fire.scale.y=1.9; fire.castShadow=false;
    }
    const candle=new THREE.PointLight(0xf1b975,5,5,2); candle.position.set(-1.35,1.05,1.5); group.add(candle);
    const spot=new THREE.SpotLight(0xe6c391,85,18,.42,.8,2); spot.position.set(.2,8.9,1.1); spot.target.position.set(0,2.1,-.3); group.add(spot,spot.target);
    const lantern=new THREE.Group(); lantern.position.copy(spot.position); group.add(lantern);
    mesh(new THREE.CylinderGeometry(.012,.012,1.1,5),iron,0,.83,0,lantern);
    for(const end of [-1,1]) mesh(new THREE.CylinderGeometry(.18,.18,.045,10),gold,0,end*.26,0,lantern);
    for(let rib=0;rib<4;rib++) {
      const angle=rib*Math.PI/2;
      mesh(new THREE.CylinderGeometry(.016,.016,.5,5),iron,Math.cos(angle)*.15,0,Math.sin(angle)*.15,lantern);
    }
    const lamp=mesh(new THREE.SphereGeometry(.095,10,8),flame,0,0,0,lantern); lamp.scale.y=1.6; lamp.castShadow=false;
    const shaft=new THREE.ShaderMaterial({vertexShader:shaftVertex,fragmentShader:shaftFragment,uniforms:{uColor:{value:new THREE.Color(0xe8cc98)},uStrength:{value:.08},uTime:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const ray=mesh(new THREE.PlaneGeometry(2.6,8.2),shaft,0,4.6,1.1,group); ray.rotation.z=-.045; ray.castShadow=ray.receiveShadow=false;
    portals.push({group,rune,spot,candle,shaft,card,baseCardY:card.position.y});
  }

  // Suspended masonry and a broken armillary crown imply impossible scale and gravity.
  const crown=new THREE.Group(); crown.position.set(4.8,9.3,-12); crown.rotation.set(.22,-.32,.26); scene.add(crown);
  for(let fragment=0;fragment<11;fragment++) {
    const angle=fragment/12*Math.PI*2;
    if(fragment===2||fragment===7)continue;
    const rim=mesh(new THREE.TorusGeometry(4.45,.13,6,9,.33),cutStone,0,0,0,crown); rim.rotation.z=angle;
    const seam=mesh(new THREE.TorusGeometry(4.52,.015,4,9,.3),gold,0,0,.08,crown); seam.rotation.z=angle;
    if(fragment%3===0){rim.position.z=.25;rim.position.y=.15; suspend(rim,.04,fragment);}
  }
  const orbit=mesh(new THREE.TorusGeometry(3.65,.024,5,90,Math.PI*1.64),gold,0,0,0,crown); orbit.rotation.set(.75,.25,-.55);
  // A solid absence anchors the broken crown as a single environmental sculpture.
  const voidSurface=new THREE.MeshBasicMaterial({color:0x05080c}); materials.add(voidSurface);
  const absence=mesh(new THREE.SphereGeometry(2.75,32,20),voidSurface,0,0,-.25,crown);
  absence.castShadow=false;
  const coldEdge=new THREE.MeshStandardMaterial({color:0x7d939f,emissive:0x30434e,emissiveIntensity:.34,roughness:.62,metalness:.4}); materials.add(coldEdge);
  const rim=mesh(new THREE.TorusGeometry(2.84,.024,5,72,Math.PI*1.42),coldEdge,0,0,.02,crown);
  rim.rotation.z=-.58; rim.castShadow=false;
  suspend(crown,.1,2.1);
  for(const side of [-1,1]) {
    for(let pillar=0;pillar<3;pillar++) {
      const x=side*(12.8+pillar*.7),z=3-pillar*7;
      const column=mesh(new THREE.CylinderGeometry(.54,.8,9.2,12),cutStone,x,3.5,z);
      block(x,8.23,z,1.55,.45,1.55,masonry);
      for(const height of [1.1,5.4,7.9]) mesh(new THREE.CylinderGeometry(.62,.62,.035,12),gold,x,height,z);
      if(pillar===1){column.rotation.z=side*.12;suspend(column,.06,pillar);}
    }
    for(let fragment=0;fragment<13;fragment++) {
      const shard=block(side*(6.5+fragment%4*1.6),-1.6-(fragment%5)*.28,4-fragment*1.03,.38+fragment%3*.24,.22,.68,cutStone);
      shard.rotation.set(.35,fragment*1.73,.2); suspend(shard,.04,fragment*.65);
    }
  }
  const route=Array.from({length:10},(_,i)=>{
    const material=new THREE.MeshStandardMaterial({color:0x7e6b43,emissive:0x927340,emissiveIntensity:.12});
    const marker=mesh(new THREE.TorusGeometry(.13,.012,4,16),material,Math.sin(i*.8)*.45,.075+i*.057,10-i*1.09);
    marker.rotation.x=-Math.PI/2; marker.castShadow=false; return material;
  });
  const mistUniforms={uTime:{value:0}};
  const mistMaterial=new THREE.ShaderMaterial({vertexShader:shaftVertex,fragmentShader:mistFragment,uniforms:mistUniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  for(let layer=0;layer<3;layer++) {
    const veil=mesh(new THREE.PlaneGeometry(34,5),mistMaterial,0,-1.3+layer*.35,-4-layer*4.5);
    veil.castShadow=veil.receiveShadow=false; veil.renderOrder=2;
  }
  const dustGeometry=new THREE.BufferGeometry(); geometries.add(dustGeometry);
  const dust=new Float32Array(75*3);
  for(let i=0;i<dust.length;i+=3){dust[i]=Math.sin(i*17.71)*12;dust[i+1]=(i%29)*.24;dust[i+2]=Math.cos(i*2.39)*11;}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dust,3));
  const dustMaterial=new THREE.PointsMaterial({color:0xbfa780,size:.025,transparent:true,opacity:.29,depthWrite:false});materials.add(dustMaterial);
  const motes=new THREE.Points(dustGeometry,dustMaterial);scene.add(motes);

  // Merge static architecture per material/visibility flags. Moving cards, fragments and
  // transparent atmosphere retain independent transforms and sorting.
  scene.updateMatrixWorld(true);
  const animatedRoots = new Set<THREE.Object3D>([...floating.map(item => item.object), ...portals.map(portal => portal.card)]);
  const batches = new Map<THREE.Material, Map<string, THREE.Mesh[]>>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.transparent) return;
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) if (animatedRoots.has(ancestor)) return;
    let flags = batches.get(object.material);
    if (!flags) { flags = new Map(); batches.set(object.material, flags); }
    const key = String(object.castShadow) + ':' + String(object.receiveShadow);
    const items = flags.get(key) ?? []; items.push(object); flags.set(key, items);
  });
  batches.forEach(flags => flags.forEach(items => {
    if (items.length < 3) return;
    const copies = items.map(item => {
      let geometry = item.geometry.clone();
      if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
      geometry.applyMatrix4(item.matrixWorld); return geometry;
    });
    const merged = mergeGeometries(copies, false); copies.forEach(copy => copy.dispose());
    if (!merged) return;
    const combined = mesh(merged, items[0].material as THREE.Material, 0, 0, 0);
    combined.castShadow = items[0].castShadow; combined.receiveShadow = items[0].receiveShadow;
    items.forEach(item => item.removeFromParent());
  }));
  const liveGeometry = new Set<THREE.BufferGeometry>();
  scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) liveGeometry.add(object.geometry); });
  geometries.forEach(geometry => { if (!liveGeometry.has(geometry)) { geometry.dispose(); geometries.delete(geometry); } });
  blockGeometry.clear();

  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible=true,frame=0,last=0,selected=0,node=0,clockTime=0,lastShadow=-1000;
  const pointer=new THREE.Vector2(),target=new THREE.Vector3();
  const lookAt=new THREE.Vector3(0,4.3,-5),lookTarget=new THREE.Vector3();
  function draw(time:number) {
    if(disposed||contextLost)return;
    // Static rendering always uses the authored rest pose, including after toggling reduced motion.
    const seconds=motion.matches?0:time*.001;
    floating.forEach(item=>{item.object.position.y=item.baseY+(motion.matches?0:Math.sin(seconds*.33+item.phase)*item.amplitude);});
    motes.rotation.y=motion.matches?0:seconds*.008;
    mistUniforms.uTime.value=seconds;
    portals.forEach((portal,i)=>{
      const strength=i===selected?1:.28;
      portal.rune.emissiveIntensity=.14+strength*.68+(motion.matches?0:Math.sin(seconds*.8+i)*.035);
      portal.shaft.uniforms.uTime.value=seconds;
      portal.card.position.y=portal.baseCardY+(motion.matches?0:Math.sin(seconds*.4+i)*.045);
      portal.candle.intensity=(i===selected?7:3.8)*(motion.matches?1:1+Math.sin(seconds*2.3+i)*.045);
    });
    const narrow=camera.aspect<.8,focusX=(selected-1)*(narrow?6.8:.5);
    target.set(focusX+(motion.matches?0:pointer.x*.32),6.2+(motion.matches?0:pointer.y*.12),narrow?22.5:24);
    // Time-based easing keeps camera response consistent at different frame rates.
    const delta=Math.min(Math.max((time-clockTime)/1000,0),.1);
    const ease=motion.matches?1:1-Math.exp(-delta*4.2);clockTime=time;
    camera.position.lerp(target,ease);
    lookTarget.set((selected-1)*(narrow?6.8:.5),4.3,-5);lookAt.lerp(lookTarget,ease);camera.lookAt(lookAt);
    if (time-lastShadow > 250 || motion.matches) { renderer.shadowMap.needsUpdate = true; lastShadow=time; }
    renderer.render(scene,camera);
  }
  function animate(time:number) {
    if(disposed||contextLost||!visible||document.hidden||motion.matches){frame=0;return;}
    frame=requestAnimationFrame(animate);if(time-last<33)return;last=time;draw(time);
  }
  function resume() {
    if(disposed||contextLost)return;
    if(visible&&!document.hidden){draw(performance.now());if(!motion.matches&&!frame)frame=requestAnimationFrame(animate);}
    else{cancelAnimationFrame(frame);frame=0;}
  }
  function resize(){const{width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();resume();}
  function move(event:PointerEvent){const bounds=host.getBoundingClientRect();pointer.set(THREE.MathUtils.clamp((event.clientX-bounds.left)/bounds.width*2-1,-1,1),THREE.MathUtils.clamp((event.clientY-bounds.top)/bounds.height*2-1,-1,1));}
  function resetPointer(){pointer.set(0,0);}
  function lost(event:Event){event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;visible=false;onContextLost();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;resume();});intersection.observe(host);
  const surface=host.parentElement?.parentElement??host;
  surface.addEventListener('pointermove',move);surface.addEventListener('pointerleave',resetPointer);
  document.addEventListener('visibilitychange',resume);motion.addEventListener('change',resume);
  renderer.domElement.addEventListener('webglcontextlost',lost);
  resize();
  return{
    select(tier,nextNode){
      selected=['threshold','reflection','heart'].indexOf(tier);node=nextNode;
      portals.forEach((portal,i)=>{portal.spot.intensity=i===selected?320:65;portal.shaft.uniforms.uStrength.value=i===selected?.18:.055;});
      route.forEach((rune,i)=>{rune.emissiveIntensity=i+1===node?1.5:i<node?.5:.1;});
      resume();
    },
    dispose(){
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();
      surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerleave',resetPointer);
      document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',resume);
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());
      moon.shadow.dispose();
      renderer.dispose();renderer.domElement.remove();
    },
  };
}
