import React from 'react';

export const BrandHeader: React.FC = () => {
  return (
    <div className="flex items-center px-2 py-2">
      {/* Logo & Brand - floating, no background */}
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-foreground/90 tracking-wide">
          NOLAN
        </span>
      </div>
    </div>
  );
};
