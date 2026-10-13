import { useEffect, useRef } from 'react';
import {
  AdditiveBlending, AmbientLight, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial,
  SphereGeometry, TorusGeometry, TubeGeometry, CurvePath, LineCurve3, Vector3, WebGLRenderer,
  type Material, type PerspectiveCamera,
} from 'three';
import type { BattleEvent } from '../lib/battleTypes';
import { skyTargetPhase, skyTargetTiming, skyVfxProfile } from '../lib/battleSkyVfx';
import { createSkyCamera, screenToSkyGround } from '../lib/battleSkyScene';

type TargetEffect = {
  event: BattleEvent; index: number; root: Group; body: Group; warning: Mesh<PlaneGeometry, ShaderMaterial>;
  shadow: Mesh<PlaneGeometry, ShaderMaterial>; burst: Mesh<SphereGeometry, ShaderMaterial>; rings: Array<Mesh<TorusGeometry, MeshBasicMaterial>>;
  debris: Mesh<IcosahedronGeometry, MeshStandardMaterial>[]; sparks: Points<BufferGeometry, PointsMaterial>;
  profile: ReturnType<typeof skyVfxProfile>; radius: number; impacted: boolean;
};

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(.25, 'rgba(255,255,255,.8)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 32, 32);
  return new CanvasTexture(canvas);
}
function planeMaterial(color: number, shadow = false) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: DoubleSide,
    ...(shadow ? {} : { blending: AdditiveBlending }),
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: shadow
      ? 'varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; void main(){float r=length(vUv-.5)*2.;gl_FragColor=vec4(uColor,(1.-smoothstep(.1,1.,r))*uOpacity);}'
      : 'varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; uniform float uTime; void main(){vec2 p=vUv-.5;float r=length(p)*2.;float a=atan(p.y,p.x);float ring=1.-smoothstep(.015,.05,abs(r-.72));float inner=(1.-smoothstep(.01,.035,abs(r-.5)))*.5;float ticks=step(.9,cos(a*12.+uTime))*step(.6,r)*step(r,.86);float haze=(1.-smoothstep(.1,.9,r))*.09;gl_FragColor=vec4(uColor,(ring+inner+ticks*.6+haze)*uOpacity);}',
  });
}
function meteorMaterial(core: number) {
  return new ShaderMaterial({
    uniforms: { uCore: { value: new Color(core) } },
    vertexShader: 'varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vNormal;varying vec3 vPosition;uniform vec3 uCore;
      void main(){float light=.2+.8*max(0.,dot(normalize(vNormal),normalize(vec3(-.6,.8,.5))));
        float seam=1.-smoothstep(.025,.12,abs(sin(vPosition.x*9.+sin(vPosition.y*11.)+vPosition.z*7.)));
        float grain=.8+fract(sin(dot(floor(vPosition*24.),vec3(12.4,4.1,8.7)))*4137.2)*.2;
        vec3 rock=vec3(.11,.075,.045)*light*grain;
        gl_FragColor=vec4(rock+uCore*pow(seam,2.)*.85,1.);}`,
  });
}
function flameMaterial(core: number, hot: number, opacity: number) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity }, uCore: { value: new Color(core) }, uHot: { value: new Color(hot) } },
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    vertexShader: 'varying vec2 vUv; varying vec3 vPosition; void main(){vUv=uv;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 vUv; varying vec3 vPosition;
      uniform float uTime; uniform float uOpacity; uniform vec3 uCore; uniform vec3 uHot;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){float heat=pow(vUv.y,.7);vec3 p=vec3(vUv.x*8.,vUv.y*6.-uTime*4.,vPosition.z*2.);
        float n=noise(p)*.6+noise(p*2.03)*.3+noise(p*4.01)*.1;
        float flame=smoothstep(.28,.72,n+heat*.23)*heat;
        float alpha=flame*uOpacity; if(alpha<.008) discard;
        gl_FragColor=vec4(mix(uCore,uHot,pow(heat,3.)*.65),alpha);}
    `,
  });
}
function mesh<G extends BufferGeometry, M extends Material>(geometry: G, material: M, parent: Group) {
  const object = new Mesh(geometry, material); parent.add(object); return object;
}
function buildTarget(event: BattleEvent, index: number, texture: CanvasTexture): TargetEffect {
  const profile = skyVfxProfile(event), root = new Group(), body = new Group(); root.add(body);
  const radius = profile.critical ? 1.05 : .82;
  const lit = new MeshStandardMaterial({ color: profile.core, emissive: profile.core, emissiveIntensity: .7, roughness: .42, metalness: .25 });
  const luminous = () => new MeshBasicMaterial({ color: profile.hot, transparent: true, opacity: .7, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  if (profile.kind === 'meteor') {
    lit.color.set(0x352519); lit.emissiveIntensity = .38; lit.roughness = .92;
    mesh(new IcosahedronGeometry(radius * .5, 1), meteorMaterial(profile.core), body);
    const mantle = mesh(new IcosahedronGeometry(radius * .5, 0), luminous(), body); mantle.material.opacity = .035;
    const flame = mesh(new ConeGeometry(radius * .5, 3.2, 14, 1, true), flameMaterial(profile.core, 0xffb95c, .65), body);
    flame.rotation.z = Math.PI; flame.position.y = 1.65;
    const outer = mesh(new ConeGeometry(radius * .7, 3.9, 14, 1, true), flameMaterial(0xc34013, profile.core, .38), body);
    outer.rotation.z = Math.PI; outer.position.y = 2;
  } else if (profile.kind === 'ice') {
    lit.transparent = true; lit.opacity = .86; lit.emissiveIntensity = .02; lit.metalness = .12; lit.roughness = .16; lit.flatShading = true; lit.color.set(0xa8dcea);
    const ice = mesh(new ConeGeometry(radius * .42, 2.4, 5), lit, body); ice.rotation.z = Math.PI;
    for (let i = 0; i < 3; i++) {
      const shard = mesh(new OctahedronGeometry(radius * .18), lit, body);
      shard.position.set(Math.cos(i * 2.1) * radius * .7, .8 + i * .3, Math.sin(i * 2.1) * radius * .7); shard.scale.y = 2.6;
    }
  } else if (profile.kind === 'storm') {
    const points = Array.from({ length: 14 }, (_, i) => new Vector3(i === 13 ? 0 : Math.sin(i * 7 + index) * .32, 11 * (1 - i / 13), i === 13 ? 0 : Math.cos(i * 5) * .18));
    const curve = new CurvePath<Vector3>();
    points.slice(1).forEach((point, i) => curve.add(new LineCurve3(points[i], point)));
    mesh(new TubeGeometry(curve, 52, .02, 5, false), new MeshBasicMaterial({ color: profile.hot }), body);
    const halo = mesh(new TubeGeometry(curve, 52, .065, 5, false), luminous(), body); halo.material.opacity = .22;
  } else if (profile.kind === 'light') {
    const beam = mesh(new CylinderGeometry(.18, radius * .46, 1, 16, 1, true), luminous(), body);
    beam.position.y = .5; beam.material.opacity = .38;
    const core = mesh(new CylinderGeometry(.04, .11, 1, 8, 1, true), luminous(), body); core.position.y = .5;
    const halo = mesh(new CylinderGeometry(.38, radius * .8, 1, 16, 1, true), luminous(), body);
    halo.position.y = .5; halo.material.opacity = .12;
  } else if (profile.kind === 'rain') {
    for (let i = 0; i < 5; i++) {
      const arrow = new Group(); body.add(arrow); arrow.position.set(Math.cos(i * 2.4) * radius * .55, i * .24, Math.sin(i * 2.4) * radius * .55);
      mesh(new CylinderGeometry(.018, .018, 1.8, 5), lit, arrow);
      const tip = mesh(new ConeGeometry(.08, .3, 4), lit, arrow); tip.rotation.z = Math.PI; tip.position.y = -1;
    }
  } else {
    mesh(new OctahedronGeometry(radius * .4), lit, body).scale.y = 2;
    const halo = mesh(new TorusGeometry(radius * .6, .025, 5, 24), luminous(), body); halo.rotation.x = Math.PI / 3;
    const tail = mesh(new ConeGeometry(radius * .24, 3.4, 6, 1, true), luminous(), body); tail.rotation.z = Math.PI; tail.position.y = 1.8; tail.material.opacity = .24;
  }
  body.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshBasicMaterial) object.material.userData.baseOpacity = object.material.opacity; });
  const warning = mesh(new PlaneGeometry(radius * 3.4, radius * 3.4), planeMaterial(profile.core), root);
  warning.rotation.x = -Math.PI / 2; warning.position.y = .025;
  const shadow = mesh(new PlaneGeometry(radius * 3.2, radius * 3.2), planeMaterial(0x000000, true), root);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015;
  const burst = mesh(new SphereGeometry(radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flameMaterial(profile.core, profile.hot, .38), root);
  burst.position.y = .04;
  const rings = [0, 1].map(() => {
    const ring = mesh(new TorusGeometry(radius * .6, .035, 5, 36), luminous(), root);
    ring.rotation.x = -Math.PI / 2; ring.position.y = .045; return ring;
  });
  const debrisGeometry = new IcosahedronGeometry(radius * .13, 0);
  const debris = Array.from({ length: 7 }, () => mesh(debrisGeometry, lit, root));
  const sparks = new Points(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(36 * 3), 3)),
    new PointsMaterial({ color: profile.hot, map: texture, size: .18, transparent: true, depthWrite: false, blending: AdditiveBlending })); root.add(sparks);
  return { event, index, root, body, warning, shadow, burst, rings, debris, sparks, profile, radius, impacted: false };
}
function locateTarget(host: HTMLElement, camera: PerspectiveCamera, event: BattleEvent) {
  const stage = host.closest('.battle-stage');
  const slot = [...stage?.querySelectorAll<HTMLElement>('[data-battle-unit-tag]') ?? []].find(node => node.dataset.battleUnitTag === event.defender);
  if (!slot) return null;
  const box = slot.getBoundingClientRect(), bounds = host.getBoundingClientRect();
  const point = screenToSkyGround(camera, box.left + box.width * .5 - bounds.left, box.top + box.height * .42 - bounds.top, bounds.width, bounds.height);
  const edge = screenToSkyGround(camera, box.left + box.width * .86 - bounds.left, box.top + box.height * .42 - bounds.top, bounds.width, bounds.height);
  return point && edge ? { point, scale: Math.max(.4, Math.min(2, point.distanceTo(edge))) } : null;
}
function animateTarget(target: TargetEffect, elapsed: number) {
  const { descent, recovery, impacted } = skyTargetPhase(elapsed, target.index);
  const flying = elapsed >= skyTargetTiming(target.index).startMs && !impacted;
  target.body.visible = flying || (target.profile.kind === 'light' || target.profile.kind === 'storm') && recovery < .8 && impacted;
  const height = 11 / target.root.scale.x;
  if (target.profile.kind === 'light' || target.profile.kind === 'storm') {
    const length = Math.max(.001, descent * height);
    target.body.scale.y = target.profile.kind === 'light' ? length : length / 11;
    target.body.position.y = height - length;
    target.body.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshBasicMaterial && object.material.transparent) object.material.opacity = Number(object.material.userData.baseOpacity) * (1 - recovery); });
  } else {
    const fall = descent * descent;
    target.body.position.set((1 - fall) * .65, height * (1 - fall) + .3, (1 - fall) * .3);
    target.body.rotation.y = elapsed / 480;
  }
  target.body.traverse(object => { if (object instanceof Mesh && object.material instanceof ShaderMaterial && object.material.uniforms.uTime) object.material.uniforms.uTime.value = elapsed / 1000; });
  target.burst.visible = impacted;
  target.burst.scale.setScalar(.35 + recovery * 1.8);
  target.burst.material.uniforms.uTime.value = elapsed / 1000;
  target.burst.material.uniforms.uOpacity.value = Math.pow(1 - recovery, 2) * .45;
  target.warning.material.uniforms.uTime.value = elapsed / 450;
  target.warning.material.uniforms.uOpacity.value = impacted ? (1 - recovery) * .4 : .35 + Math.sin(elapsed / 80) * .1;
  target.shadow.material.uniforms.uOpacity.value = impacted ? 0 : descent * .36;
  target.shadow.scale.setScalar(.5 + descent * .5);
  for (const [index, ring] of target.rings.entries()) {
    ring.visible = impacted; ring.scale.setScalar(.25 + recovery * (index ? 3.1 : 2.5)); ring.material.opacity = (1 - recovery) * .75;
  }
  for (const [index, piece] of target.debris.entries()) {
    piece.visible = impacted;
    const angle = index * 2.4 + target.index;
    const reach = target.radius * recovery * (target.profile.support ? .8 : 2.2);
    piece.position.set(Math.cos(angle) * reach, Math.sin(recovery * Math.PI) * (.5 + index % 3 * .2), Math.sin(angle) * reach);
    piece.rotation.set(recovery * 8, index + recovery * 5, recovery * 6); piece.scale.setScalar((1 - recovery) * .9);
  }
  target.sparks.visible = impacted; target.sparks.material.opacity = (1 - recovery) * .85;
  const positions = target.sparks.geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const angle = index * 2.39996, speed = .6 + index % 7 * .17, reach = recovery * speed * target.radius * 2;
    positions.setXYZ(index, Math.cos(angle) * reach, Math.max(0, (target.profile.support ? recovery * 2 : Math.sin(recovery * Math.PI)) * speed), Math.sin(angle) * reach);
  }
  positions.needsUpdate = true;
}
function disposeScene(scene: Scene, texture?: CanvasTexture) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  scene.traverse(object => { if (object instanceof Mesh || object instanceof Points) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); } });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); texture?.dispose(); scene.clear();
}

