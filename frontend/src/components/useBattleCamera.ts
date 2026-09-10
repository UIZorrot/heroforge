import { useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { gsap } from 'gsap';
import { battleCameraTarget } from '../lib/battleSceneDepth';

export function useBattleCamera(stageRef: RefObject<HTMLElement | null>, reducedMotion: boolean) {
  const camera = useRef({ x: 0, y: 0 });
  const [locked, setLocked] = useState(false);
  const apply = () => {
    stageRef.current?.style.setProperty('--view-x', String(camera.current.x));
    stageRef.current?.style.setProperty('--view-y', String(camera.current.y));
  };
  useLayoutEffect(() => {
    const pose = camera.current;
    gsap.killTweensOf(pose);
    if (reducedMotion) {
      pose.x = pose.y = 0;
      stageRef.current?.style.setProperty('--view-x', '0');
      stageRef.current?.style.setProperty('--view-y', '0');
    }
    return () => { gsap.killTweensOf(pose); };
  }, [reducedMotion, stageRef]);
  const move = (x: number, y: number) => {
    if (locked || reducedMotion) return;
    gsap.to(camera.current, { ...battleCameraTarget(x, y), duration: .65, ease: 'power2.out', overwrite: true, onUpdate: apply });
  };
  return {
    locked,
    toggle: () => { gsap.killTweensOf(camera.current); setLocked(value => !value); },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' || event.buttons || !window.matchMedia('(hover: hover) and (min-width: 761px)').matches) return;
      const rect = event.currentTarget.getBoundingClientRect();
      move((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
    },
    onPointerLeave: () => move(0, 0),
  };
}
