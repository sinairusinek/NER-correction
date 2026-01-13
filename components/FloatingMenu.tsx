import React from 'react';
import { User, MapPin, Tag, Sparkles } from 'lucide-react';
import { SelectionState, EntityType } from '../types';

interface FloatingMenuProps {
  selection: SelectionState | null;
  onTag: (type: EntityType) => void;
  onAutoTag: () => void;
  isAutoTagging: boolean;
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({ selection, onTag, onAutoTag, isAutoTagging }) => {
  if (!selection || !selection.rect) return null;

  const style: React.CSSProperties = {
    top: `${selection.rect.top - 60}px`, // Position above the selection
    left: `${selection.rect.left}px`,
  };

  return (
    <div 
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-1 flex items-center gap-1 animate-in fade-in zoom-in duration-150"
      style={style}
    >
      <button
        onClick={() => onTag(EntityType.PersName)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded transition-colors group"
        title="Mark as Person"
      >
        <User className="w-5 h-5" />
        <span className="text-[10px] font-medium group-hover:text-blue-600">Pers</span>
      </button>
      
      <button
        onClick={() => onTag(EntityType.PlaceName)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded transition-colors group"
        title="Mark as Place"
      >
        <MapPin className="w-5 h-5" />
        <span className="text-[10px] font-medium group-hover:text-emerald-600">Place</span>
      </button>
      
      <button
        onClick={() => onTag(EntityType.Name)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-purple-50 text-slate-600 hover:text-purple-600 rounded transition-colors group"
        title="Mark as Name"
      >
        <Tag className="w-5 h-5" />
        <span className="text-[10px] font-medium group-hover:text-purple-600">Name</span>
      </button>

      <div className="w-px h-8 bg-slate-200 mx-1"></div>

      <button
        onClick={onAutoTag}
        disabled={isAutoTagging}
        className="flex flex-col items-center gap-1 p-2 hover:bg-amber-50 text-slate-600 hover:text-amber-600 rounded transition-colors group disabled:opacity-50"
        title="AI Auto-Annotate Selection"
      >
        <Sparkles className={`w-5 h-5 ${isAutoTagging ? 'animate-pulse text-amber-500' : ''}`} />
        <span className="text-[10px] font-medium group-hover:text-amber-600">Auto</span>
      </button>
    </div>
  );
};