/** A perspective 3D scene: lit meshes, world-space height, depth-tested impacts. */
export default function BattleSkyVfxLayer({ events, onImpact, onUnavailable }: {
  events: BattleEvent[]; onImpact: (event: BattleEvent) => void; onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !events.length) return;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch { onUnavailable(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0); host.appendChild(renderer.domElement);
    const scene = new Scene(), camera = createSkyCamera(host.clientWidth, host.clientHeight);
    let texture: CanvasTexture | undefined;
    const targets: TargetEffect[] = [];
    try {
      texture = glowTexture();
      events.forEach((event, index) => { const target = buildTarget(event, index, texture!); targets.push(target); scene.add(target.root); });
    } catch {
      disposeScene(scene, texture); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); onUnavailable(); return;
    }
    scene.add(new AmbientLight(0xf2e3d0, .6));
    const keyLight = new DirectionalLight(0xffefd3, 3); keyLight.position.set(-4, 12, 8); scene.add(keyLight);
    let frame = 0, lastTime: number | null = null, elapsed = 0, visible = true, disposed = false;
    const endMs = Math.max(...targets.map(target => skyTargetTiming(target.index).endMs));
    function resize() {
      const width = host!.clientWidth, height = host!.clientHeight;
      renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    }
    function tick(now: number) {
      if (disposed || !visible || document.hidden) { lastTime = null; return; }
      if (lastTime !== null) elapsed += Math.min(64, now - lastTime); lastTime = now;
      try {
        for (const target of targets) {
          const anchor = locateTarget(host!, camera, target.event);
          target.root.visible = Boolean(anchor);
          if (anchor) { target.root.position.copy(anchor.point); target.root.scale.setScalar(anchor.scale); animateTarget(target, elapsed); }
          if (!target.impacted && skyTargetPhase(elapsed, target.index).impacted) { target.impacted = true; onImpact(target.event); }
        }
        renderer.render(scene, camera);
        if (elapsed < endMs) frame = requestAnimationFrame(tick);
        else renderer.clear();
      } catch { onUnavailable(); }
    }
    function resume() {
      cancelAnimationFrame(frame); lastTime = null;
      if (visible && !document.hidden && elapsed < endMs) frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; resume(); }); observer.observe(host);
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    const onLost = (event: Event) => { event.preventDefault(); onUnavailable(); };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    document.addEventListener('visibilitychange', resume);
    resize(); frame = requestAnimationFrame(tick);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect(); document.removeEventListener('visibilitychange', resume);
      renderer.domElement.removeEventListener('webglcontextlost', onLost); disposeScene(scene, texture); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [events, onImpact, onUnavailable]);
  return <div ref={hostRef} className="battle-sky-vfx pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" data-vfx-renderer="three" />;
}
