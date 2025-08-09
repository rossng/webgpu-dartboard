import React, { useRef, useEffect } from 'react';

interface CanvasVisualizationProps {
  id: string;
  width: number;
  height: number;
  onCanvasReady: (canvas: HTMLCanvasElement, overlayCanvas?: HTMLCanvasElement) => void | Promise<void>;
  showOverlay?: boolean;
}

export const CanvasVisualization: React.FC<CanvasVisualizationProps> = ({
  id,
  width,
  height,
  onCanvasReady,
  showOverlay = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const overlayCanvas = showOverlay && overlayRef.current ? overlayRef.current : undefined;
      onCanvasReady(canvasRef.current, overlayCanvas);
    }
  }, [onCanvasReady, showOverlay]);

  // Calculate display size to be max 90% of viewport height while maintaining aspect ratio
  const aspectRatio = width / height;
  const maxDisplayHeight = '90vh';
  const maxDisplayWidth = aspectRatio === 1 ? maxDisplayHeight : `calc(${maxDisplayHeight} * ${aspectRatio})`;

  const canvasStyle = { 
    imageRendering: 'pixelated' as const,
    maxHeight: maxDisplayHeight,
    maxWidth: maxDisplayWidth,
    width: 'auto',
    height: 'auto'
  };

  if (!showOverlay) {
    return (
      <canvas
        ref={canvasRef}
        id={id}
        width={width}
        height={height}
        style={canvasStyle}
      />
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        id={id}
        width={width}
        height={height}
        style={canvasStyle}
      />
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        style={{
          ...canvasStyle,
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </div>
  );
};