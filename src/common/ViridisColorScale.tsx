import React, { useEffect, useRef } from "react";
import { getViridisColor } from "../webgpu/viridis";

interface ViridisColorScaleProps {
  height: number;
  width?: number;
  min: number;
  max: number;
  style?: React.CSSProperties;
  className?: string;
  labelStyle?: React.CSSProperties;
}

export const ViridisColorScale: React.FC<ViridisColorScaleProps> = ({
  height,
  width = 30,
  min,
  max,
  style = {},
  className = "",
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
      className={`flex items-center relative max-h-[90vh] h-auto ${className}`}
      style={style}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 max-h-[90vh] w-auto h-auto"
      />
      <div
        className="absolute top-0"
        style={{
          left: width + 10,
          ...defaultLabelStyle,
        }}
      >
        {max.toFixed(1)}
      </div>
      <div
        className="absolute bottom-0"
        style={{
          left: width + 10,
          ...defaultLabelStyle,
        }}
      >
        {min.toFixed(1)}
      </div>
    </div>
  );
};