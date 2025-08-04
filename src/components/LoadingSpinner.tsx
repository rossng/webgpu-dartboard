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
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          position,
          top,
          right,
          left,
          bottom,
          width: `${size}px`,
          height: `${size}px`,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          borderRadius: "50%",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div
          style={{
            width: `${spinnerSize}px`,
            height: `${spinnerSize}px`,
            border: `2px solid ${borderColor}`,
            borderTop: `2px solid ${spinnerColor}`,
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    </>
  );
};