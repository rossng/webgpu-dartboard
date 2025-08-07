import React, { useRef, useEffect } from 'react';

interface CanvasVisualizationProps {
  id: string;
  width: number;
  height: number;
  onCanvasReady: (canvas: HTMLCanvasElement) => void | Promise<void>;
}

export const CanvasVisualization: React.FC<CanvasVisualizationProps> = ({
  id,
  width,
  height,
  onCanvasReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  // Calculate display size to be max 90% of viewport height while maintaining aspect ratio
  const aspectRatio = width / height;
  const maxDisplayHeight = '90vh';
  const maxDisplayWidth = aspectRatio === 1 ? maxDisplayHeight : `calc(${maxDisplayHeight} * ${aspectRatio})`;

  return (
    <canvas
      ref={canvasRef}
      id={id}
      width={width}
      height={height}
      style={{ 
        imageRendering: 'pixelated',
        maxHeight: maxDisplayHeight,
        maxWidth: maxDisplayWidth,
        width: 'auto',
        height: 'auto'
      }}
    />
  );
};