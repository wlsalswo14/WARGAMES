import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { FACTIONS } from '../config';
import type { FactionId, UnitKind } from '../types';

const darkMaterial = new MeshStandardMaterial({ color: 0x14202a, roughness: 0.58, metalness: 0.32 });
const metalMaterial = new MeshStandardMaterial({ color: 0x34414a, roughness: 0.3, metalness: 0.72 });
const commandGoldMaterial = new MeshStandardMaterial({
  color: 0xffcf4a,
  emissive: 0x6e4300,
  emissiveIntensity: 0.18,
  roughness: 0.34,
  metalness: 0.58,
});
const glassMaterial = new MeshStandardMaterial({
  color: 0x6dc8ec,
  emissive: 0x17465a,
  emissiveIntensity: 0.12,
  roughness: 0.12,
  metalness: 0.18,
  transparent: true,
  opacity: 0.72,
});

function factionMaterial(faction: FactionId, shade = 1): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: FACTIONS[faction].color,
    emissive: FACTIONS[faction].color,
    emissiveIntensity: 0.07,
    roughness: 0.4,
    metalness: 0.1,
  });
  material.color.multiplyScalar(shade);
  return material;
}

function addStuds(group: Group, width: number, depth: number, y: number, material: MeshStandardMaterial): void {
  const columns = Math.max(1, Math.round(width / 0.72));
  const rows = Math.max(1, Math.round(depth / 0.72));
  const studGeometry = new CylinderGeometry(0.16, 0.16, 0.1, 10);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const stud = new Mesh(studGeometry, material);
      stud.position.set(
        (column - (columns - 1) / 2) * 0.72,
        y,
        (row - (rows - 1) / 2) * 0.72,
      );
      stud.castShadow = true;
      group.add(stud);
    }
  }
}

function brick(
  width: number,
  height: number,
  depth: number,
  material: MeshStandardMaterial,
  studs = true,
): Group {
  const group = new Group();
  const body = new Mesh(new BoxGeometry(width, height, depth), material);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  if (studs) {
    addStuds(group, width, depth, height + 0.05, material);
  }
  return group;
}

