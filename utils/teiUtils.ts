import { EntityType } from '../types';

export const parseXML = (xmlString: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "text/xml");
};

export const serializeXML = (doc: Document): string => {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
};

export const getNodeByPath = (doc: Document, path: string): Node | null => {
  if (!path) return doc;
  const indices = path.split(':').map(Number);
  let current: Node = doc;
  
  for (const index of indices) {
    if (current && current.childNodes && current.childNodes[index]) {
      current = current.childNodes[index];
    } else {
      return null;
    }
  }
  return current;
};

export const wrapSelectionInTag = (
  doc: Document, 
  path: string, 
  startOffset: number, 
  endOffset: number, 
  tagName: EntityType
): Document => {
  const newDoc = doc.cloneNode(true) as Document;
  const targetNode = getNodeByPath(newDoc, path);

  if (!targetNode || targetNode.nodeType !== Node.TEXT_NODE) {
    return doc;
  }

  const textNode = targetNode as Text;
  const textContent = textNode.textContent || "";
  
  const beforeText = textContent.substring(0, startOffset);
  const selectedText = textContent.substring(startOffset, endOffset);
  const afterText = textContent.substring(endOffset);

  const parent = textNode.parentNode;
  if (!parent) return doc;

  if (beforeText) {
    parent.insertBefore(newDoc.createTextNode(beforeText), textNode);
  }

  const newElement = newDoc.createElement(tagName);
  newElement.textContent = selectedText;
  parent.insertBefore(newElement, textNode);

  if (afterText) {
    parent.insertBefore(newDoc.createTextNode(afterText), textNode);
  }

  parent.removeChild(textNode);
  return newDoc;
};

export const unwrapTag = (doc: Document, path: string): Document => {
  const newDoc = doc.cloneNode(true) as Document;
  const targetNode = getNodeByPath(newDoc, path);

  if (!targetNode || targetNode.nodeType !== Node.ELEMENT_NODE) {
    return doc;
  }

  const parent = targetNode.parentNode;
  if (!parent) return doc;

  while (targetNode.firstChild) {
    parent.insertBefore(targetNode.firstChild, targetNode);
  }

  parent.removeChild(targetNode);
  parent.normalize();

  return newDoc;
};

export const replaceNode = (doc: Document, path: string, newNode: Node): Document => {
    const newDoc = doc.cloneNode(true) as Document;
    const targetNode = getNodeByPath(newDoc, path);
    
    if (targetNode && targetNode.parentNode) {
        const importedNode = newDoc.importNode(newNode, true);
        targetNode.parentNode.replaceChild(importedNode, targetNode);
    }
    return newDoc;
};

export const acceptSuggestion = (doc: Document, path: string, payload: { mode: string, type: string }): Document => {
  const newDoc = doc.cloneNode(true) as Document;
  const targetNode = getNodeByPath(newDoc, path) as Element;

  if (!targetNode || targetNode.tagName !== 'suggestion') return doc;
  const parent = targetNode.parentNode;
  if (!parent) return doc;

  const { mode, type } = payload;

  if (mode === 'deletion') {
    // If it's a deletion suggestion, we want the text content but NO entity tags.
    const text = targetNode.textContent || "";
    const textNode = newDoc.createTextNode(text);
    parent.replaceChild(textNode, targetNode);
  } else {
    // For addition or correction, we wrap/replace with the new type
    const newElement = newDoc.createElement(type);
    newElement.textContent = targetNode.textContent;
    parent.replaceChild(newElement, targetNode);
  }

  parent.normalize();
  return newDoc;
};

export const declineSuggestion = (doc: Document, path: string): Document => {
  return unwrapTag(doc, path);
};

export interface PageInfo {
  id: string;
  path: string;
  node: Element;
}

export const getPages = (doc: Document): PageInfo[] => {
  const pages: PageInfo[] = [];

  const traverse = (node: Node, currentPath: string) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.tagName.toLowerCase() === 'div') {
        const id = el.getAttribute('xml:id') || el.getAttribute('id') || `page-${pages.length + 1}`;
        pages.push({
          id,
          path: currentPath,
          node: el
        });
        return;
      }
    }

    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const childPath = currentPath === "" ? `${i}` : `${currentPath}:${i}`;
        traverse(node.childNodes[i], childPath);
      }
    }
  };

  if (doc.childNodes) {
    for (let i = 0; i < doc.childNodes.length; i++) {
      traverse(doc.childNodes[i], `${i}`);
    }
  }

  return pages;
};

export const createSampleTEI = (): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Sample Document</title></titleStmt>
      <publicationStmt><p>Demo</p></publicationStmt>
      <sourceDesc><p>Generated for demo</p></sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div xml:id="page_01">
        <p>
          During his stay in <placeName>London</placeName>, <persName>Sherlock Holmes</persName> often visited <placeName>Hyde Park</placeName>.
          His companion, <persName>Dr. Watson</persName>, preferred the quiet of <placeName>Baker Street</placeName>.
        </p>
      </div>
      <div xml:id="page_02">
        <p>
          The mysterious letter was signed by a certain <name>Irene Adler</name>, who was known throughout <placeName>Europe</placeName>.
          It mentioned a meeting at the <placeName>Langham Hotel</placeName>.
        </p>
      </div>
      <div xml:id="page_03">
        <p>
          Select this text to test the auto-annotation feature. It mentions Albert Einstein visiting Berlin and meeting Max Planck.
        </p>
      </div>
    </body>
  </text>
</TEI>`;
};