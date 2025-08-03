import React, { useRef, useCallback, useState } from 'react';

interface TargetIndicatorProps {
  targetPosition: { x: number; y: number }; // Normalized coordinates (-1 to 1)
  onTargetPositionChange: (position: { x: number; y: number }) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

export const TargetIndicator: React.FC<TargetIndicatorProps> = ({
  targetPosition,
  onTargetPositionChange,
  onDragStart,
  onDragEnd,
  canvasWidth,
  canvasHeight,
}) => {
  const isDragging = useRef(false);
  const [dragPosition, setDragPosition] = useState(targetPosition);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use drag position during dragging, target position otherwise
  const currentPosition = isDragging.current ? dragPosition : targetPosition;
  
  // Convert normalized coordinates to pixel coordinates
  const pixelX = (currentPosition.x + 1) * canvasWidth * 0.5;
  const pixelY = (currentPosition.y + 1) * canvasHeight * 0.5;

  const debouncedUpdate = useCallback((position: { x: number; y: number }) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      onTargetPositionChange(position);
    }, 16); // ~60fps
  }, [onTargetPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setDragPosition(targetPosition);
    onDragStart?.();
  }, [targetPosition, onDragStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel coordinates to normalized coordinates (-1 to 1)
    const normalizedX = (x / canvasWidth) * 2 - 1;
    const normalizedY = (y / canvasHeight) * 2 - 1;

    // Clamp to dartboard bounds
    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    const newPosition = { x: clampedX, y: clampedY };
    setDragPosition(newPosition);
    debouncedUpdate(newPosition);
  }, [canvasWidth, canvasHeight, debouncedUpdate]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      // Ensure final position is set
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        onTargetPositionChange(dragPosition);
      }
      onDragEnd?.();
    }
  }, [dragPosition, onTargetPositionChange, onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel coordinates to normalized coordinates (-1 to 1)
    const normalizedX = (x / canvasWidth) * 2 - 1;
    const normalizedY = (y / canvasHeight) * 2 - 1;

    // Clamp to dartboard bounds
    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    onTargetPositionChange({ x: clampedX, y: clampedY });
  }, [canvasWidth, canvasHeight, onTargetPositionChange]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        cursor: 'crosshair',
        pointerEvents: 'all',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      {/* Crosshair */}
      <div
        style={{
          position: 'absolute',
          left: pixelX - 10,
          top: pixelY - 10,
          width: 20,
          height: 20,
          pointerEvents: 'none',
        }}
      >
        {/* Horizontal line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 9,
            width: 20,
            height: 2,
            backgroundColor: '#ff0000',
            boxShadow: '0 0 0 1px #ffffff',
          }}
        />
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: 9,
            top: 0,
            width: 2,
            height: 20,
            backgroundColor: '#ff0000',
            boxShadow: '0 0 0 1px #ffffff',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            width: 4,
            height: 4,
            backgroundColor: '#ff0000',
            borderRadius: '50%',
            boxShadow: '0 0 0 1px #ffffff',
          }}
        />
      </div>
    </div>
  );
};