function createInfantry(faction: FactionId): Group {
  const root = new Group();
  const uniform = factionMaterial(faction);
  const legs = new Group();
  for (const x of [-0.25, 0.25]) {
    const leg = brick(0.32, 0.75, 0.4, darkMaterial, false);
    leg.position.x = x;
    legs.add(leg);
  }
  root.add(legs);

  const torso = brick(1.05, 1.1, 0.62, uniform);
  torso.position.y = 0.72;
  root.add(torso);

  const head = new Mesh(new CylinderGeometry(0.38, 0.38, 0.48, 12), new MeshStandardMaterial({ color: 0xe6b578 }));
  head.position.y = 2.12;
  head.castShadow = true;
  root.add(head);

  const helmet = new Mesh(new SphereGeometry(0.46, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), uniform);
  helmet.name = 'infantry-helmet';
  helmet.position.y = 2.37;
  helmet.castShadow = true;
  root.add(helmet);

  const gun = new Group();
  const receiver = new Mesh(new BoxGeometry(0.18, 0.18, 1.25), metalMaterial);
  receiver.position.z = 0.45;
  gun.add(receiver);
  const barrel = new Mesh(new CylinderGeometry(0.045, 0.045, 0.72, 8), darkMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 1.25;
  gun.add(barrel);
  gun.position.set(0.55, 1.55, 0.05);
  gun.rotation.x = -0.1;
  root.add(gun);

  root.userData.muzzleNode = barrel;
  root.userData.aimNode = root;
  root.scale.setScalar(1.15);
  return root;
}

function createGeneral(faction: FactionId): Group {
  const root = createInfantry(faction);
  const infantryHelmet = root.getObjectByName('infantry-helmet');
  if (infantryHelmet) {
    root.remove(infantryHelmet);
  }
  const commandUniform = factionMaterial(faction, 0.78);
  const coat = new Mesh(
    new BoxGeometry(1.18, 0.9, 0.16),
    commandUniform,
  );
  coat.position.set(0, 1.3, 0.38);
  coat.castShadow = true;
  root.add(coat);

  for (const x of [-0.48, 0.48]) {
    const epaulette = new Mesh(
      new BoxGeometry(0.28, 0.12, 0.55),
      commandGoldMaterial,
    );
    epaulette.position.set(x, 1.82, 0);
    epaulette.castShadow = true;
    root.add(epaulette);
  }
  const medal = new Mesh(
    new BoxGeometry(0.34, 0.22, 0.08),
    commandGoldMaterial,
  );
  medal.position.set(0.28, 1.48, 0.49);
  root.add(medal);

  const cap = new Mesh(
    new CylinderGeometry(0.48, 0.54, 0.24, 12),
    commandUniform,
  );
  cap.position.y = 2.57;
  cap.castShadow = true;
  root.add(cap);
  const capBand = new Mesh(
    new CylinderGeometry(0.5, 0.5, 0.1, 12),
    commandGoldMaterial,
  );
  capBand.position.y = 2.5;
  root.add(capBand);
  const brim = new Mesh(
    new BoxGeometry(0.7, 0.08, 0.34),
    darkMaterial,
  );
  brim.position.set(0, 2.46, 0.3);
  root.add(brim);

  const flagPole = new Mesh(
    new CylinderGeometry(0.045, 0.045, 2.6, 8),
    metalMaterial,
  );
  flagPole.position.set(-0.72, 2.18, -0.18);
  root.add(flagPole);
  const flag = new Mesh(
    new BoxGeometry(0.86, 0.54, 0.08),
    factionMaterial(faction),
  );
  flag.position.set(-0.3, 3.08, -0.18);
  flag.castShadow = true;
  root.add(flag);
  return root;
}

function createTank(faction: FactionId): Group {
  const root = new Group();
  const armor = factionMaterial(faction);
  const armorDark = factionMaterial(faction, 0.7);
  const chassis = brick(3.8, 0.85, 5.4, armorDark);
  chassis.position.y = 0.55;
  root.add(chassis);

  for (const x of [-2.02, 2.02]) {
    const track = new Mesh(new BoxGeometry(0.7, 0.75, 5.8), darkMaterial);
    track.position.set(x, 0.76, 0);
    track.castShadow = true;
    root.add(track);
    for (let index = 0; index < 5; index += 1) {
      const wheel = new Mesh(new CylinderGeometry(0.35, 0.35, 0.18, 12), metalMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + Math.sign(x) * 0.38, 0.68, -2 + index);
      wheel.castShadow = true;
      root.add(wheel);
    }
  }

  const upper = brick(3.1, 0.72, 3.15, armor);
  upper.position.set(0, 1.35, -0.2);
  root.add(upper);

  const turret = new Group();
  const turretBody = brick(2.5, 0.8, 2.45, armor);
  turret.add(turretBody);
  const barrel = new Mesh(new CylinderGeometry(0.13, 0.17, 5.1, 12), metalMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.48, 3.5);
  barrel.castShadow = true;
  turret.add(barrel);
  turret.position.set(0, 2.15, 0.15);
  root.add(turret);

  root.userData.muzzleNode = barrel;
  root.userData.aimNode = turret;
  root.userData.turret = turret;
  root.scale.setScalar(0.86);
  return root;
}

function createFighter(faction: FactionId): Group {
  const root = new Group();
  const armor = factionMaterial(faction);
  const fuselage = new Mesh(new CapsuleGeometry(0.5, 4.6, 6, 12), armor);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  root.add(fuselage);

  const nose = new Mesh(new ConeGeometry(0.52, 1.7, 12), armor);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3.85;
  root.add(nose);

  const wing = new Mesh(new BoxGeometry(7.8, 0.18, 2.5), armor);
  wing.position.z = -0.3;
  wing.castShadow = true;
  root.add(wing);

  const tailWing = new Mesh(new BoxGeometry(3.1, 0.15, 1.2), armor);
  tailWing.position.z = -2.5;
  root.add(tailWing);

  const tail = new Mesh(new BoxGeometry(0.18, 1.65, 1.35), armor);
  tail.position.set(0, 0.8, -2.65);
  root.add(tail);

  const cockpit = new Mesh(new SphereGeometry(0.55, 12, 8), glassMaterial);
  cockpit.scale.set(0.72, 0.5, 1.3);
  cockpit.position.set(0, 0.44, 1.2);
  root.add(cockpit);

  const muzzle = new Group();
  muzzle.position.set(0, -0.1, 3.5);
  root.add(muzzle);
  root.userData.muzzleNode = muzzle;
  root.userData.aimNode = root;
  root.scale.setScalar(1.15);
  return root;
}

function createHelicopter(faction: FactionId): Group {
  const root = new Group();
  const armor = factionMaterial(faction);
  const body = new Mesh(new CapsuleGeometry(1, 2.6, 5, 12), armor);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  root.add(body);

  const canopy = new Mesh(new SphereGeometry(1.02, 12, 8), glassMaterial);
  canopy.scale.set(0.85, 0.7, 1.1);
  canopy.position.set(0, 0.25, 1.3);
  root.add(canopy);

  const boom = new Mesh(new BoxGeometry(0.42, 0.45, 5.2), armor);
  boom.position.set(0, 0.15, -3.3);
  root.add(boom);

  const rotor = new Group();
  const rotorBlade = new Mesh(new BoxGeometry(9.5, 0.08, 0.24), darkMaterial);
  const rotorBladeCross = rotorBlade.clone();
  rotorBladeCross.rotation.y = Math.PI / 2;
  rotor.add(rotorBlade, rotorBladeCross);
  rotor.position.y = 1.45;
  root.add(rotor);

  const tailRotor = new Group();
  const tailBlade = new Mesh(new BoxGeometry(0.08, 2.2, 0.18), darkMaterial);
  const tailBladeCross = tailBlade.clone();
  tailBladeCross.rotation.z = Math.PI / 2;
  tailRotor.add(tailBlade, tailBladeCross);
  tailRotor.position.set(0.35, 0.25, -5.8);
  root.add(tailRotor);

  const muzzle = new Group();
  muzzle.position.set(0, -0.72, 1.5);
  root.add(muzzle);
  root.userData.muzzleNode = muzzle;
  root.userData.aimNode = root;
  root.userData.rotor = rotor;
  root.userData.tailRotor = tailRotor;
  root.scale.setScalar(0.88);
  return root;
}

function createDrone(faction: FactionId): Group {
  const root = new Group();
  const armor = factionMaterial(faction);
  const body = brick(1.7, 0.45, 1.35, armor);
  body.position.y = -0.2;
  root.add(body);

  const armGeometry = new BoxGeometry(3.8, 0.12, 0.18);
  const armA = new Mesh(armGeometry, darkMaterial);
  armA.rotation.y = Math.PI / 4;
  const armB = armA.clone();
  armB.rotation.y = -Math.PI / 4;
  root.add(armA, armB);

  const rotors: Group[] = [];
  for (const x of [-1.35, 1.35]) {
    for (const z of [-1.35, 1.35]) {
      const rotor = new Group();
      const blade = new Mesh(new BoxGeometry(1.3, 0.04, 0.12), darkMaterial);
      const cross = blade.clone();
      cross.rotation.y = Math.PI / 2;
      rotor.add(blade, cross);
      rotor.position.set(x, 0.15, z);
      root.add(rotor);
      rotors.push(rotor);
    }
  }

  const camera = new Mesh(new SphereGeometry(0.28, 10, 8), glassMaterial);
  camera.position.set(0, -0.55, 0.42);
  root.add(camera);

  const muzzle = new Group();
  muzzle.position.set(0, -0.55, 0.9);
  root.add(muzzle);
  root.userData.muzzleNode = muzzle;
  root.userData.aimNode = root;
  root.userData.rotors = rotors;
  return root;
}

export function createUnitModel(kind: UnitKind, faction: FactionId): Group {
  switch (kind) {
    case 'infantry':
      return createInfantry(faction);
    case 'general':
      return createGeneral(faction);
    case 'tank':
      return createTank(faction);
    case 'fighter':
      return createFighter(faction);
    case 'helicopter':
      return createHelicopter(faction);
    case 'drone':
      return createDrone(faction);
  }
}

export function createFactionBrick(
  faction: FactionId,
  width = 1.5,
  height = 0.6,
  depth = 1.5,
): Group {
  return brick(width, height, depth, factionMaterial(faction));
}
