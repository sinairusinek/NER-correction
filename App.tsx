import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, FileText, CheckCircle, Circle, AlignLeft, AlignRight, AlertCircle, RefreshCcw, ChevronLeft, ChevronRight, Undo, RotateCcw, ScanSearch, ArrowRight, ArrowLeft, Layers, Sparkles, FileCode, CheckCheck, RotateCw } from 'lucide-react';
import { EntityType, SelectionState } from './types';
import { parseXML, serializeXML, wrapSelectionInTag, unwrapTag, createSampleTEI, getNodeByPath, getPages, PageInfo, replaceNode, acceptSuggestion, declineSuggestion, acceptAllSuggestionsInNode, updateNodeText } from './utils/teiUtils';
import { XmlNodeRenderer } from './components/TeiRenderer';
import { FloatingMenu } from './components/FloatingMenu';
import { autoAnnotateText, reviewXmlFragment } from './services/geminiService';

function App() {
  const [xmlDoc, setXmlDoc] = useState<Document | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalDoc, setOriginalDoc] = useState<string | null>(null);

  const [pages, setPages] = useState<PageInfo[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [pageStatus, setPageStatus] = useState<Record<string, boolean>>({});

  const [suggestions, setSuggestions] = useState<Element[]>([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState<number>(-1);
  const [reviewComplete, setReviewComplete] = useState(false);
  
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (xmlDoc) {
      const detectedPages = getPages(xmlDoc);
      setPages(detectedPages);
      
      if (activePageIndex >= detectedPages.length && detectedPages.length > 0) {
        setActivePageIndex(Math.max(0, detectedPages.length - 1));
      }

      const suggestionNodes = Array.from(xmlDoc.getElementsByTagName('suggestion'));
      setSuggestions(suggestionNodes);
      
      if (suggestionNodes.length > 0 && currentSuggestionIndex === -1) {
          setCurrentSuggestionIndex(0);
      } else if (suggestionNodes.length === 0) {
          setCurrentSuggestionIndex(-1);
      }
    } else {
      setPages([]);
      setSuggestions([]);
    }
  }, [xmlDoc]);

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activePageIndex]);

  useEffect(() => {
    if (currentSuggestionIndex >= 0 && suggestions[currentSuggestionIndex]) {
       setTimeout(() => {
          const els = document.querySelectorAll('span[id^="suggestion-"]');
          if (els[currentSuggestionIndex]) {
            els[currentSuggestionIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
       }, 150);
    }
  }, [currentSuggestionIndex, suggestions.length]);

  const addToHistory = (xmlString: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(xmlString);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const updateXmlDoc = (newDoc: Document) => {
    const serialized = serializeXML(newDoc);
    setXmlDoc(newDoc);
    addToHistory(serialized);
    setReviewComplete(false);
  };

  const togglePageStatus = (pageId: string) => {
    setPageStatus(prev => ({ ...prev, [pageId]: !prev[pageId] }));
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevXml = history[historyIndex - 1];
      setXmlDoc(parseXML(prevXml));
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleResetPage = () => {
    if (!xmlDoc || !originalDoc || pages.length === 0) return;
    const originalDom = parseXML(originalDoc);
    const originalPages = getPages(originalDom);
    const originalPage = originalPages.find(p => p.id === pages[activePageIndex].id);
    if (originalPage) {
       const newDoc = replaceNode(xmlDoc, pages[activePageIndex].path, originalPage.node);
       updateXmlDoc(newDoc);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const doc = parseXML(content);
          setXmlDoc(doc);
          setOriginalDoc(content);
          setHistory([content]);
          setHistoryIndex(0);
          setPageStatus({});
          setErrorMsg(null);
          setReviewComplete(false);
          setActivePageIndex(0);
        } catch (err) {
          setErrorMsg("Failed to parse XML file. Please ensure it is valid XML.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDownload = () => {
    if (!xmlDoc) return;
    const content = serializeXML(xmlDoc);
    const blob = new Blob([content], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (fileName || 'document').replace('.xml', '') + '_annotated.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || editingPath) {
      if (!editingPath) setSelectionState(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    let parent: Node | null = container;
    let isInsideEntity = false;
    while (parent) {
      if (parent.nodeType === Node.ELEMENT_NODE) {
        const el = parent as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'fw') {
          setSelectionState(null);
          return;
        }
        if (['persname', 'placename', 'name'].includes(tag)) {
          isInsideEntity = true;
        }
      }
      parent = parent.parentNode;
    }

    let targetEl: HTMLElement | null = null;
    if (container.nodeType === Node.TEXT_NODE) {
        // We want the path of the text node itself
        // But our renderer puts teipath on the wrapper spans
        targetEl = container.parentElement;
    } else {
        targetEl = container as HTMLElement;
    }

    while (targetEl && !targetEl.getAttribute('data-teipath')) {
      targetEl = targetEl.parentElement;
    }
    
    if (!targetEl) {
      setSelectionState(null);
      return;
    }

    const path = targetEl.getAttribute('data-teipath');
    if (!path) return;

    setSelectionState({
      text: selection.toString(),
      path: path,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      rect: range.getBoundingClientRect(),
      isInsideEntity
    });
  }, [editingPath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleMouseUp = () => setTimeout(handleSelection, 10);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleSelection]);

  const handleApplyTag = (type: EntityType) => {
    if (!selectionState || !xmlDoc) return;
    const newDoc = wrapSelectionInTag(xmlDoc, selectionState.path, selectionState.startOffset, selectionState.endOffset, type);
    updateXmlDoc(newDoc);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAction = (action: string, path: string, payload?: any) => {
    if (!xmlDoc) return;
    let newDoc: Document | null = null;
    if (action === 'unwrap') newDoc = unwrapTag(xmlDoc, path);
    else if (action === 'acceptSuggestion') newDoc = acceptSuggestion(xmlDoc, path, payload);
    else if (action === 'declineSuggestion') newDoc = declineSuggestion(xmlDoc, path);
    else if (action === 'startEdit') setEditingPath(path);
    else if (action === 'updateText') {
        newDoc = updateNodeText(xmlDoc, path, payload as string);
        setEditingPath(null);
    }
    if (newDoc) updateXmlDoc(newDoc);
  };

  const handleAcceptAll = (scope: 'page' | 'document') => {
    if (!xmlDoc) return;
    const docClone = xmlDoc.cloneNode(true) as Document;
    if (scope === 'page' && pages[activePageIndex]) {
      const nodeInClone = getNodeByPath(docClone, pages[activePageIndex].path);
      if (nodeInClone) acceptAllSuggestionsInNode(docClone, nodeInClone);
    } else {
      acceptAllSuggestionsInNode(docClone, docClone.documentElement);
    }
    updateXmlDoc(docClone);
  };

  const handleAutoTagSelection = async () => {
    if (!selectionState || !xmlDoc) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const annotatedFragment = await autoAnnotateText(selectionState.text);
      if (annotatedFragment === selectionState.text) {
        setIsProcessing(false);
        setSelectionState(null);
        return;
      }
      const docClone = xmlDoc.cloneNode(true) as Document;
      const targetNode = getNodeByPath(docClone, selectionState.path);
      
      if (targetNode) {
          const parent = targetNode.parentNode;
          if (parent) {
              const originalText = targetNode.textContent || "";
              const before = originalText.substring(0, selectionState.startOffset);
              const after = originalText.substring(selectionState.endOffset);
              
              const fragmentWrapper = parseXML(`<root>${annotatedFragment}</root>`);
              const newNodes = Array.from(fragmentWrapper.documentElement.childNodes);
              const fragment = docClone.createDocumentFragment();
              
              if (before) fragment.appendChild(docClone.createTextNode(before));
              newNodes.forEach(n => fragment.appendChild(docClone.importNode(n, true)));
              if (after) fragment.appendChild(docClone.createTextNode(after));
              
              if (targetNode.nodeType === Node.TEXT_NODE) {
                  parent.replaceChild(fragment, targetNode);
              } else {
                  // If it's an element, we probably meant to replace its content
                  targetNode.textContent = '';
                  targetNode.appendChild(fragment);
              }
              updateXmlDoc(docClone);
          }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to auto-annotate.");
    } finally {
      setIsProcessing(false);
      setSelectionState(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleReview = async (scope: 'page' | 'document') => {
     if (!xmlDoc) return;
     setIsProcessing(true);
     setErrorMsg(null);
     try {
       const isFull = scope === 'document';
       const targetXml = isFull ? serializeXML(xmlDoc) : serializeXML(pages[activePageIndex].node as any);
       const reviewedXml = await reviewXmlFragment(targetXml, isFull);
       
       try {
           const reviewedDom = parseXML(reviewedXml);
           const parserError = reviewedDom.querySelector('parsererror');
           if (parserError) throw new Error(`AI returned invalid XML structure.`);
           
           if (isFull) {
               updateXmlDoc(reviewedDom);
               setReviewComplete(true);
           } else {
               const newDoc = replaceNode(xmlDoc, pages[activePageIndex].path, reviewedDom.documentElement);
               updateXmlDoc(newDoc);
           }
       } catch (parseErr: any) {
           setErrorMsg(`Parsing Error: ${parseErr.message}. The AI response contained invalid XML syntax.`);
       }
     } catch (e: any) {
       setErrorMsg(e?.message || "Review failed.");
     } finally {
       setIsProcessing(false);
     }
  };

  const loadSample = () => {
    const s = createSampleTEI();
    const doc = parseXML(s);
    setXmlDoc(doc);
    setFileName("sample_hebrew.xml");
    setOriginalDoc(s);
    setHistory([s]);
    setHistoryIndex(0);
    setPageStatus({});
    setReviewComplete(false);
    setActivePageIndex(0);
  };

  if (!xmlDoc) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-500">
          <div className="bg-blue-600 p-12 text-white">
            <div className="flex justify-center mb-6">
              <div className="bg-white/20 p-4 rounded-full backdrop-blur-md">
                <FileCode size={48} />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">TEI Annotator</h1>
            <p className="text-blue-100 text-lg font-medium opacity-90">Advanced XML-TEI Review & Typo Correction</p>
          </div>
          
          <div className="p-12 space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-slate-800">Ready to Annotate</h2>
              <p className="text-slate-500 leading-relaxed">
                Correct annotations, fix typos, and create nested entities 
                (like a <code>placeName</code> inside a <code>persName</code>).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl cursor-pointer transition-all group">
                <Upload size={32} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                <span className="font-bold text-slate-700 group-hover:text-blue-700">Upload XML</span>
                <input type="file" accept=".xml" onChange={handleFileUpload} className="hidden" />
              </label>

              <button 
                onClick={loadSample}
                className="flex flex-col items-center gap-3 p-8 border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 rounded-xl transition-all group"
              >
                <Sparkles size={32} className="text-slate-400 group-hover:text-amber-500 transition-colors" />
                <span className="font-bold text-slate-700 group-hover:text-amber-700">Try with Sample</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={direction} className="flex flex-col h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setXmlDoc(null)} className="bg-blue-600 p-2 rounded-lg text-white hover:bg-blue-700 transition-colors" title="Back to Welcome">
            <FileText size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">TEI Annotator</h1>
            <p className="text-xs text-slate-500 font-medium">{fileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-30" title="Undo"><Undo size={18} /></button>

          <button onClick={() => setDirection(prev => prev === 'rtl' ? 'ltr' : 'rtl')} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors text-sm font-medium">
            {direction === 'rtl' ? <AlignRight size={16} /> : <AlignLeft size={16} />}
            <span>{direction.toUpperCase()}</span>
          </button>

          <div className="flex bg-slate-100 p-1 rounded-md gap-1">
            <button onClick={() => handleReview('page')} disabled={isProcessing} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white hover:shadow-sm text-slate-700 rounded transition-all text-xs font-semibold disabled:opacity-50"><ScanSearch size={14} /><span>Review Page</span></button>
            <button onClick={() => handleReview('document')} disabled={isProcessing || reviewComplete} className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all text-xs font-semibold disabled:opacity-50 ${reviewComplete ? 'text-slate-400' : 'hover:bg-white hover:shadow-sm text-purple-700'}`}><Layers size={14} /><span>Review All</span></button>
          </div>

          <label className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer text-sm font-medium">
            <Upload size={16} />
            <span>New File</span>
            <input type="file" accept=".xml" onChange={handleFileUpload} className="hidden" />
          </label>
          
          <div className="w-px h-8 bg-slate-200 mx-1"></div>

          <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm text-sm font-medium transition-colors">
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {suggestions.length > 0 && (
         <div className="bg-slate-800 text-white px-6 py-2 flex items-center justify-between z-40 shadow-inner">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-sm font-medium">
                     <AlertCircle size={16} className="text-amber-400" />
                     {suggestions.length} suggestions
                 </div>
                 <div className="flex items-center gap-1">
                     <button onClick={() => setCurrentSuggestionIndex(p => (p - 1 + suggestions.length) % suggestions.length)} className="p-1 hover:bg-slate-700 rounded transition-colors"><ArrowLeft size={16} /></button>
                     <span className="text-xs text-slate-400 w-16 text-center font-mono">{currentSuggestionIndex + 1} / {suggestions.length}</span>
                     <button onClick={() => setCurrentSuggestionIndex(p => (p + 1) % suggestions.length)} className="p-1 hover:bg-slate-700 rounded transition-colors"><ArrowRight size={16} /></button>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => handleAcceptAll('page')} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-bold transition-all shadow-lg active:scale-95">Accept Page</button>
                 </div>
             </div>
             <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Double-click text to fix typos</div>
         </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {pages.length > 0 && (
          <aside className="w-64 bg-white border-e border-slate-200 flex flex-col shrink-0 z-20 overflow-y-auto">
            <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-xs uppercase">Navigation</h3>
            </div>
            <div className="p-2 space-y-1">
              {pages.map((page, idx) => (
                <div key={page.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all ${idx === activePageIndex ? 'bg-blue-50 border-blue-100 shadow-sm' : 'hover:bg-slate-50'}`} onClick={() => setActivePageIndex(idx)}>
                   <button onClick={(e) => { e.stopPropagation(); togglePageStatus(page.id); }} className={`${!!pageStatus[page.id] ? 'text-green-500' : 'text-slate-300'} transition-colors hover:text-green-400`}>{!!pageStatus[page.id] ? <CheckCircle size={18} /> : <Circle size={18} />}</button>
                   <p className={`text-sm font-medium truncate ${idx === activePageIndex ? 'text-blue-700' : 'text-slate-700'}`}>{page.id}</p>
                </div>
              ))}
            </div>
          </aside>
        )}

        <main ref={mainContentRef} className="flex-1 overflow-auto bg-slate-100/50 p-8">
          <div className="max-w-4xl mx-auto h-full flex flex-col">
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <div className="text-sm">
                      <p className="font-bold">Error</p>
                      <p className="opacity-90">{errorMsg}</p>
                    </div>
                  </div>
                  <button onClick={() => handleReview('page')} className="flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold text-xs transition-colors shrink-0"><RotateCw size={14} />Retry</button>
              </div>
            )}
            <div ref={containerRef} className={`relative font-serif text-lg leading-relaxed text-slate-800 ${direction === 'rtl' ? 'text-right' : 'text-left'} flex-1`}>
              {xmlDoc && pages.length > 0 ? (
                <div className="bg-white shadow-lg p-12 min-h-[800px] rounded-sm relative border border-slate-200">
                    <div className="absolute top-4 end-4 flex items-center gap-2">
                      <button onClick={handleResetPage} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title="Reset Page"><RotateCcw size={16} /></button>
                    </div>
                    <XmlNodeRenderer node={pages[activePageIndex].node} path={pages[activePageIndex].path} onAction={handleAction} editingPath={editingPath} />
                </div>
              ) : xmlDoc ? (
                <div className="bg-white shadow-lg p-12 min-h-screen rounded-sm border border-slate-200">
                  <XmlNodeRenderer node={xmlDoc.documentElement} path="" onAction={handleAction} editingPath={editingPath} />
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400">Ready for file input.</div>
              )}
            </div>
            {pages.length > 0 && (
              <div className="flex items-center justify-between py-8 mt-4 border-t border-slate-200 sticky bottom-0 bg-slate-100/90 backdrop-blur-sm px-4 rounded-b-lg">
                 <button onClick={() => setActivePageIndex(p => p - 1)} disabled={activePageIndex === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded shadow-sm disabled:opacity-50 transition-all active:scale-95"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /><span>Previous</span></button>
                 <span className="text-sm font-bold text-slate-500 bg-white px-4 py-1.5 rounded-full border border-slate-200 shadow-sm">Page {activePageIndex + 1} of {pages.length}</span>
                 <button onClick={() => setActivePageIndex(p => p + 1)} disabled={activePageIndex === pages.length - 1} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded shadow-sm disabled:opacity-50 transition-all active:scale-95"><span>Next</span><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
              </div>
            )}
          </div>
        </main>
      </div>

      <FloatingMenu selection={selectionState} onTag={handleApplyTag} onAutoTag={handleAutoTagSelection} onStartEdit={() => selectionState && handleAction('startEdit', selectionState.path)} isAutoTagging={isProcessing} />
      {isProcessing && (
        <div className="fixed bottom-8 right-8 bg-white border border-slate-200 shadow-2xl rounded-lg p-4 flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-bold text-slate-700">AI Analyst working...</span>
        </div>
      )}
    </div>
  );
}

export default App;