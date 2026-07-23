import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { terrainHeight } from '../math';

interface BrickFragment {
  root: Group;
  velocity: Vector3;
  angularVelocity: Vector3;
  life: number;
}

export class BrickBurstSystem {
  private readonly scene: Scene;
  private readonly fragments: BrickFragment[] = [];
  private readonly materialCache = new Map<number, MeshStandardMaterial>();
  private readonly studGeometry = new CylinderGeometry(0.16, 0.16, 0.1, 10);
  private readonly scratchBox = new Box3();
  private readonly scratchSize = new Vector3();
  private readonly scratchCenter = new Vector3();
  private readonly maxFragments = 140;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  burstObject(source: Object3D, colors: number[], force = 11): void {
    source.updateMatrixWorld(true);
    const candidates: Mesh[] = [];
    source.traverse((object) => {
      if (object instanceof Mesh && object.visible) {
        candidates.push(object);
      }
    });
    const step = Math.max(1, Math.ceil(candidates.length / 44));
    const origin = new Vector3();
    source.getWorldPosition(origin);
    for (let index = 0; index < candidates.length; index += step) {
      const mesh = candidates[index];
      this.scratchBox.setFromObject(mesh);
      this.scratchBox.getSize(this.scratchSize);
      this.scratchBox.getCenter(this.scratchCenter);
      if (this.scratchSize.lengthSq() < 0.025) {
        continue;
      }
      const size = new Vector3(
        MathUtils.clamp(this.scratchSize.x, 0.24, 2.8),
        MathUtils.clamp(this.scratchSize.y, 0.18, 1.6),
        MathUtils.clamp(this.scratchSize.z, 0.24, 2.8),
      );
      const outward = this.scratchCenter.clone().sub(origin).normalize();
      if (outward.lengthSq() < 0.01) {
        outward.set(Math.random() - 0.5, 0.4, Math.random() - 0.5).normalize();
      }
      const velocity = outward
        .multiplyScalar(force * (0.55 + Math.random() * 0.65))
        .add(new Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 8, (Math.random() - 0.5) * 5));
      this.createFragment(
        this.scratchCenter,
        size,
        colors[index % colors.length],
        velocity,
        3.5 + Math.random() * 2.5,
      );
    }
    this.trim();
  }

  burstAt(position: Vector3, colors: number[], count: number, force = 9): void {
    for (let index = 0; index < count; index += 1) {
      const size = new Vector3(
        0.3 + Math.random() * 1.15,
        0.22 + Math.random() * 0.65,
        0.35 + Math.random() * 1.25,
      );
      const direction = new Vector3(Math.random() - 0.5, 0.35 + Math.random(), Math.random() - 0.5).normalize();
      const spawn = position.clone().add(new Vector3(
        (Math.random() - 0.5) * 2.5,
        Math.random() * 2,
        (Math.random() - 0.5) * 2.5,
      ));
      this.createFragment(
        spawn,
        size,
        colors[index % colors.length],
        direction.multiplyScalar(force * (0.45 + Math.random() * 0.8)),
        3 + Math.random() * 2,
      );
    }
    this.trim();
  }

  update(delta: number): void {
    for (let index = this.fragments.length - 1; index >= 0; index -= 1) {
      const fragment = this.fragments[index];
      fragment.life -= delta;
      fragment.velocity.y -= 18 * delta;
      fragment.root.position.addScaledVector(fragment.velocity, delta);
      fragment.root.rotation.x += fragment.angularVelocity.x * delta;
      fragment.root.rotation.y += fragment.angularVelocity.y * delta;
      fragment.root.rotation.z += fragment.angularVelocity.z * delta;
      const ground = terrainHeight(fragment.root.position.x, fragment.root.position.z) + 0.12;
      if (fragment.root.position.y < ground) {
        fragment.root.position.y = ground;
        fragment.velocity.y *= -0.22;
        fragment.velocity.x *= 0.72;
        fragment.velocity.z *= 0.72;
        fragment.angularVelocity.multiplyScalar(0.78);
      }
      if (fragment.life <= 0) {
        this.removeFragment(index);
      }
    }
  }

  private createFragment(
    position: Vector3,
    size: Vector3,
    color: number,
    velocity: Vector3,
    life: number,
  ): void {
    const root = new Group();
    root.position.copy(position);
    root.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    const body = new Mesh(
      new BoxGeometry(size.x, size.y, size.z),
      this.getMaterial(color),
    );
    body.castShadow = false;
    body.receiveShadow = false;
    body.userData.disposableGeometry = true;
    root.add(body);

    if (size.x > 0.38 && size.z > 0.38) {
      const stud = new Mesh(this.studGeometry, this.getMaterial(color));
      stud.position.y = size.y / 2 + 0.05;
      stud.castShadow = false;
      root.add(stud);
      if (size.x > 1.15) {
        const secondStud = stud.clone();
        stud.position.x = -size.x * 0.22;
        secondStud.position.x = size.x * 0.22;
        root.add(secondStud);
      }
    }
    this.scene.add(root);
    this.fragments.push({
      root,
      velocity,
      angularVelocity: new Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      ),
      life,
    });
  }

  private getMaterial(color: number): MeshStandardMaterial {
    let material = this.materialCache.get(color);
    if (!material) {
      material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.08,
        roughness: 0.72,
        metalness: 0.12,
      });
      this.materialCache.set(color, material);
    }
    return material;
  }

  private trim(): void {
    while (this.fragments.length > this.maxFragments) {
      this.removeFragment(0);
    }
  }

  private removeFragment(index: number): void {
    const fragment = this.fragments[index];
    this.scene.remove(fragment.root);
    fragment.root.traverse((object) => {
      if (object instanceof Mesh && object.userData.disposableGeometry) {
        object.geometry.dispose();
      }
    });
    this.fragments.splice(index, 1);
  }
}
