import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`rounded-xl border backdrop-blur-sm transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
};