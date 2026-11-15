import {
  AdditiveBlending,
  BackSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

export interface EarthPose {
  lon: number;
  lat: number;
  cx: number;
  cy: number;
  scale: number;
}

export interface Earth {
  ready: () => boolean;
  resize: (width: number, height: number, ratio: number) => void;
  render: (pose: EarthPose, sun: [number, number]) => void;
  dispose: () => void;
}

const RAD = Math.PI / 180;
const ATMOSPHERE = 1.055;

const SURFACE_VERTEX = `
varying vec2 vUv;
varying vec3 vObject;
varying vec3 vView;
void main() {
  vUv = uv;
  vObject = normalize(position);
  vView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SURFACE_FRAGMENT = `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D reliefMap;
uniform vec3 sunDirection;
uniform vec2 texel;
varying vec2 vUv;
varying vec3 vObject;
varying vec3 vView;
void main() {
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float east = texture2D(reliefMap, vUv + vec2(texel.x, 0.0)).r - texture2D(reliefMap, vUv - vec2(texel.x, 0.0)).r;
  float north = texture2D(reliefMap, vUv + vec2(0.0, texel.y)).r - texture2D(reliefMap, vUv - vec2(0.0, texel.y)).r;
  vec3 up = vObject;
  vec3 eastward = normalize(cross(vec3(0.0, 1.0, 0.0), up) + vec3(0.0, 0.0, 1e-5));
  vec3 northward = cross(up, eastward);
  vec3 terrain = normalize(up - (eastward * east + northward * north) * 2.4);
  float facing = dot(up, sunDirection);
  float daylight = smoothstep(-0.14, 0.2, facing);
  float diffuse = clamp(dot(terrain, sunDirection), 0.0, 1.0);
  vec3 lit = day * (0.5 + 0.92 * diffuse);
  vec3 dark = night * 1.55 + day * 0.2;
  vec3 colour = mix(dark, lit, daylight);
  float toward = clamp(vView.z, 0.0, 1.0);
  colour *= mix(0.5, 1.0, pow(toward, 0.5));
  colour += vec3(0.38, 0.62, 0.95) * pow(1.0 - toward, 3.4) * (0.16 + 0.5 * daylight);
  gl_FragColor = vec4(colour, 1.0);
}`;

const HALO_VERTEX = `
varying vec3 vView;
void main() {
  vView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HALO_FRAGMENT = `
uniform vec3 sunView;
uniform float shell;
varying vec3 vView;
void main() {
  float radius = sqrt(max(1.0 - vView.z * vView.z, 0.0)) * shell;
  float outside = smoothstep(shell, 1.0, radius);
  float lit = 0.22 + 0.78 * smoothstep(-0.45, 0.5, dot(normalize(vec3(vView.xy, 0.0001)), sunView));
  float alpha = pow(outside, 2.2) * 0.62 * lit;
  gl_FragColor = vec4(vec3(0.42, 0.68, 1.0) * alpha, alpha);
}`;

function direction(lon: number, lat: number): Vector3 {
  return new Vector3(Math.cos(lon * RAD) * Math.cos(lat * RAD), Math.sin(lat * RAD), -Math.sin(lon * RAD) * Math.cos(lat * RAD));
}

export function createEarth(canvas: HTMLCanvasElement, small: boolean, onReady: () => void): Earth | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const tier = small || renderer.capabilities.maxTextureSize < 4096 ? "2k" : "4k";
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 1, 0, 1, 40000);
  camera.position.z = 20000;

  let loaded = 0;
  let failed = false;
  let lost = false;
  const loader = new TextureLoader();
  const load = (url: string): Texture =>
    loader.load(
      url,
      () => {
        loaded += 1;
        if (loaded === 3) onReady();
      },
      undefined,
      () => {
        failed = true;
      },
    );
  const textures = [load(`/earth/day-${tier}.jpg`), load(`/earth/night-${tier}.jpg`), load("/earth/relief-2k.png")];
  textures.forEach((texture, index) => {
    texture.colorSpace = NoColorSpace;
    texture.minFilter = index === 2 ? LinearFilter : LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = index !== 2;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });

  const surface = new ShaderMaterial({
    uniforms: {
      dayMap: { value: textures[0] },
      nightMap: { value: textures[1] },
      reliefMap: { value: textures[2] },
      sunDirection: { value: new Vector3(1, 0, 0) },
      texel: { value: new Vector2(1 / 2048, 1 / 1024) },
    },
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
  });
  const halo = new ShaderMaterial({
    uniforms: { sunView: { value: new Vector3(0, 0, 1) }, shell: { value: ATMOSPHERE } },
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const geometry = new SphereGeometry(1, 192, 128);
  const globe = new Mesh(geometry, surface);
  const air = new Mesh(geometry, halo);
  globe.rotation.order = "XYZ";
  scene.add(air);
  scene.add(globe);

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    onReady();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  let viewHeight = 1;

  return {
    ready: () => loaded === 3 && !failed && !lost,
    resize: (width, height, ratio) => {
      viewHeight = height;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.left = 0;
      camera.right = width;
      camera.top = height;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
    },
    render: (pose, sun) => {
      globe.position.set(pose.cx, viewHeight - pose.cy, 0);
      globe.scale.setScalar(pose.scale);
      globe.rotation.set(pose.lat * RAD, -(pose.lon + 90) * RAD, 0);
      air.position.copy(globe.position);
      air.scale.setScalar(pose.scale * ATMOSPHERE);
      const sunObject = direction(sun[0], sun[1]);
      surface.uniforms.sunDirection.value.copy(sunObject);
      globe.updateMatrixWorld();
      halo.uniforms.sunView.value.copy(sunObject.clone().applyQuaternion(globe.quaternion).setZ(0).normalize());
      renderer.render(scene, camera);
    },
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      textures.forEach((texture) => texture.dispose());
      geometry.dispose();
      surface.dispose();
      halo.dispose();
      renderer.dispose();
    },
  };
}
