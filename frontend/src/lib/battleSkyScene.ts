import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';

export function createSkyCamera(width: number, height: number) {
  const camera = new PerspectiveCamera(42, width / Math.max(1, height), .1, 160);
  camera.position.set(0, 18, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
/** DOM slot coordinates are raycast onto the 3D ground, never treated as world units. */
export function screenToSkyGround(camera: PerspectiveCamera, x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
  return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
}
