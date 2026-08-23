"use client";

import { useEffect, useRef } from "react";
// Type-only import: erased at build time, so `three` still loads lazily below.
import type * as ThreeTypes from "three";

/**
 * Equirectangular panorama viewer. `three` is imported lazily so it never lands
 * in the shared client bundle for pages without a panorama block.
 */
export function Panorama({
  src,
  kind,
  height = 24,
}: {
  src: string;
  kind: "image" | "video";
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed || !hostRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        host.clientWidth / Math.max(1, host.clientHeight),
        0.1,
        1000
      );
      camera.position.set(0, 0, 0.1);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(host.clientWidth, host.clientHeight);
      host.appendChild(renderer.domElement);

      let videoEl: HTMLVideoElement | null = null;
      let texture: ThreeTypes.Texture;

      if (kind === "video") {
        videoEl = document.createElement("video");
        videoEl.src = src;
        videoEl.crossOrigin = "anonymous";
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        void videoEl.play().catch(() => {});
        texture = new THREE.VideoTexture(videoEl);
      } else {
        texture = new THREE.TextureLoader().load(src);
      }
      texture.colorSpace = THREE.SRGBColorSpace;

      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1); // render the inside of the sphere
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ map: texture })
      );
      scene.add(mesh);

      let lon = 0;
      let lat = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

      const onDown = (event: PointerEvent) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const onMove = (event: PointerEvent) => {
        if (!dragging) return;
        lon -= (event.clientX - lastX) * 0.15;
        lat += (event.clientY - lastY) * 0.15;
        lat = Math.max(-85, Math.min(85, lat));
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const onUp = () => {
        dragging = false;
      };

      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      const onResize = () => {
        if (!hostRef.current) return;
        const width = hostRef.current.clientWidth;
        const heightPx = hostRef.current.clientHeight;
        camera.aspect = width / Math.max(1, heightPx);
        camera.updateProjectionMatrix();
        renderer.setSize(width, heightPx);
      };
      window.addEventListener("resize", onResize);

      let frame = 0;
      const animate = () => {
        frame = requestAnimationFrame(animate);
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        camera.lookAt(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta)
        );
        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(frame);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("resize", onResize);
        geometry.dispose();
        texture.dispose();
        renderer.dispose();
        videoEl?.pause();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [src, kind]);

  return <div ref={hostRef} className="pb-panorama" style={{ height: `${height}rem` }} />;
}
