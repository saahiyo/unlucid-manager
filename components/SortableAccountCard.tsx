import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { AccountCard } from './AccountCard';
import { ProfileState } from '../types';

interface SortableAccountCardProps {
  profile: ProfileState;
  onClaim: (id: string) => void;
  onRefresh: (id: string) => void;
  onUpdate: (id: string, newName: string, newToken: string) => Promise<void> | void;
  onDelete: (id: string) => void;
  onSetTimer?: (id: string, nextFreeGemsAt: number) => void;
  isDragEnabled: boolean;
}

export const SortableAccountCard: React.FC<SortableAccountCardProps> = ({
  profile,
  onClaim,
  onRefresh,
  onUpdate,
  onDelete,
  onSetTimer,
  isDragEnabled
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: profile.id,
    disabled: !isDragEnabled
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/sortable">
      {/* Drag Handle — visible on hover when drag is enabled */}
      {isDragEnabled && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-1 top-1/2 -translate-y-1/2 z-30 p-1 rounded-md 
            bg-white/90 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700
            text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200
            opacity-0 group-hover/sortable:opacity-100 
            shadow-lg backdrop-blur-sm
            transition-all duration-200 cursor-grab active:cursor-grabbing
            hover:scale-110 hover:bg-white dark:hover:bg-zinc-700"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      )}
      <AccountCard
        profile={profile}
        onClaim={onClaim}
        onRefresh={onRefresh}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onSetTimer={onSetTimer}
      />
    </div>
  );
};
