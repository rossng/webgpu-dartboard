import React, { useEffect, useRef } from "react";
import { getViridisColor } from "../webgpu/viridis";

interface ViridisColorScaleProps {
  height: number;
  width?: number;
  min: number;
  max: number;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}

export const ViridisColorScale: React.FC<ViridisColorScaleProps> = ({
  height,
  width = 30,
  min,
  max,
  style = {},
  labelStyle = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const intensity = 1 - y / height;
      const color = getViridisColor(intensity);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [height, width]);

  const defaultLabelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: "bold",
    ...labelStyle,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        position: "relative",
        maxHeight: '90vh',
        height: 'auto',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ 
          border: "1px solid #ddd",
          maxHeight: '90vh',
          width: 'auto',
          height: 'auto'
        }}
      />
      <div
        style={{
          position: "absolute",
          left: width + 10,
          top: 0,
          ...defaultLabelStyle,
        }}
      >
        {max.toFixed(1)}
      </div>
      <div
        style={{
          position: "absolute",
          left: width + 10,
          bottom: 0,
          ...defaultLabelStyle,
        }}
      >
        {min.toFixed(1)}
      </div>
    </div>
  );
};