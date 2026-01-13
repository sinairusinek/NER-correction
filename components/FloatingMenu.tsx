import React from 'react';
import { User, MapPin, Tag, Sparkles, Edit3 } from 'lucide-react';
import { SelectionState, EntityType } from '../types';

interface FloatingMenuProps {
  selection: SelectionState | null;
  onTag: (type: EntityType) => void;
  onAutoTag: () => void;
  onStartEdit: () => void;
  isAutoTagging: boolean;
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({ selection, onTag, onAutoTag, onStartEdit, isAutoTagging }) => {
  if (!selection || !selection.rect) return null;

  const style: React.CSSProperties = {
    top: `${selection.rect.top - 60}px`, 
    left: `${selection.rect.left}px`,
  };

  return (
    <div 
      className="fixed z-50 bg-white rounded-lg shadow-2xl border border-slate-200 p-1 flex items-center gap-0.5 animate-in fade-in zoom-in duration-150"
      style={style}
    >
      <button
        onClick={() => onTag(EntityType.PersName)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded transition-colors group min-w-[48px]"
        title="Mark as Person"
      >
        <User className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter group-hover:text-blue-600">Pers</span>
      </button>
      
      <button
        onClick={() => onTag(EntityType.PlaceName)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded transition-colors group min-w-[48px]"
        title="Mark as Place"
      >
        <MapPin className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter group-hover:text-emerald-600">Place</span>
      </button>
      
      <button
        onClick={() => onTag(EntityType.Name)}
        className="flex flex-col items-center gap-1 p-2 hover:bg-purple-50 text-slate-600 hover:text-purple-600 rounded transition-colors group min-w-[48px]"
        title="Mark as Name"
      >
        <Tag className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter group-hover:text-purple-600">Name</span>
      </button>

      <div className="w-px h-8 bg-slate-200 mx-1"></div>

      <button
        onClick={onStartEdit}
        className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded transition-colors group min-w-[48px]"
        title="Correct typo in text"
      >
        <Edit3 className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter group-hover:text-slate-900">Typo</span>
      </button>

      <button
        onClick={onAutoTag}
        disabled={isAutoTagging}
        className="flex flex-col items-center gap-1 p-2 hover:bg-amber-50 text-slate-600 hover:text-amber-600 rounded transition-colors group disabled:opacity-50 min-w-[48px]"
        title="AI Auto-Annotate Selection"
      >
        <Sparkles className={`w-5 h-5 ${isAutoTagging ? 'animate-pulse text-amber-500' : ''}`} />
        <span className="text-[9px] font-bold uppercase tracking-tighter group-hover:text-amber-600">Auto</span>
      </button>
    </div>
  );
};