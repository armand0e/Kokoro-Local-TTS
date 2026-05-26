"use client";

interface ProgressBarProps {
  progress: number;
  text: string;
  visible?: boolean;
}

export function ProgressBar({ progress, text, visible = true }: ProgressBarProps) {
  if (!visible) return null;

  const isComplete = progress >= 100;

  return (
    <div className="bg-white rounded-lg p-4 shadow-md transition-opacity duration-500">
      <p className="font-semibold text-primary-hover mb-2">{text}</p>
      <div className="w-full h-2.5 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-300 ${
            isComplete ? "bg-green-500" : "bg-primary"
          }`}
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
      <p className="text-right text-sm text-gray-500 font-medium mt-1">
        {Math.round(progress)}%
      </p>
    </div>
  );
}
