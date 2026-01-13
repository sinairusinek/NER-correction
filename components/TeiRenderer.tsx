import React, { useState, useEffect, useRef } from 'react';
import { EntityType, XmlNodeProps } from '../types';
import { User, MapPin, Tag, X, Check, MessageCircleQuestion, Plus, RefreshCw, Trash2, Edit2 } from 'lucide-react';

export const XmlNodeRenderer: React.FC<XmlNodeProps> = ({ node, path, onAction, editingPath }) => {
  const isEditing = editingPath === path;
  const inputRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at the end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  // Handle Text Nodes
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text && !isEditing) return null;

    if (isEditing) {
      return (
        <span
          ref={inputRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onAction('updateText', path, e.currentTarget.textContent)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="bg-yellow-100 outline-none border-b-2 border-yellow-500 min-w-[1ch] inline-block px-1 rounded-sm text-lg leading-loose text-slate-900"
        >
          {text}
        </span>
      );
    }

    return (
      <span 
        data-teipath={path} 
        onDoubleClick={() => onAction('startEdit', path)}
        className="text-gray-800 leading-loose text-lg hover:bg-slate-100/50 cursor-text transition-colors rounded-sm px-0.5"
      >
        {text}
      </span>
    );
  }

  // Handle Elements
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const tagName = element.tagName;
    const childNodes = Array.from(node.childNodes);

    const isFw = tagName === 'fw';

    const children = childNodes.map((child, index) => {
      const childPath = path ? `${path}:${index}` : `${index}`;
      return (
        <XmlNodeRenderer 
          key={childPath} 
          node={child} 
          path={isFw ? "" : childPath} 
          onAction={onAction} 
          editingPath={editingPath}
        />
      );
    });

    const isPers = tagName === 'persName';
    const isPlace = tagName === 'placeName';
    const isName = tagName === 'name';
    const isSuggestion = tagName === 'suggestion';

    if (isFw) {
      return (
        <span 
          className="text-slate-400 opacity-60 italic text-sm select-none mx-1 font-sans"
          title="Forme Work (Page Header/Footer/Catchword)"
        >
          {children}
        </span>
      );
    }

    if (isSuggestion) {
      const mode = element.getAttribute('mode') || 'correction';
      const type = element.getAttribute('type') || 'name';
      const reason = element.getAttribute('reason') || 'Potential error';

      let bgClass = 'bg-yellow-50 border-yellow-400 text-yellow-900';
      let hoverClass = 'hover:bg-yellow-100';
      let accentColor = 'yellow';
      let Icon = RefreshCw;

      if (mode === 'addition') {
        bgClass = 'bg-emerald-50 border-emerald-400 text-emerald-900';
        hoverClass = 'hover:bg-emerald-100';
        accentColor = 'emerald';
        Icon = Plus;
      } else if (mode === 'deletion') {
        bgClass = 'bg-red-50 border-red-400 text-red-900';
        hoverClass = 'hover:bg-red-100';
        accentColor = 'red';
        Icon = Trash2;
      }

      return (
        <span 
          id={`suggestion-${path}`}
          className={`relative inline mx-0.5 rounded px-1 pt-0.5 pb-1 border-b-2 group transition-colors shadow-sm ${bgClass} ${hoverClass}`}
        >
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-2xl hidden group-hover:block z-50 pointer-events-auto border border-slate-700">
             <div className="font-bold mb-1 flex items-center justify-between gap-1 border-b border-slate-700 pb-1">
               <span className="flex items-center gap-1">
                 <Icon size={14} className={`text-${accentColor}-400`} /> 
                 {mode.toUpperCase()} {mode !== 'deletion' ? `: ${type}` : ''}
               </span>
               <MessageCircleQuestion size={12} className="opacity-50" />
             </div>
             <div className="mt-1 opacity-90 font-sans">{reason}</div>
             <div className="mt-2 text-slate-400 italic text-[10px] font-sans">✓ Accept | ✕ Decline</div>
             <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
          </span>

          <span className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-lg rounded-full border border-slate-200 p-0.5 z-40 transform translate-y-1 group-hover:translate-y-0 pointer-events-auto">
             <button 
               onClick={(e) => { e.stopPropagation(); onAction('acceptSuggestion', path, { mode, type }); }}
               className="w-6 h-6 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-full transition-transform active:scale-90"
               title="Accept"
             >
               <Check size={12} strokeWidth={3} />
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); onAction('declineSuggestion', path); }}
               className="w-6 h-6 flex items-center justify-center bg-slate-400 hover:bg-slate-500 text-white rounded-full transition-transform active:scale-90"
               title="Decline"
             >
               <X size={12} strokeWidth={3} />
             </button>
          </span>

          <span className="selection:bg-white/30">{children}</span>
        </span>
      );
    }

    if (isPers || isPlace || isName) {
      return (
        <span 
          data-teipath={path}
          className={`inline mx-0.5 rounded px-1 pt-0.5 pb-1 border relative group transition-all duration-200 
          ${isPers ? 'bg-blue-50/80 border-blue-200 text-blue-900 hover:bg-blue-100' : ''}
          ${isPlace ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:bg-emerald-100' : ''}
          ${isName ? 'bg-purple-50/80 border-purple-200 text-purple-900 hover:bg-purple-100' : ''}
          shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]
        `}>
           <span className="inline-flex items-center gap-1 select-text align-baseline">
              {isPers && <User className="w-3 h-3 opacity-40 select-none shrink-0" />}
              {isPlace && <MapPin className="w-3 h-3 opacity-40 select-none shrink-0" />}
              {isName && <Tag className="w-3 h-3 opacity-40 select-none shrink-0" />}
              <span className="inline">
                {children}
              </span>
           </span>

           <div className="absolute -top-3 -end-2 hidden group-hover:flex items-center gap-1 z-20">
              <button
                onClick={(e) => { e.stopPropagation(); onAction('unwrap', path); }}
                className="flex items-center justify-center w-5 h-5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-transform hover:scale-110"
                title="Remove tag"
              >
                <X className="w-3 h-3" />
              </button>
           </div>
        </span>
      );
    }

    if (tagName === 'p') {
      return <p className="mb-6 block" data-teipath={path}>{children}</p>;
    }
    if (tagName === 'div') {
      return <div className="mb-4" data-teipath={path}>{children}</div>;
    }
    if (tagName === 'body' || tagName === 'text' || tagName === 'TEI') {
       return <div className="w-full" data-teipath={path}>{children}</div>;
    }
    if (tagName === 'teiHeader') {
        return null;
    }

    return <span className="xml-node-hover" data-teipath={path}>{children}</span>;
  }

  return null;
};