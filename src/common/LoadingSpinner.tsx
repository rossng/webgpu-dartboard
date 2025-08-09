import React from "react";

interface LoadingSpinnerProps {
  size?: number;
  position?: "absolute" | "relative";
  top?: string | number;
  right?: string | number;
  left?: string | number;
  bottom?: string | number;
  backgroundColor?: string;
  spinnerColor?: string;
  borderColor?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 30,
  position = "absolute",
  top = "10px",
  right = "10px",
  left,
  bottom,
  backgroundColor = "rgba(255, 255, 255, 0.9)",
  spinnerColor = "#3498db",
  borderColor = "#f3f3f3",
}) => {
  const spinnerSize = size * 0.67; // Spinner is 2/3 of container size

  return (
    <div
      className="z-10 flex items-center justify-center rounded-full shadow-md"
      style={{
        position,
        top,
        right,
        left,
        bottom,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor,
      }}
    >
      <div
        className="rounded-full"
        style={{
          width: `${spinnerSize}px`,
          height: `${spinnerSize}px`,
          border: `2px solid ${borderColor}`,
          borderTop: `2px solid ${spinnerColor}`,
          animation: "spin 1s linear infinite",
        }}
      />
    </div>
  );
};