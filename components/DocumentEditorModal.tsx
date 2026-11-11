import React, { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Minus,
  Undo,
  Redo,
  X,
  Plus,
  Trash2,
  Rows,
  Columns,
  Highlighter,
  Palette,
  Check,
  Calendar,
  FileText
} from 'lucide-react';

interface DocumentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (docData: { fileName: string; eventDate: string; content: string }) => Promise<void>;
  initialData?: {
    id?: string;
    fileName: string;
    eventDate?: string;
    content?: string;
  } | null;
  monthName: string;
}

const TEXT_COLORS = [
  { name: 'Negro', value: '#111827' },
  { name: 'Gris oscuro', value: '#4b5563' },
  { name: 'Azul', value: '#2563eb' },
  { name: 'Rojo', value: '#dc2626' },
  { name: 'Verde', value: '#16a34a' },
  { name: 'Ámbar', value: '#d97706' },
  { name: 'Púrpura', value: '#7c3aed' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Sin resaltar', value: 'transparent' },
  { name: 'Amarillo', value: '#fef08a' },
  { name: 'Verde suave', value: '#bbf7d0' },
  { name: 'Azul suave', value: '#bfdbfe' },
  { name: 'Rosa', value: '#fbcfe8' },
  { name: 'Naranja suave', value: '#fed7aa' },
];

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  monthName,
}) => {
  const [fileName, setFileName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName(initialData?.fileName || '');
      setEventDate(initialData?.eventDate || '');
      // Populate editor content on open
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = initialData?.content || '';
          if (!initialData?.content) {
            editorRef.current.focus();
          }
        }
      }, 50);
    }
  }, [isOpen, initialData]);

  // Handle escape to close editor (prompting if unsaved changes exist)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
  };

  const handleHeading = (tag: 'H1' | 'H2' | 'H3' | 'P') => {
    if (tag === 'P') {
      executeCommand('formatBlock', '<p>');
    } else {
      executeCommand('formatBlock', `<${tag.toLowerCase()}>`);
    }
  };

  // Image compression and insertion helper
  const compressAndInsertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDimension = 900;
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          insertImageHtml(dataUrl);
        } else {
          insertImageHtml(e.target?.result as string);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const insertImageHtml = (src: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const imgHtml = `<p><img src="${src}" alt="Imagen del documento" style="max-width: 100%; height: auto; border-radius: 8px; margin: 12px auto; display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" /></p><p><br></p>`;
    document.execCommand('insertHTML', false, imgHtml);
  };

  // Intercept Ctrl+V to paste images directly from clipboard!
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          compressAndInsertImage(file);
          return;
        }
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressAndInsertImage(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInsertImageUrl = () => {
    const url = window.prompt('Introduce la URL de la imagen:');
    if (url && url.trim()) {
      insertImageHtml(url.trim());
    }
  };

  const handleInsertLink = () => {
    const url = window.prompt('Introduce el enlace (URL):');
    if (url && url.trim()) {
      executeCommand('createLink', url.trim());
    }
  };

  // Table helpers
  const insertTable = (rows = 3, cols = 3) => {
    let html = `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #d1d5db;"><thead><tr>`;
    for (let c = 1; c <= cols; c++) {
      html += `<th style="border: 1px solid #d1d5db; padding: 10px 14px; background-color: #f3f4f6; font-weight: 700; text-align: left;">Horario / Título ${c}</th>`;
    }
    html += `</tr></thead><tbody>`;
    for (let r = 1; r < rows; r++) {
      html += `<tr>`;
      for (let c = 1; c <= cols; c++) {
        html += `<td style="border: 1px solid #d1d5db; padding: 10px 14px; min-width: 80px;">Dato ${r}.${c}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table><p><br></p>`;
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('insertHTML', false, html);
    setShowTableMenu(false);
  };

  const getClosestTableCell = (): HTMLTableCellElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeName === 'TD' || node.nodeName === 'TH') {
        return node as HTMLTableCellElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  const handleAddRow = () => {
    const cell = getClosestTableCell();
    if (!cell) {
      alert('Haz clic dentro de una tabla para añadir una fila');
      return;
    }
    const row = cell.parentElement as HTMLTableRowElement;
    const newRow = document.createElement('tr');
    for (let i = 0; i < row.cells.length; i++) {
      const newCell = document.createElement('td');
      newCell.style.border = '1px solid #d1d5db';
      newCell.style.padding = '10px 14px';
      newCell.innerHTML = '<br>';
      newRow.appendChild(newCell);
    }
    row.after(newRow);
  };

  const handleAddColumn = () => {
    const cell = getClosestTableCell();
    if (!cell) {
      alert('Haz clic dentro de una tabla para añadir una columna');
      return;
    }
    const table = cell.closest('table');
    if (!table) return;
    const colIndex = cell.cellIndex;
    for (let i = 0; i < table.rows.length; i++) {
      const r = table.rows[i];
      const isHeader = r.parentElement?.tagName === 'THEAD' || r.cells[0]?.tagName === 'TH';
      const newCell = document.createElement(isHeader ? 'th' : 'td');
      newCell.style.border = '1px solid #d1d5db';
      newCell.style.padding = '10px 14px';
      if (isHeader) {
        newCell.style.backgroundColor = '#f3f4f6';
        newCell.style.fontWeight = '700';
        newCell.innerText = 'Col';
      } else {
        newCell.innerHTML = '<br>';
      }
      if (r.cells[colIndex]) {
        r.cells[colIndex].after(newCell);
      } else {
        r.appendChild(newCell);
      }
    }
  };

  const handleDeleteRow = () => {
    const cell = getClosestTableCell();
    if (!cell) {
      alert('Haz clic dentro de una tabla para eliminar la fila');
      return;
    }
    const row = cell.parentElement as HTMLTableRowElement;
    row.remove();
  };

  const handleDeleteColumn = () => {
    const cell = getClosestTableCell();
    if (!cell) {
      alert('Haz clic dentro de una tabla para eliminar la columna');
      return;
    }
    const table = cell.closest('table');
    if (!table) return;
    const colIndex = cell.cellIndex;
    for (let i = 0; i < table.rows.length; i++) {
      if (table.rows[i].cells[colIndex]) {
        table.rows[i].cells[colIndex].remove();
      }
    }
  };

  const handleDeleteTable = () => {
    const cell = getClosestTableCell();
    if (!cell) {
      alert('Haz clic dentro de una tabla para eliminarla');
      return;
    }
    const table = cell.closest('table');
    table?.remove();
  };

  const handleSaveDocument = async () => {
    if (!fileName.trim()) {
      alert('Por favor introduce un nombre para el documento.');
      return;
    }
    const content = editorRef.current?.innerHTML || '';
    setIsSaving(true);
    try {
      await onSave({
        fileName: fileName.trim(),
        eventDate: eventDate || '',
        content,
      });
      onClose();
    } catch (error) {
      console.error('Error saving document:', error);
      alert('Error al guardar el documento. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900/90 backdrop-blur-md">
      {/* Hidden file input for uploading images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* TOP HEADER BAR */}
      <div className="bg-slate-900 border-b border-slate-800 text-white px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-rose-500/20 text-rose-400 p-2 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              {initialData?.id ? 'Editar Documento' : `Añadir Documento a ${monthName}`}
            </h2>
            <p className="text-[11px] text-slate-400">
              Redacta y formatea el documento directamente en la app
            </p>
          </div>
        </div>

        {/* Inputs for Name and Date */}
        <div className="flex flex-wrap items-center gap-2 flex-grow max-w-2xl justify-end">
          <div className="flex items-center gap-1.5 flex-grow sm:max-w-xs">
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Nombre del documento (ej: Menú Gala)"
              className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-sm text-slate-300">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none cursor-pointer"
              title="Fecha del evento (opcional)"
            />
          </div>

          <div className="flex items-center gap-2 ml-1">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveDocument}
              disabled={isSaving || !fileName.trim()}
              className="px-4 py-1.5 text-sm font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Documento'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1"
              title="Cerrar (Escape)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* RICH TEXT FORMATTING TOOLBAR */}
      <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-1 overflow-x-auto select-none shrink-0 shadow-xs">
        {/* Undo / Redo */}
        <button
          onClick={() => executeCommand('undo')}
          title="Deshacer (Ctrl+Z)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('redo')}
          title="Rehacer (Ctrl+Y)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Redo className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Headings */}
        <select
          onChange={(e) => handleHeading(e.target.value as any)}
          defaultValue="P"
          className="px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none"
          title="Estilo de párrafo / Título"
        >
          <option value="P">Texto normal</option>
          <option value="H1">Título 1 (Grande)</option>
          <option value="H2">Título 2 (Medio)</option>
          <option value="H3">Título 3 (Pequeño)</option>
        </select>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Basic Text Formatting */}
        <button
          onClick={() => executeCommand('bold')}
          title="Negrita (Ctrl+B)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('italic')}
          title="Cursiva (Ctrl+I)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('underline')}
          title="Subrayado (Ctrl+U)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Underline className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('strikeThrough')}
          title="Tachado"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Text Color */}
        <div className="relative">
          <button
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowHighlightPicker(false);
              setShowTableMenu(false);
            }}
            title="Color de texto"
            className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-0.5"
          >
            <Palette className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 z-50 grid grid-cols-4 gap-1.5 w-36">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    executeCommand('foreColor', c.value);
                    setShowColorPicker(false);
                  }}
                  className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 transition-transform hover:scale-110"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <button
            onClick={() => {
              setShowHighlightPicker(!showHighlightPicker);
              setShowColorPicker(false);
              setShowTableMenu(false);
            }}
            title="Color de resaltado"
            className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-0.5"
          >
            <Highlighter className="w-4 h-4 text-amber-500" />
          </button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 z-50 flex flex-col gap-1 w-36">
              {HIGHLIGHT_COLORS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => {
                    executeCommand('hiliteColor', h.value);
                    setShowHighlightPicker(false);
                  }}
                  className="px-2 py-1 text-xs rounded text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-slate-400"
                    style={{ backgroundColor: h.value === 'transparent' ? '#fff' : h.value }}
                  />
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Lists */}
        <button
          onClick={() => executeCommand('insertUnorderedList')}
          title="Lista con viñetas"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('insertOrderedList')}
          title="Lista numerada"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Alignment */}
        <button
          onClick={() => executeCommand('justifyLeft')}
          title="Alinear a la izquierda"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('justifyCenter')}
          title="Centrar"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('justifyRight')}
          title="Alinear a la derecha"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => executeCommand('justifyFull')}
          title="Justificar"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <AlignJustify className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Table Controls Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowTableMenu(!showTableMenu);
              setShowColorPicker(false);
              setShowHighlightPicker(false);
            }}
            title="Herramientas de Tabla (horarios, montajes)"
            className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <TableIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Tabla</span>
          </button>

          {showTableMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 z-50 flex flex-col gap-1 w-48 text-xs text-slate-800 dark:text-slate-200">
              <button
                onClick={() => insertTable(3, 3)}
                className="px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold flex items-center gap-2 text-left"
              >
                <Plus className="w-3.5 h-3.5" /> Insertar Tabla (3x3)
              </button>
              <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
              <button
                onClick={handleAddRow}
                className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-left"
              >
                <Rows className="w-3.5 h-3.5 text-slate-500" /> Añadir fila abajo
              </button>
              <button
                onClick={handleAddColumn}
                className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-left"
              >
                <Columns className="w-3.5 h-3.5 text-slate-500" /> Añadir columna der.
              </button>
              <button
                onClick={handleDeleteRow}
                className="px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-left"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar fila
              </button>
              <button
                onClick={handleDeleteColumn}
                className="px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-left"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar columna
              </button>
              <button
                onClick={handleDeleteTable}
                className="px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-left font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" /> Borrar tabla entera
              </button>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Images */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Subir imagen (o pega con Ctrl+V)"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">Imagen</span>
        </button>
        <button
          onClick={handleInsertImageUrl}
          title="Insertar imagen mediante URL"
          className="p-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
        >
          URL
        </button>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Links */}
        <button
          onClick={handleInsertLink}
          title="Insertar enlace"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
        </button>

        {/* Divider / Line */}
        <button
          onClick={() => executeCommand('insertHorizontalRule')}
          title="Insertar línea separadora"
          className="p-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>

        <span className="ml-auto text-[11px] text-slate-400 italic hidden lg:inline">
          Consejo: Puedes pegar imágenes directamente con Ctrl+V
        </span>
      </div>

      {/* WYSIWYG STYLING FOR EDITOR CANVAS */}
      <style>{`
        .document-editor-sheet h1 {
          font-size: 2rem;
          font-weight: 800;
          color: #111827;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.25rem;
        }
        .document-editor-sheet h2 {
          font-size: 1.55rem;
          font-weight: 700;
          color: #1f2937;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
        }
        .document-editor-sheet h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #374151;
          margin-top: 0.85rem;
          margin-bottom: 0.35rem;
        }
        .document-editor-sheet p {
          margin-bottom: 0.75rem;
          line-height: 1.65;
          color: #1f2937;
        }
        .document-editor-sheet ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .document-editor-sheet ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .document-editor-sheet li {
          margin-bottom: 0.25rem;
        }
        .document-editor-sheet table {
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin: 1rem 0;
          border: 1px solid #d1d5db;
          word-break: break-word;
        }
        .document-editor-sheet th {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          background-color: #f3f4f6;
          font-weight: 700;
          text-align: left;
        }
        .document-editor-sheet td {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          vertical-align: top;
        }
        .document-editor-sheet hr {
          border: 0;
          border-top: 1px solid #d1d5db;
          margin: 1.5rem 0;
        }
        .document-editor-sheet img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 1rem auto;
          display: block;
        }
        .document-editor-sheet a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>

      {/* EDITOR CANVAS (HOJA DIN A4 CENTRADA Y COMPLETAMENTE VISIBLE) */}
      <div
        className="flex-grow overflow-y-auto overflow-x-auto bg-slate-200/90 dark:bg-slate-950 p-3 sm:p-6 pb-28 flex justify-center cursor-text"
        onClick={(e) => {
          if (e.target === e.currentTarget && editorRef.current) {
            editorRef.current.focus();
          }
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          onPaste={handlePaste}
          className="document-editor-sheet w-full max-w-[794px] min-h-[1123px] bg-white text-slate-900 shadow-2xl rounded-sm border border-slate-300 p-8 sm:p-14 pb-28 focus:outline-none focus:ring-2 focus:ring-blue-400/50 leading-relaxed text-base font-sans mx-auto box-border"
          style={{
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
          data-placeholder="Escribe aquí el contenido del documento. Puedes añadir títulos, listas, tablas de horarios o montajes, imágenes pegadas con Ctrl+V..."
        />
      </div>
    </div>
  );
};

export default DocumentEditorModal;
