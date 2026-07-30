import {
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const SKY_VERTEX_SHADER = `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    vec3 lowerSky = vec3(0.50, 0.59, 0.58);
    vec3 horizon = vec3(0.66, 0.76, 0.80);
    vec3 zenith = vec3(0.22, 0.44, 0.66);
    float horizonBlend = smoothstep(-0.22, 0.08, direction.y);
    float zenithBlend = smoothstep(0.02, 0.88, direction.y);
    vec3 color = mix(lowerSky, horizon, horizonBlend);
    color = mix(color, zenith, zenithBlend);

    vec3 sunDirection = normalize(vec3(-0.55, 0.78, 0.30));
    float sunAlignment = max(dot(direction, sunDirection), 0.0);
    float sunGlow = pow(sunAlignment, 36.0) * 0.34;
    float sunDisc = pow(sunAlignment, 620.0) * 1.4;
    color += vec3(1.0, 0.72, 0.40) * sunGlow;
    color += vec3(1.0, 0.92, 0.72) * sunDisc;

    float haze = 1.0 - smoothstep(-0.03, 0.22, abs(direction.y));
    color = mix(color, horizon, haze * 0.22);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class BattlefieldAtmosphere {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  constructor() {
    this.mesh = new Mesh(
      new SphereGeometry(560, 32, 18),
      new ShaderMaterial({
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        side: BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.mesh.name = 'Battlefield Atmosphere';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  update(cameraPosition: Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }
}
