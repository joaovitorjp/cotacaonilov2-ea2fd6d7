import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Copy, ClipboardPaste, Bold, Italic, Paintbrush, X, Save, Percent, Search, MapPin, Trash2, Plus, Swords, Trash, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEstadosUsuario } from '@/hooks/useEstadosUsuario';
import { ufNome, getPrecoUF, hasPrecoUF, buildPrecosPayload, ufsDaResposta, ordenarUFs, TIPO_LABELS, FRETE_LABELS } from '@/lib/estados';

interface Produto {
  codigo_interno: string;
  descricao: string;
  codigo_barras: string;
  categoria?: string;
  observacao?: string;
}

interface RespostaEmpresa {
  empresa: string;
  resposta: { codigo_interno: string; preco?: number | string; preco_mt?: number | string; preco_go?: number | string; precos?: Record<string, number | string>; __manual_states?: string[] }[];
}

interface SpreadsheetTableProps {
  produtos: Produto[];
  respostas: RespostaEmpresa[];
  readOnly?: boolean;
  editableColumn?: string;
  onPriceChange?: (rowIndex: number, preco: string) => void;
  editPrices?: Record<number, string>;
  highlightLowest?: boolean;
  onSave?: (produtos: Produto[]) => void;
  listaId?: string;
  onDeleteResposta?: (empresa: string) => Promise<void>;
  onAfterSave?: () => void;
  onAddEmpresa?: (empresa: string, states: string[]) => Promise<void>;
  tipoPrecoMap?: Record<string, string>;

}

const parsePrice = (val: string | number): number => {
  if (typeof val === 'number') return val;
  if (!val || String(val).trim() === '') return Infinity;
  // Aceita "3,89", "3.89", "1.234,56", "R$ 3,89" etc.
  const clean = String(val).replace(/[^\d.,-]/g, '');
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const num = parseFloat(normalized);
  return isNaN(num) ? Infinity : num;
};

export const tipoPrecoLabel = (t?: string) => (t === 'NOTA' ? 'PREÇO NOTA' : 'IPI + ST');

const MIN_COL_WIDTH = 40;

const MIN_ROW_HEIGHT = 21;
const DEFAULT_ROW_HEIGHT = 25;
const HEADER_HEIGHT = 40;
const EMPTY_ROWS = 30;
const EMPTY_COLS = 8;

type TextAlign = 'left' | 'center' | 'right';
type StateFilter = string; // UF or '__ALL__'
const ALL_STATES = '__ALL__';

interface CellPos { row: number; col: number; }

interface ContextMenuState {
  x: number; y: number;
  type: 'cell' | 'column' | 'row';
  colIdx?: number; rowIdx?: number;
}

interface ColDef {
  key: string;
  label: string;
  defaultAlign: TextAlign;
  isData: boolean;
  originalIdx: number;
  sticky?: boolean;
  highlight?: boolean;
  isSeparator?: boolean;
  state?: string;
  empresa?: string;
}

const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({
  produtos, respostas, readOnly = false, editableColumn, onPriceChange,
  editPrices = {}, highlightLowest = false, onSave, listaId, onDeleteResposta,
  onAfterSave, onAddEmpresa, tipoPrecoMap = {},
}) => {
  const { user } = useAuth();
  const { estados: userEstados } = useEstadosUsuario();
  const empresas = useMemo(() => respostas.map(r => r.empresa), [respostas]);

  // Dynamic UFs: union of UFs present in respostas, ordered by user preference; fallback to user's configured states
  const ufs = useMemo(() => {
    const set = new Set<string>();
    for (const r of respostas) {
      for (const uf of ufsDaResposta(r.resposta as any)) set.add(uf);
    }
    if (set.size === 0) {
      for (const uf of userEstados) set.add(uf);
    }
    return ordenarUFs(Array.from(set), userEstados);
  }, [respostas, userEstados]);

  // State filter
  const [stateFilter, setStateFilter] = useState<StateFilter>(ALL_STATES);

  // Check if an empresa has ANY data for a given state
  const empresaHasData = useCallback((empresa: string, state: string): boolean => {
    const resp = respostas.find(r => r.empresa === empresa);
    if (!resp) return false;
    return resp.resposta.some((item: any) => {
      if (Array.isArray(item?.__manual_states) && item.__manual_states.includes(state)) return true;
      return hasPrecoUF(item, state);
    });
  }, [respostas]);

  // Build a fast lookup map
  const precoMap = useMemo(() => {
    const map: Record<string, Record<string, number | string>> = {};
    for (const r of respostas) {
      for (const uf of ufs) {
        const inner: Record<string, number | string> = {};
        for (const item of r.resposta) {
          const v = getPrecoUF(item as any, uf);
          if (v !== undefined && v !== '') inner[item.codigo_interno] = v;
        }
        map[`${r.empresa}_${uf}`] = inner;
      }
    }
    return map;
  }, [respostas, ufs]);

  const [cellEdits, setCellEdits] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const getPreco = useCallback((empresa: string, state: string, codigoInterno: string) => {
    return precoMap[`${empresa}_${state}`]?.[codigoInterno] ?? '';
  }, [precoMap]);

  const getLowestEmpresa = useCallback((codigoInterno: string, state: string): string | null => {
    if (!highlightLowest || empresas.length === 0) return null;
    let lowest = Infinity;
    let lowestEmp: string | null = null;
    for (const emp of empresas) {
      const raw = getPreco(emp, state, codigoInterno);
      const val = parsePrice(raw as string | number);
      if (val < lowest && val > 0) { lowest = val; lowestEmp = emp; }
    }
    return lowestEmp;
  }, [highlightLowest, empresas, getPreco]);

  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [activeColResize, setActiveColResize] = useState<number | null>(null);
  const [activeRowResize, setActiveRowResize] = useState<number | null>(null);

  const [cellAligns, setCellAligns] = useState<Record<string, TextAlign>>({});
  const [colAligns, setColAligns] = useState<Record<number, TextAlign>>({});
  const [rowAligns, setRowAligns] = useState<Record<number, TextAlign>>({});

  const [cellBold, setCellBold] = useState<Record<string, boolean>>({});
  const [cellItalic, setCellItalic] = useState<Record<string, boolean>>({});
  const [cellBgColor, setCellBgColor] = useState<Record<string, string>>({});
  const [colBold, setColBold] = useState<Record<number, boolean>>({});
  const [colItalic, setColItalic] = useState<Record<number, boolean>>({});
  const [colBgColor, setColBgColor] = useState<Record<number, string>>({});
  const [rowBold, setRowBold] = useState<Record<number, boolean>>({});
  const [rowItalic, setRowItalic] = useState<Record<number, boolean>>({});
  const [rowBgColor, setRowBgColor] = useState<Record<number, string>>({});

  const [colOrder, setColOrder] = useState<number[]>([]);
  const [rowOrder, setRowOrder] = useState<number[]>([]);

  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [winnerFilter, setWinnerFilter] = useState<{ empresa: string; state: string } | null>(null);

  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<CellPos | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellPos | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const tableRef = useRef<HTMLTableElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Build ALL column definitions (unfiltered)
  const allColDefs = useMemo((): ColDef[] => {
    const cols: ColDef[] = [
      { key: '#', label: '', defaultAlign: 'center', isData: false, originalIdx: 0 },
      { key: 'cod_int', label: 'Código Interno', defaultAlign: 'center', sticky: true, isData: true, originalIdx: 1 },
      { key: 'desc', label: 'Descrição', defaultAlign: 'left', isData: true, originalIdx: 2 },
      { key: 'cod_bar', label: 'Código de Barras', defaultAlign: 'center', isData: true, originalIdx: 3 },
    ];
    let idx = 4;
    ufs.forEach((uf, ufIdx) => {
      for (let i = 0; i < empresas.length; i++) {
        cols.push({
          key: `emp_${empresas[i]}_${uf}`, label: `${empresas[i]} ${uf}`, defaultAlign: 'center',
          highlight: editableColumn === empresas[i], isData: true, originalIdx: idx++,
          state: uf, empresa: empresas[i],
        });
      }
      if (editableColumn && !empresas.includes(editableColumn)) {
        cols.push({
          key: `emp_${editableColumn}_${uf}`, label: `${editableColumn} ${uf}`, defaultAlign: 'center',
          highlight: true, isData: true, originalIdx: idx++, state: uf, empresa: editableColumn,
        });
      }
      if (ufIdx < ufs.length - 1) {
        cols.push({ key: `separator_${uf}`, label: '', defaultAlign: 'center', isData: false, isSeparator: true, originalIdx: idx++ });
      }
    });
    return cols;
  }, [empresas, editableColumn, ufs]);

  // Filter columns based on state filter and remove empty empresa columns, then add fillers
  const baseColDefs = useMemo((): ColDef[] => {
    let filtered: ColDef[];
    if (stateFilter === ALL_STATES) {
      filtered = allColDefs;
    } else {
      filtered = allColDefs.filter(c => {
        if (c.isSeparator) return false;
        if (c.state && c.state !== stateFilter) return false;
        return true;
      });
    }
    // Remove empresa columns that have NO data at all
    filtered = filtered.filter(c => {
      if (!c.empresa || !c.state) return true;
      return empresaHasData(c.empresa, c.state);
    });
    // Add filler columns to fill remaining container space
    const FILLER_WIDTH = 80;
    // Use generous filler count to always fill viewport; extra fillers beyond viewport are harmless
    const fillerCount = Math.max(EMPTY_COLS, 20);
    let maxIdx = filtered.reduce((m, c) => Math.max(m, c.originalIdx), 0);
    const fillers: ColDef[] = [];
    for (let i = 0; i < fillerCount; i++) {
      fillers.push({ key: `filler_${i}`, label: '', defaultAlign: 'center', isData: false, originalIdx: ++maxIdx });
    }
    return [...filtered, ...fillers];
  }, [allColDefs, stateFilter, empresaHasData]);

  const fillerRows = produtos.length > 0 ? Math.max(0, EMPTY_ROWS - produtos.length) : EMPTY_ROWS;

  // Initialize column order when baseColDefs changes
  useEffect(() => {
    setColOrder(baseColDefs.map((_, i) => i));
    // Reset colWidths on filter change to trigger auto-fit
    setColWidths({});
  }, [baseColDefs.length, stateFilter]);

  useEffect(() => {
    const total = produtos.length + fillerRows;
    setRowOrder(Array.from({ length: total }, (_, i) => i));
  }, [produtos.length, fillerRows]);

  const orderedColDefs = useMemo(() =>
    colOrder.length === baseColDefs.length
      ? colOrder.map(i => ({ ...baseColDefs[i], orderIdx: i }))
      : baseColDefs.map((c, i) => ({ ...c, orderIdx: i })),
    [colOrder, baseColDefs]
  );

  const totalRows = produtos.length + fillerRows;

  // Measure header text widths to enforce as minimums
  const headerMinWidths = useRef<Record<number, number>>({});

  // Auto-fit column widths - debounced, runs once after data settles
  const autoFitRan = useRef(false);
  useEffect(() => {
    autoFitRan.current = false;
  }, [stateFilter, empresas.length, produtos.length]);

  useEffect(() => {
    if (!tableRef.current || !containerRef.current || autoFitRan.current) return;
    const timer = setTimeout(() => {
      if (!tableRef.current || !containerRef.current) return;
      autoFitRan.current = true;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = '600 11px system-ui, sans-serif'; // matches header font

      const newWidths: Record<number, number> = {};
      const newHeaderMins: Record<number, number> = {};
      const totalCols = orderedColDefs.length;

      for (let i = 0; i < totalCols; i++) {
        const col = orderedColDefs[i];
        if (col.isSeparator) { newWidths[i] = 8; newHeaderMins[i] = 8; continue; }
        if (col.key.startsWith('filler_')) continue;

        // Measure header text width
        const headerText = col.label;
        const headerW = ctx.measureText(headerText).width + 28; // padding + sort icon space

        // Measure content via DOM (sample first 50 rows for performance)
        let maxContentW = 0;
        const cells = tableRef.current!.querySelectorAll(`tbody td:nth-child(${i + 1})`);
        let measured = 0;
        cells.forEach(cell => {
          if (measured >= 50) return;
          measured++;
          const el = cell as HTMLElement;
          const text = el.textContent || '';
          if (!text.trim()) return;
          ctx.font = '12px system-ui, sans-serif';
          const w = ctx.measureText(text).width + 20; // padding
          if (w > maxContentW) maxContentW = w;
        });

        const minW = i === 0 ? 36 : Math.max(MIN_COL_WIDTH, headerW);
        newHeaderMins[i] = minW;
        newWidths[i] = Math.max(minW, maxContentW, i === 2 ? 180 : i === 0 ? 36 : 70);
      }

      // Set filler columns to standard width
      for (let i = 0; i < totalCols; i++) {
        const col = orderedColDefs[i];
        if (col.key.startsWith('filler_')) {
          newWidths[i] = 80;
          newHeaderMins[i] = 80;
        }
      }

      headerMinWidths.current = newHeaderMins;
      setColWidths(newWidths);
    }, 120);
    return () => clearTimeout(timer);
  }, [baseColDefs, produtos, respostas, orderedColDefs]);

  const getColWidth = useCallback((i: number) => colWidths[i] || (i === 0 ? 36 : i === 2 ? 180 : 70), [colWidths]);

  const getCellAlign = (colIdx: number, rowIdx: number, defaultAlign: TextAlign): TextAlign => {
    const cellKey = `${rowIdx}-${colIdx}`;
    if (cellAligns[cellKey]) return cellAligns[cellKey];
    if (rowAligns[rowIdx]) return rowAligns[rowIdx];
    if (colAligns[colIdx]) return colAligns[colIdx];
    return defaultAlign;
  };

  const alignClass = (align: TextAlign) => align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';

  const getCellFormatting = (colIdx: number, rowIdx: number) => {
    const key = `${rowIdx}-${colIdx}`;
    return {
      bold: cellBold[key] ?? rowBold[rowIdx] ?? colBold[colIdx] ?? false,
      italic: cellItalic[key] ?? rowItalic[rowIdx] ?? colItalic[colIdx] ?? false,
      bgColor: cellBgColor[key] || rowBgColor[rowIdx] || colBgColor[colIdx] || '',
    };
  };

  const getSelectionRange = useCallback(() => {
    if (!selectionAnchor || !selectionEnd) {
      if (activeCell) return { minRow: activeCell.row, maxRow: activeCell.row, minCol: activeCell.col, maxCol: activeCell.col };
      return null;
    }
    return {
      minRow: Math.min(selectionAnchor.row, selectionEnd.row),
      maxRow: Math.max(selectionAnchor.row, selectionEnd.row),
      minCol: Math.min(selectionAnchor.col, selectionEnd.col),
      maxCol: Math.max(selectionAnchor.col, selectionEnd.col),
    };
  }, [selectionAnchor, selectionEnd, activeCell]);

  const isCellSelected = useCallback((row: number, col: number): boolean => {
    const range = getSelectionRange();
    if (!range) return false;
    return row >= range.minRow && row <= range.maxRow && col >= range.minCol && col <= range.maxCol;
  }, [getSelectionRange]);

  const isCellActive = useCallback((row: number, col: number): boolean => {
    return activeCell?.row === row && activeCell?.col === col;
  }, [activeCell]);

  const getCellValue = useCallback((rowIdx: number, colIdx: number): string => {
    if (rowIdx >= produtos.length) return '';
    const prod = produtos[rowIdx];
    const colDef = orderedColDefs[colIdx];
    if (!colDef) return '';
    const origIdx = colDef.originalIdx;
    if (origIdx === 0) return String(rowIdx + 1);
    if (origIdx === 1) return prod.codigo_interno;
    if (origIdx === 2) return prod.descricao;
    if (origIdx === 3) return prod.codigo_barras;
    if (colDef.state && colDef.empresa) {
      const emp = colDef.empresa;
      if (editableColumn === emp && editPrices[rowIdx] !== undefined) return editPrices[rowIdx];
      const raw = getPreco(emp, colDef.state, prod.codigo_interno);
      if (raw === '' || raw === undefined || raw === null) return 'R$ -';
      const num = parsePrice(raw as string | number);
      return num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
    }
    return '';
  }, [produtos, orderedColDefs, editableColumn, editPrices, getPreco]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (col === 0) return;
    if (e.shiftKey && activeCell) {
      setSelectionEnd({ row, col });
    } else {
      setActiveCell({ row, col });
      setSelectionAnchor({ row, col });
      setSelectionEnd({ row, col });
    }
    setContextMenu(null);
  }, [activeCell]);

  const handleCellDoubleClick = useCallback((row: number, visualCol: number, origIdx: number) => {
    if (readOnly) return;
    const editKey = `${row}-${origIdx}`;
    let currentVal = cellEdits[editKey];
    if (currentVal === undefined && row < produtos.length) {
      const prod = produtos[row];
      const colDef = orderedColDefs.find(c => c.originalIdx === origIdx);
      if (origIdx === 1) currentVal = prod.codigo_interno;
      else if (origIdx === 2) currentVal = prod.descricao;
      else if (origIdx === 3) currentVal = prod.codigo_barras;
      else if (colDef?.state && colDef?.empresa) {
        const raw = getPreco(colDef.empresa, colDef.state, prod.codigo_interno);
        if (raw === '' || raw === undefined || raw === null) currentVal = '';
        else {
          const num = parsePrice(raw as string | number);
          currentVal = num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
        }
      } else currentVal = '';
    }
    setEditingCell({ row, col: visualCol });
    setEditingValue(currentVal ?? '');
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, [readOnly, cellEdits, produtos, orderedColDefs, getPreco]);

  const commitEdit = useCallback((origIdx: number) => {
    if (!editingCell) return;
    const editKey = `${editingCell.row}-${origIdx}`;
    setCellEdits(prev => ({ ...prev, [editKey]: editingValue }));
    setHasUnsavedChanges(true);
    setEditingCell(null);
  }, [editingCell, editingValue]);

  const cancelEdit = useCallback(() => setEditingCell(null), []);

  const getDisplayValue = useCallback((row: number, origIdx: number): string => {
    const editKey = `${row}-${origIdx}`;
    if (cellEdits[editKey] !== undefined) return cellEdits[editKey];
    if (row >= produtos.length) return '';
    const prod = produtos[row];
    if (origIdx === 1) return prod.codigo_interno;
    if (origIdx === 2) return prod.descricao;
    if (origIdx === 3) return prod.codigo_barras;
    // Use allColDefs to find by originalIdx (works regardless of filter)
    const colDef = allColDefs.find(c => c.originalIdx === origIdx);
    if (colDef?.state && colDef?.empresa) {
      const raw = getPreco(colDef.empresa, colDef.state, prod.codigo_interno);
      if (raw === '' || raw === undefined || raw === null) return '';
      const num = parsePrice(raw as string | number);
      return num === Infinity ? String(raw) : Number(num).toFixed(2).replace('.', ',');
    }
    return '';
  }, [cellEdits, produtos, allColDefs, getPreco]);

  // Save handler
  const handleSave = useCallback(async () => {
    const updated = produtos.map((prod, rowIdx) => ({
      codigo_interno: cellEdits[`${rowIdx}-1`] ?? prod.codigo_interno,
      descricao: cellEdits[`${rowIdx}-2`] ?? prod.descricao,
      codigo_barras: cellEdits[`${rowIdx}-3`] ?? prod.codigo_barras,
    }));
    if (onSave) onSave(updated);

    if (listaId) {
      const priceEditsByEmpresa: Record<string, { rowIdx: number; value: string; state: string }[]> = {};
      for (const [key, value] of Object.entries(cellEdits)) {
        const [rowStr, origIdxStr] = key.split('-');
        const rowIdx = parseInt(rowStr);
        const origIdx = parseInt(origIdxStr);
        if (rowIdx >= produtos.length) continue;
        const colDef = allColDefs.find(c => c.originalIdx === origIdx);
        if (colDef?.state && colDef?.empresa) {
          const emp = colDef.empresa;
          if (!priceEditsByEmpresa[emp]) priceEditsByEmpresa[emp] = [];
          priceEditsByEmpresa[emp].push({ rowIdx, value, state: colDef.state });
        }
      }

      for (const [emp, edits] of Object.entries(priceEditsByEmpresa)) {
        const existingResp = respostas.find(r => r.empresa === emp);
        const currentItems: any[] = existingResp ? [...existingResp.resposta] : [];
        for (const edit of edits) {
          const prod = produtos[edit.rowIdx];
          const normalized = edit.value.replace(/\./g, '').replace(',', '.');
          const numVal = parseFloat(normalized);
          const preco = isNaN(numVal) ? 0 : numVal;
          const existingIdx = currentItems.findIndex((i: any) => i.codigo_interno === prod.codigo_interno);
          const payload = buildPrecosPayload({ [edit.state]: String(preco) });
          const mergedPrecos = { ...(existingIdx >= 0 ? currentItems[existingIdx]?.precos : undefined), ...payload.precos };
          const extra: any = { precos: mergedPrecos };
          if (payload.preco_mt !== undefined) extra.preco_mt = payload.preco_mt;
          if (payload.preco_go !== undefined) extra.preco_go = payload.preco_go;
          if (existingIdx >= 0) {
            currentItems[existingIdx] = { ...currentItems[existingIdx], ...extra };
          } else {
            currentItems.push({ codigo_interno: prod.codigo_interno, ...extra });
          }
        }
        if (existingResp) {
          await supabase.from('respostas').update({ resposta: currentItems as any }).eq('lista_id', listaId).eq('empresa', emp).eq('user_id', user?.id ?? '');
        } else {
          await supabase.from('respostas').insert({ lista_id: listaId, empresa: emp, resposta: currentItems as any, user_id: user?.id });
        }
      }
    }
    setCellEdits({});
    setHasUnsavedChanges(false);
    if (onAfterSave) onAfterSave();
  }, [onSave, produtos, cellEdits, allColDefs, respostas, listaId, onAfterSave]);

  // Mouse selection
  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (col === 0 || e.button !== 0 || e.shiftKey) return;
    setIsSelecting(true);
    setActiveCell({ row, col });
    setSelectionAnchor({ row, col });
    setSelectionEnd({ row, col });
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isSelecting || col === 0) return;
    setSelectionEnd({ row, col });
  }, [isSelecting]);

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && !['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) return;
      const maxCol = orderedColDefs.length - 1;
      const maxRow = totalRows - 1;
      let newRow = activeCell.row;
      let newCol = activeCell.col;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); newRow = Math.max(0, activeCell.row - 1); break;
        case 'ArrowDown': e.preventDefault(); newRow = Math.min(maxRow, activeCell.row + 1); break;
        case 'ArrowLeft':
          if (target.tagName === 'INPUT') return;
          e.preventDefault(); newCol = Math.max(1, activeCell.col - 1); break;
        case 'ArrowRight':
          if (target.tagName === 'INPUT') return;
          e.preventDefault(); newCol = Math.min(maxCol, activeCell.col + 1); break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { newCol = activeCell.col - 1; if (newCol < 1) { newCol = maxCol; newRow = Math.max(0, activeCell.row - 1); } }
          else { newCol = activeCell.col + 1; if (newCol > maxCol) { newCol = 1; newRow = Math.min(maxRow, activeCell.row + 1); } }
          break;
        case 'Enter':
          e.preventDefault();
          newRow = e.shiftKey ? Math.max(0, activeCell.row - 1) : Math.min(maxRow, activeCell.row + 1);
          break;
        case 'Escape':
          setActiveCell(null); setSelectionAnchor(null); setSelectionEnd(null); return;
        default: return;
      }
      const pos = { row: newRow, col: newCol };
      setActiveCell(pos);
      if (e.shiftKey && e.key.startsWith('Arrow')) setSelectionEnd(pos);
      else { setSelectionAnchor(pos); setSelectionEnd(pos); }
      const cell = tableRef.current?.querySelector(`[data-cell="${newRow}-${newCol}"]`) as HTMLElement;
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, orderedColDefs.length, totalRows]);

  // Copy
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const range = getSelectionRange();
      if (!range) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.selectionStart !== input.selectionEnd) return;
      }
      e.preventDefault();
      const lines: string[] = [];
      for (let r = range.minRow; r <= range.maxRow; r++) {
        const cells: string[] = [];
        for (let c = range.minCol; c <= range.maxCol; c++) cells.push(getCellValue(r, c));
        lines.push(cells.join('\t'));
      }
      e.clipboardData?.setData('text/plain', lines.join('\n'));
    };
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [getSelectionRange, getCellValue]);

  // Paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!activeCell || readOnly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      const lines = text.split('\n').map(l => l.split('\t'));
      for (let r = 0; r < lines.length; r++) {
        for (let c = 0; c < lines[r].length; c++) {
          const targetRow = activeCell.row + r;
          const targetCol = activeCell.col + c;
          if (targetRow >= produtos.length) continue;
          const colDef = orderedColDefs[targetCol];
          if (!colDef) continue;
          const origIdx = colDef.originalIdx;
          const isEditableEmpCol = origIdx >= 4 && editableColumn && (
            (origIdx < 4 + empresas.length && empresas[origIdx - 4] === editableColumn) ||
            (!empresas.includes(editableColumn) && origIdx === 4 + empresas.length)
          );
          if (isEditableEmpCol) onPriceChange?.(targetRow, lines[r][c]);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [activeCell, readOnly, orderedColDefs, editableColumn, empresas, produtos.length, onPriceChange]);

  // Column resize
  const handleColResizeStart = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = getColWidth(colIdx);
    setActiveColResize(colIdx);
    const minW = headerMinWidths.current[colIdx] || MIN_COL_WIDTH;
    const onMouseMove = (ev: MouseEvent) => {
      setColWidths(prev => ({ ...prev, [colIdx]: Math.max(minW, startW + ev.clientX - startX) }));
    };
    const onMouseUp = () => {
      setActiveColResize(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [getColWidth]);

  // Row resize
  const handleRowResizeStart = useCallback((e: React.MouseEvent, rowIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const startH = rowHeights[rowIdx] || DEFAULT_ROW_HEIGHT;
    setActiveRowResize(rowIdx);
    const onMouseMove = (ev: MouseEvent) => {
      setRowHeights(prev => ({ ...prev, [rowIdx]: Math.max(MIN_ROW_HEIGHT, startH + ev.clientY - startY) }));
    };
    const onMouseUp = () => {
      setActiveRowResize(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [rowHeights]);

  const handleColAutoFit = useCallback((colIdx: number) => {
    if (!tableRef.current) return;
    const cells = tableRef.current.querySelectorAll(`thead th:nth-child(${colIdx + 1}), tbody td:nth-child(${colIdx + 1})`);
    let max = MIN_COL_WIDTH;
    cells.forEach(cell => {
      const el = cell as HTMLElement;
      const prev = el.style.width; el.style.width = 'auto';
      const w = el.scrollWidth + 12; el.style.width = prev;
      if (w > max) max = w;
    });
    setColWidths(prev => ({ ...prev, [colIdx]: max }));
  }, []);

  const handleRowAutoFit = useCallback((rowIdx: number) => {
    setRowHeights(prev => { const copy = { ...prev }; delete copy[rowIdx]; return copy; });
  }, []);

  // Column drag
  const handleColDragStart = (e: React.DragEvent, colIdx: number) => { if (colIdx === 0) return; e.dataTransfer.effectAllowed = 'move'; setDragCol(colIdx); };
  const handleColDragOver = (e: React.DragEvent, colIdx: number) => { if (dragCol === null || colIdx === 0) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(colIdx); };
  const handleColDrop = (e: React.DragEvent, colIdx: number) => {
    e.preventDefault();
    if (dragCol === null || dragCol === colIdx || colIdx === 0) { setDragCol(null); setDragOverCol(null); return; }
    setColOrder(prev => {
      const order = [...prev]; const fromPos = order.indexOf(dragCol); const toPos = order.indexOf(colIdx);
      if (fromPos === -1 || toPos === -1) return order;
      const [moved] = order.splice(fromPos, 1); order.splice(toPos, 0, moved); return order;
    });
    setDragCol(null); setDragOverCol(null);
  };
  const handleColDragEnd = () => { setDragCol(null); setDragOverCol(null); };

  // Row drag
  const handleRowDragStart = (e: React.DragEvent, rowIdx: number) => { e.dataTransfer.effectAllowed = 'move'; setDragRow(rowIdx); };
  const handleRowDragOver = (e: React.DragEvent, rowIdx: number) => { if (dragRow === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverRow(rowIdx); };
  const handleRowDrop = (e: React.DragEvent, rowIdx: number) => {
    e.preventDefault();
    if (dragRow === null || dragRow === rowIdx) { setDragRow(null); setDragOverRow(null); return; }
    setRowOrder(prev => {
      const order = [...prev]; const fromPos = order.indexOf(dragRow); const toPos = order.indexOf(rowIdx);
      if (fromPos === -1 || toPos === -1) return order;
      const [moved] = order.splice(fromPos, 1); order.splice(toPos, 0, moved); return order;
    });
    setDragRow(null); setDragOverRow(null);
  };
  const handleRowDragEnd = () => { setDragRow(null); setDragOverRow(null); };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, type: 'cell' | 'column' | 'row', colIdx?: number, rowIdx?: number) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, colIdx, rowIdx });
  };

  const setAlignment = (align: TextAlign) => {
    if (!contextMenu) return;
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) setCellAligns(prev => ({ ...prev, [`${rowIdx}-${colIdx}`]: align }));
    else if (type === 'column' && colIdx !== undefined) setColAligns(prev => ({ ...prev, [colIdx]: align }));
    else if (type === 'row' && rowIdx !== undefined) setRowAligns(prev => ({ ...prev, [rowIdx]: align }));
    setContextMenu(null);
  };

  const moveColumn = (direction: 'left' | 'right') => {
    if (!contextMenu || contextMenu.colIdx === undefined) return;
    const colIdx = contextMenu.colIdx;
    setColOrder(prev => {
      const order = [...prev]; const pos = order.indexOf(colIdx);
      if (pos === -1) return order;
      const newPos = direction === 'left' ? pos - 1 : pos + 1;
      if (newPos < 1 || newPos >= order.length) return order;
      const [moved] = order.splice(pos, 1); order.splice(newPos, 0, moved); return order;
    });
    setContextMenu(null);
  };

  const moveRow = (direction: 'up' | 'down') => {
    if (!contextMenu || contextMenu.rowIdx === undefined) return;
    const rowIdx = contextMenu.rowIdx;
    setRowOrder(prev => {
      const order = [...prev]; const pos = order.indexOf(rowIdx);
      if (pos === -1) return order;
      const newPos = direction === 'up' ? pos - 1 : pos + 1;
      if (newPos < 0 || newPos >= order.length) return order;
      const [moved] = order.splice(pos, 1); order.splice(newPos, 0, moved); return order;
    });
    setContextMenu(null);
  };

  const BG_COLORS = [
    { label: 'Amarelo', value: '#FEF9C3' }, { label: 'Verde', value: '#DCFCE7' },
    { label: 'Azul', value: '#DBEAFE' }, { label: 'Rosa', value: '#FCE7F3' },
    { label: 'Laranja', value: '#FED7AA' }, { label: 'Roxo', value: '#E9D5FF' },
    { label: 'Cinza', value: '#F3F4F6' },
  ];

  const toggleBold = () => {
    if (!contextMenu) return;
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) { const key = `${rowIdx}-${colIdx}`; setCellBold(prev => ({ ...prev, [key]: !prev[key] })); }
    else if (type === 'column' && colIdx !== undefined) setColBold(prev => ({ ...prev, [colIdx]: !prev[colIdx] }));
    else if (type === 'row' && rowIdx !== undefined) setRowBold(prev => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
    setContextMenu(null);
  };

  const toggleItalic = () => {
    if (!contextMenu) return;
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) { const key = `${rowIdx}-${colIdx}`; setCellItalic(prev => ({ ...prev, [key]: !prev[key] })); }
    else if (type === 'column' && colIdx !== undefined) setColItalic(prev => ({ ...prev, [colIdx]: !prev[colIdx] }));
    else if (type === 'row' && rowIdx !== undefined) setRowItalic(prev => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
    setContextMenu(null);
  };

  const setBgColor = (color: string) => {
    if (!contextMenu) return;
    const { type, colIdx, rowIdx } = contextMenu;
    if (type === 'cell' && colIdx !== undefined && rowIdx !== undefined) setCellBgColor(prev => ({ ...prev, [`${rowIdx}-${colIdx}`]: color }));
    else if (type === 'column' && colIdx !== undefined) setColBgColor(prev => ({ ...prev, [colIdx]: color }));
    else if (type === 'row' && rowIdx !== undefined) setRowBgColor(prev => ({ ...prev, [rowIdx]: color }));
    setContextMenu(null);
  };

  const deleteRow = (rowIdx: number) => {
    if (readOnly || rowIdx >= produtos.length) return;
    const updated = produtos.filter((_, i) => i !== rowIdx);
    if (onSave) onSave(updated);
    setContextMenu(null);
  };

  const addRow = () => {
    if (readOnly) return;
    const newProd: Produto = {
      codigo_interno: `NOVO-${Date.now().toString().slice(-4)}`,
      descricao: 'Novo Produto',
      codigo_barras: '',
    };
    const updated = [...produtos, newProd];
    if (onSave) onSave(updated);
  };

  const handleCopyFromMenu = () => { document.execCommand('copy'); setContextMenu(null); };
  const handlePasteFromMenu = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!activeCell || readOnly || !text) return;
      const lines = text.split('\n').map(l => l.split('\t'));
      for (let r = 0; r < lines.length; r++) {
        for (let c = 0; c < lines[r].length; c++) {
          const targetRow = activeCell.row + r;
          const targetCol = activeCell.col + c;
          if (targetRow >= produtos.length) continue;
          const colDef = orderedColDefs[targetCol];
          if (!colDef) continue;
          const origIdx = colDef.originalIdx;
          const isEditableEmpCol = origIdx >= 4 && editableColumn && (
            (origIdx < 4 + empresas.length && empresas[origIdx - 4] === editableColumn) ||
            (!empresas.includes(editableColumn) && origIdx === 4 + empresas.length)
          );
          if (isEditableEmpCol) onPriceChange?.(targetRow, lines[r][c]);
        }
      }
    } catch {}
    setContextMenu(null);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    if (contextMenu) { document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }
  }, [contextMenu]);

  const handleHeaderSort = useCallback((colIdx: number, origIdx: number) => {
    if (origIdx === 0 || origIdx > 3 + empresas.length * 2 + 1) return;
    if (sortCol === origIdx) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortCol(origIdx); setSortDir('asc'); }
  }, [sortCol, empresas.length]);

  const allRows = useMemo(() => {
    const rows = [...produtos.map((p, i) => ({ prod: p, idx: i, isEmpty: false }))];
    for (let i = 0; i < fillerRows; i++) rows.push({ prod: null as any, idx: produtos.length + i, isEmpty: true });
    return rows;
  }, [produtos, fillerRows]);

  const orderedRows = useMemo(() =>
    rowOrder.length === allRows.length ? rowOrder.map(i => allRows[i]).filter(Boolean) : allRows,
    [rowOrder, allRows]
  );

  const sortedRows = useMemo(() => {
    if (sortCol === null) return orderedRows;
    const dataRows = orderedRows.filter(r => !r.isEmpty);
    const emptyRows = orderedRows.filter(r => r.isEmpty);
    dataRows.sort((a, b) => {
      if (!a.prod || !b.prod) return 0;
      let valA = '', valB = '';
      if (sortCol === 1) { valA = a.prod.codigo_interno; valB = b.prod.codigo_interno; }
      else if (sortCol === 2) { valA = a.prod.descricao; valB = b.prod.descricao; }
      else if (sortCol === 3) { valA = a.prod.codigo_barras; valB = b.prod.codigo_barras; }
      else {
        const sortColDef = allColDefs.find(c => c.originalIdx === sortCol);
        if (sortColDef?.state && sortColDef?.empresa) {
          const prA = getPreco(sortColDef.empresa, sortColDef.state, a.prod.codigo_interno);
          const prB = getPreco(sortColDef.empresa, sortColDef.state, b.prod.codigo_interno);
          return (sortDir === 'asc' ? 1 : -1) * (parsePrice(prA as string | number) - parsePrice(prB as string | number));
        }
      }
      const cmp = valA.localeCompare(valB, 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return [...dataRows, ...emptyRows];
  }, [orderedRows, sortCol, sortDir, allColDefs, getPreco]);

  const getSelectionBorders = useCallback((row: number, col: number) => {
    const range = getSelectionRange();
    if (!range) return '';
    const selected = row >= range.minRow && row <= range.maxRow && col >= range.minCol && col <= range.maxCol;
    if (!selected) return '';
    const classes: string[] = [];
    if (row === range.minRow) classes.push('border-t-2 border-t-primary');
    if (row === range.maxRow) classes.push('border-b-2 border-b-primary');
    if (col === range.minCol) classes.push('border-l-2 border-l-primary');
    if (col === range.maxCol) classes.push('border-r-2 border-r-primary');
    return classes.join(' ');
  }, [getSelectionRange]);

  // Price markup state
  const [priceMarkups, setPriceMarkups] = useState<Record<string, number>>({});
  const [markupDialog, setMarkupDialog] = useState<{ empresa: string } | null>(null);
  const [markupValue, setMarkupValue] = useState('');
  const markupInputRef = useRef<HTMLInputElement>(null);

  // Add supplier column state
  const [showAddEmpresa, setShowAddEmpresa] = useState(false);
  const [newEmpresaName, setNewEmpresaName] = useState('');
  const [addEmpresaStep, setAddEmpresaStep] = useState<'name' | 'state'>('name');
  const addEmpresaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddEmpresa) {
      setAddEmpresaStep('name');
      setTimeout(() => addEmpresaInputRef.current?.focus(), 50);
    }
  }, [showAddEmpresa]);

  const handleAddEmpresa = async (states: string[]) => {
    const name = newEmpresaName.trim();
    if (!name || !onAddEmpresa || states.length === 0) return;
    if (empresas.includes(name)) {
      setShowAddEmpresa(false);
      setNewEmpresaName('');
      return;
    }
    await onAddEmpresa(name, states);
    setShowAddEmpresa(false);
    setNewEmpresaName('');
  };

  useEffect(() => {
    if (!listaId) return;
    const loadMarkups = async () => {
      const { data } = await supabase.from('price_markups').select('empresa, markup_percent').eq('lista_id', listaId).eq('user_id', user?.id ?? '');
      if (data && data.length > 0) {
        const loaded: Record<string, number> = {};
        data.forEach((row: any) => { loaded[row.empresa] = Number(row.markup_percent); });
        setPriceMarkups(loaded);
      }
    };
    loadMarkups();
  }, [listaId]);

  const saveMarkupToDb = async (empresa: string, percent: number) => {
    if (!listaId) return;
    if (percent === 0) await supabase.from('price_markups').delete().eq('lista_id', listaId).eq('empresa', empresa).eq('user_id', user?.id ?? '');
    else await supabase.from('price_markups').upsert({ lista_id: listaId, empresa, markup_percent: percent, updated_at: new Date().toISOString(), user_id: user?.id }, { onConflict: 'lista_id,empresa' });
  };

  useEffect(() => { if (markupDialog) setTimeout(() => markupInputRef.current?.focus(), 50); }, [markupDialog]);

  const applyMarkup = () => {
    if (!markupDialog) return;
    const pct = parseFloat(markupValue.replace(',', '.'));
    if (isNaN(pct)) { setMarkupDialog(null); setMarkupValue(''); return; }
    const newVal = (priceMarkups[markupDialog.empresa] || 0) + pct;
    setPriceMarkups(prev => ({ ...prev, [markupDialog.empresa]: newVal }));
    saveMarkupToDb(markupDialog.empresa, newVal);
    setMarkupDialog(null); setMarkupValue('');
  };

  const getMarkedUpPrice = useCallback((rawPrice: number, empresa: string): number => {
    const markup = priceMarkups[empresa];
    if (!markup) return rawPrice;
    return rawPrice * (1 + markup / 100);
  }, [priceMarkups]);

  const getContextEmpresa = (): string | null => {
    if (!contextMenu || contextMenu.colIdx === undefined) return null;
    const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
    return colDef?.empresa || null;
  };

  const calcUndercutPrice = (competitorPrice: number): number => {
    const cents = Math.round(competitorPrice * 100);
    for (let c = cents - 1; c >= cents - 5; c--) {
      const lastDigit = c % 10;
      if (lastDigit === 5 || lastDigit === 7 || lastDigit === 9) return c / 100;
    }
    for (let c = cents - 6; c >= cents - 10; c--) {
      const lastDigit = c % 10;
      if (lastDigit === 5 || lastDigit === 7 || lastDigit === 9) return c / 100;
    }
    return (cents - 1) / 100;
  };

  const handleCobrirConcorrentes = useCallback(() => {
    if (!contextMenu || contextMenu.colIdx === undefined) return;
    const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
    if (!colDef?.empresa || !colDef?.state) { setContextMenu(null); return; }
    const emp = colDef.empresa;
    const state = colDef.state;
    const newEdits: Record<string, string> = {};
    let changed = 0;

    for (let rowIdx = 0; rowIdx < produtos.length; rowIdx++) {
      const prod = produtos[rowIdx];
      const rawSel = getPreco(emp, state, prod.codigo_interno);
      const selPrice = parsePrice(rawSel as string | number);
      if (selPrice === Infinity || selPrice <= 0) continue;

      // Find lowest competitor price
      let minConc = Infinity;
      for (const otherEmp of empresas) {
        if (otherEmp === emp) continue;
        const rawOther = getPreco(otherEmp, state, prod.codigo_interno);
        const otherPrice = parsePrice(rawOther as string | number);
        if (otherPrice > 0 && otherPrice < Infinity && otherPrice < minConc) {
          minConc = otherPrice;
        }
      }

      // Only undercut if supplier lost (their price > lowest competitor)
      if (minConc === Infinity || selPrice <= minConc) continue;

      const undercutPrice = calcUndercutPrice(minConc);
      if (undercutPrice > 0 && undercutPrice < selPrice) {
        // Find the originalIdx for this empresa+state column
        const matchCol = allColDefs.find(c => c.empresa === emp && c.state === state);
        if (matchCol) {
          const editKey = `${rowIdx}-${matchCol.originalIdx}`;
          newEdits[editKey] = undercutPrice.toFixed(2).replace('.', ',');
          changed++;
        }
      }
    }

    if (changed > 0) {
      setCellEdits(prev => ({ ...prev, ...newEdits }));
      setHasUnsavedChanges(true);
    }
    setContextMenu(null);
  }, [contextMenu, orderedColDefs, allColDefs, produtos, empresas, getPreco]);

  // Toolbar
  const getSelectionTarget = (): { type: 'cell'; keys: string[] } | null => {
    const range = getSelectionRange();
    if (!range) return null;
    const keys: string[] = [];
    for (let r = range.minRow; r <= range.maxRow; r++) {
      for (let c = range.minCol; c <= range.maxCol; c++) {
        const colDef = orderedColDefs[c];
        if (colDef) keys.push(`${r}-${colDef.orderIdx}`);
      }
    }
    return { type: 'cell', keys };
  };

  const toolbarToggleBold = () => {
    const target = getSelectionTarget(); if (!target) return;
    const allB = target.keys.every(k => cellBold[k]);
    setCellBold(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = !allB; }); return next; });
  };
  const toolbarToggleItalic = () => {
    const target = getSelectionTarget(); if (!target) return;
    const allI = target.keys.every(k => cellItalic[k]);
    setCellItalic(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = !allI; }); return next; });
  };
  const toolbarSetAlign = (align: TextAlign) => {
    const target = getSelectionTarget(); if (!target) return;
    setCellAligns(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = align; }); return next; });
  };
  const toolbarSetBgColor = (color: string) => {
    const target = getSelectionTarget(); if (!target) return;
    setCellBgColor(prev => { const next = { ...prev }; target.keys.forEach(k => { next[k] = color; }); return next; });
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColorPicker]);

  const hasSelection = activeCell !== null;
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Render row
  const renderRow = useCallback((prod: Produto | null, idx: number, isEmpty: boolean, displayIdx: number) => {
    const lowestEmpByUf: Record<string, string | null> = {};
    if (prod) { for (const uf of ufs) lowestEmpByUf[uf] = getLowestEmpresa(prod.codigo_interno, uf); }
    const h = rowHeights[idx] || DEFAULT_ROW_HEIGHT;
    const isDragOver = dragOverRow === idx;

    return (
      <tr key={isEmpty ? `empty-${idx}` : idx} className={`group/row ${isDragOver ? 'border-t-2 border-t-primary' : ''}`} style={{ height: `${h}px` }}>
        <td
          className="border-r border-b px-0 text-center text-[11px] text-muted-foreground select-none relative cursor-grab active:cursor-grabbing"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: dragRow === idx ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
            minWidth: getColWidth(0), width: getColWidth(0),
          }}
          draggable
          onDragStart={e => handleRowDragStart(e, idx)}
          onDragOver={e => handleRowDragOver(e, idx)}
          onDrop={e => handleRowDrop(e, idx)}
          onDragEnd={handleRowDragEnd}
          onContextMenu={e => handleContextMenu(e, 'row', undefined, idx)}
        >
          <div className="relative h-full w-full flex items-center justify-center group/idx">
            {prod ? displayIdx + 1 : (produtos.length > 0 ? displayIdx + 1 : '')}
            {!readOnly && prod && (
              <button 
                onClick={(e) => { e.stopPropagation(); deleteRow(idx); }}
                className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/idx:opacity-100 text-red-500 hover:text-red-700 bg-white/80 rounded shadow-sm p-0.5 transition-opacity"
                title="Excluir Produto"
              >
                <Trash className="w-3 h-3" />
              </button>
            )}
          </div>
          <div
            className={`absolute left-0 right-0 bottom-[-2px] h-[5px] cursor-row-resize z-30 ${activeRowResize === idx ? 'bg-primary' : 'hover:bg-primary/40'}`}
            style={{ opacity: activeRowResize === idx ? 1 : undefined }}
            onMouseDown={e => handleRowResizeStart(e, idx)}
            onDoubleClick={() => handleRowAutoFit(idx)}
          />
        </td>

        {orderedColDefs.slice(1).map((col, renderIdx) => {
          const colIdx = col.orderIdx;
          const visualColIdx = renderIdx + 1;
          const effectiveAlign = getCellAlign(colIdx, idx, col.defaultAlign);
          const selected = isCellSelected(idx, visualColIdx);
          const active = isCellActive(idx, visualColIdx);
          const selBorders = getSelectionBorders(idx, visualColIdx);
          const fmt = getCellFormatting(colIdx, idx);

          const cellBaseClass = `border-r border-b px-2 ${alignClass(effectiveAlign)} ${fmt.bold ? 'font-bold' : ''} ${fmt.italic ? 'italic' : ''} ${selected && !active ? 'bg-primary/10' : ''} ${active ? 'outline outline-2 outline-primary outline-offset-[-2px]' : ''} ${selBorders}`;
          const cellBgStyle = fmt.bgColor && !selected ? { backgroundColor: fmt.bgColor } : {};
          const isEditing = editingCell?.row === idx && editingCell?.col === visualColIdx;

          const cellEvents = {
            onClick: (e: React.MouseEvent) => handleCellClick(idx, visualColIdx, e),
            onMouseDown: (e: React.MouseEvent) => handleCellMouseDown(idx, visualColIdx, e),
            onMouseEnter: () => handleCellMouseEnter(idx, visualColIdx),
            onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, 'cell', colIdx, idx),
            'data-cell': `${idx}-${visualColIdx}`,
          };

          if (isEmpty) {
            return (
              <td key={col.key} className={`${cellBaseClass} ${col.sticky ? 'sticky left-[36px] bg-background z-[5]' : ''}`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle }}
                {...cellEvents}>&nbsp;</td>
            );
          }

          const origIdx = col.originalIdx;
          if (origIdx >= 1 && origIdx <= 3) {
            const displayVal = getDisplayValue(idx, origIdx);
            const stickyClass = origIdx === 1 ? 'sticky left-[36px] bg-background z-[5]' : '';
            const extraClass = origIdx === 2 ? 'overflow-hidden text-ellipsis' : '';
            return (
              <td key={col.key} className={`${cellBaseClass} ${stickyClass} whitespace-nowrap ${extraClass} text-xs`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle }}
                {...cellEvents} onDoubleClick={() => handleCellDoubleClick(idx, visualColIdx, origIdx)}>
                {isEditing ? (
                  <input ref={editInputRef} type="text" className={`w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1 ${alignClass(effectiveAlign)} text-xs h-full`}
                    value={editingValue} onChange={e => setEditingValue(e.target.value)}
                    onBlur={() => commitEdit(origIdx)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(origIdx); if (e.key === 'Escape') cancelEdit(); }} />
                ) : displayVal}
              </td>
            );
          }

          if (col.isSeparator) {
            return <td key={col.key} className="border-r border-b bg-muted/30" style={{ borderColor: 'hsl(var(--border))', width: '8px', minWidth: '8px', maxWidth: '8px' }}>&nbsp;</td>;
          }

          if (col.state && col.empresa) {
            const emp = col.empresa;
            const state = col.state;
            const lowestEmp = lowestEmpByUf[state] ?? null;
            const isLowest = lowestEmp === emp;
            const isEditable = editableColumn === emp;
            const editKey = `${idx}-${origIdx}`;
            const hasEdit = cellEdits[editKey] !== undefined;
            return (
              <td key={col.key} className={`${cellBaseClass} px-1 whitespace-nowrap text-xs ${isEditable ? 'bg-primary/5' : isLowest ? 'bg-success/10 text-success font-bold' : ''}`}
                style={{ borderColor: 'hsl(var(--border))', minWidth: getColWidth(visualColIdx), width: getColWidth(visualColIdx), ...cellBgStyle }}
                {...cellEvents} onDoubleClick={() => handleCellDoubleClick(idx, visualColIdx, origIdx)}>
                {isEditable && !readOnly ? (
                  <input type="text" inputMode="decimal" className={`w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1 ${alignClass(effectiveAlign)} text-xs h-full`}
                    value={editPrices[idx] ?? ''} onChange={e => onPriceChange?.(idx, e.target.value)} placeholder="0,00" />
                ) : isEditing ? (
                  <input ref={editInputRef} type="text" inputMode="decimal" className={`w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1 ${alignClass(effectiveAlign)} text-xs h-full`}
                    value={editingValue} onChange={e => setEditingValue(e.target.value)}
                    onBlur={() => commitEdit(origIdx)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(origIdx); if (e.key === 'Escape') cancelEdit(); }} placeholder="0,00" />
                ) : (() => {
                  if (hasEdit) {
                    const editVal = cellEdits[editKey];
                    if (!editVal || editVal === '') return 'R$ -';
                    const num = parsePrice(editVal);
                    return num === Infinity ? editVal : `R$ ${Number(num).toFixed(2).replace('.', ',')}`;
                  }
                  const raw = getPreco(emp, state, prod!.codigo_interno);
                  if (raw === '' || raw === undefined || raw === null) return 'R$ -';
                  const num = parsePrice(raw as string | number);
                  if (num === Infinity) return raw;
                  const finalPrice = getMarkedUpPrice(num, emp);
                  return `R$ ${Number(finalPrice).toFixed(2).replace('.', ',')}`;
                })()}
              </td>
            );
          }

          return <td key={col.key} className={cellBaseClass} style={{ borderColor: 'hsl(var(--border))', ...cellBgStyle }} {...cellEvents}>&nbsp;</td>;
        })}
      </tr>
    );
  }, [orderedColDefs, getColWidth, getLowestEmpresa, editingCell, editingValue, cellEdits, getPreco, getMarkedUpPrice,
      isCellSelected, isCellActive, getSelectionBorders, editableColumn, editPrices, readOnly, rowHeights,
      dragOverRow, dragRow, activeRowResize, produtos, getDisplayValue, handleCellClick, handleCellMouseDown,
      handleCellMouseEnter, handleCellDoubleClick, commitEdit, cancelEdit, onPriceChange, ufs]);

  // Filtered rows for search + winner filter
  const displayRows = useMemo(() => {
    let rows = sortedRows;
    if (winnerFilter) {
      rows = rows.filter(row => {
        if (row.isEmpty || !row.prod) return false;
        return getLowestEmpresa(row.prod.codigo_interno, winnerFilter.state) === winnerFilter.empresa;
      });
    }
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(row => {
      if (row.isEmpty || !row.prod) return true;
      return row.prod.codigo_interno.toLowerCase().includes(term) ||
        row.prod.descricao.toLowerCase().includes(term) ||
        row.prod.codigo_barras.toLowerCase().includes(term);
    });
  }, [sortedRows, searchTerm, winnerFilter, getLowestEmpresa]);


  return (
    <div className="flex-1 flex flex-col" style={{ border: '1px solid hsl(var(--border))' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/50 flex-wrap" style={{ borderColor: 'hsl(var(--border))' }}>
        {!readOnly && (
          <>
            <button onClick={addRow}
              className="p-1.5 rounded hover:bg-accent transition-colors flex items-center gap-1 text-xs text-blue-600 font-bold" title="Adicionar Novo Produto">
              <Plus className="w-4 h-4" /><span>Novo Item</span>
            </button>
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}
        <button onClick={toolbarToggleBold} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Negrito">
          <Bold className="w-4 h-4" />
        </button>
        <button onClick={toolbarToggleItalic} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Itálico">
          <Italic className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => toolbarSetAlign('left')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Alinhar à Esquerda">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={() => toolbarSetAlign('center')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Centralizar">
          <AlignCenter className="w-4 h-4" />
        </button>
        <button onClick={() => toolbarSetAlign('right')} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors" title="Alinhar à Direita">
          <AlignRight className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <div className="relative">
          <button onClick={() => setShowColorPicker(!showColorPicker)} disabled={!hasSelection} className="p-1.5 rounded hover:bg-accent disabled:opacity-40 transition-colors flex items-center gap-1" title="Cor de Fundo">
            <Paintbrush className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div ref={colorPickerRef} className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg p-2 z-50 flex gap-1 flex-wrap w-[140px]">
              {BG_COLORS.map(c => (
                <button key={c.value} onClick={() => { toolbarSetBgColor(c.value); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c.value }} title={c.label} />
              ))}
              <button onClick={() => { toolbarSetBgColor(''); setShowColorPicker(false); }}
                className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center bg-background" title="Remover cor">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        {onSave && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={handleSave} disabled={!hasUnsavedChanges}
              className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs ${hasUnsavedChanges ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-accent disabled:opacity-40'}`}
              title="Salvar alterações">
              <Save className="w-4 h-4" /><span className="hidden sm:inline">Salvar</span>
            </button>
          </>
        )}

        {/* State Filter Toggle */}
        {empresas.length > 0 && ufs.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <div className="flex items-center gap-0.5 bg-background border border-border rounded-md p-0.5">
              {ufs.map(uf => (
                <button
                  key={uf}
                  onClick={() => setStateFilter(uf)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                    stateFilter === uf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {uf}
                </button>
              ))}
              <button
                onClick={() => setStateFilter(ALL_STATES)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  stateFilter === ALL_STATES ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Todos
              </button>
            </div>
          </>
        )}

        {/* Add Supplier */}
        {onAddEmpresa && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={() => setShowAddEmpresa(true)}
              className="p-1.5 rounded hover:bg-accent transition-colors flex items-center gap-1 text-xs" title="Adicionar Fornecedor">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Fornecedor</span>
            </button>
          </>
        )}

        {winnerFilter && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={() => setWinnerFilter(null)}
              className="px-2 py-1 rounded bg-success/15 text-success text-[10px] font-bold flex items-center gap-1"
              title="Remover filtro">
              <Filter className="w-3 h-3" /> Ganhos: {winnerFilter.empresa} ({winnerFilter.state})
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>


      {/* Spreadsheet */}
      <div ref={containerRef} className="flex-1 overflow-auto relative" tabIndex={0}>
        <table ref={tableRef} className="border-collapse text-sm"
          style={{ tableLayout: 'fixed', fontFamily: 'var(--font-body)', fontSize: '12px' }}>
          <colgroup>
            {orderedColDefs.map((col, i) => {
              if (col.isSeparator) return <col key={col.key} style={{ width: '8px' }} />;
              return <col key={col.key} style={{ width: `${getColWidth(i)}px` }} />;
            })}
          </colgroup>

          <thead className="sticky top-0 z-10">
            <tr style={{ height: `${HEADER_HEIGHT}px` }}>
              {orderedColDefs.map((col, i) => {
                const colIdx = col.orderIdx;
                const isDragOverCol = dragOverCol === colIdx;
                if (col.isSeparator) {
                  return <th key={col.key} className="border-r border-b bg-muted/30"
                    style={{ borderColor: 'hsl(var(--border))', width: '8px', minWidth: '8px', maxWidth: '8px', height: HEADER_HEIGHT }} />;
                }
                return (
                  <th key={col.key}
                    className={`border-r border-b px-2 font-semibold whitespace-nowrap relative select-none text-[11px] ${
                      getCellAlign(colIdx, -1, col.defaultAlign) === 'left' ? 'text-left' : getCellAlign(colIdx, -1, col.defaultAlign) === 'right' ? 'text-right' : 'text-center'
                    } ${col.sticky ? 'sticky left-[36px] z-20' : ''} ${
                      col.highlight ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    } ${isDragOverCol ? 'border-l-2 border-l-primary' : ''}`}
                    style={{
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: col.highlight ? undefined : dragCol === colIdx ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
                      height: HEADER_HEIGHT,
                      cursor: i > 0 && !col.isSeparator ? 'grab' : 'default',
                    }}
                    draggable={i > 0 && !col.isSeparator}
                    onDragStart={e => handleColDragStart(e, colIdx)}
                    onDragOver={e => handleColDragOver(e, colIdx)}
                    onDrop={e => handleColDrop(e, colIdx)}
                    onDragEnd={handleColDragEnd}
                    onContextMenu={e => handleContextMenu(e, 'column', colIdx)}
                    onClick={() => i > 0 && handleHeaderSort(colIdx, col.originalIdx)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortCol === col.originalIdx && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                    {col.empresa && priceMarkups[col.empresa] ? (
                      <span className="ml-1 text-[9px] opacity-70">(+{priceMarkups[col.empresa].toFixed(1)}%)</span>
                    ) : null}
                    {col.empresa && col.state ? (
                      <div className="text-[8px] leading-tight font-bold opacity-80 uppercase tracking-wide">
                        {tipoPrecoLabel(tipoPrecoMap[`${col.empresa}_${col.state}`] ?? (col.state === 'GO' ? 'NOTA' : 'IPI_ST'))}
                        {' · '}
                        {tipoPrecoMap[`${col.empresa}_${col.state}_FRETE`] ?? 'CIF'}
                      </div>
                    ) : null}

                    <div
                      className={`absolute top-0 bottom-0 w-[4px] cursor-col-resize z-30 ${activeColResize === i ? 'bg-primary' : 'hover:bg-primary/50'}`}
                      style={{ right: '-2px' }}
                      onMouseDown={e => handleColResizeStart(e, i)}
                      onDoubleClick={() => handleColAutoFit(i)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, displayIdx) => renderRow(row.prod, row.idx, row.isEmpty, displayIdx))}
          </tbody>
        </table>

        {/* Context Menu */}
        {contextMenu && (
          <div ref={contextMenuRef} className="fixed bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={handleCopyFromMenu} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Copy className="w-3.5 h-3.5" /> Copiar (Ctrl+C)
            </button>
            {!readOnly && (
              <button onClick={handlePasteFromMenu} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                <ClipboardPaste className="w-3.5 h-3.5" /> Colar (Ctrl+V)
              </button>
            )}
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Alinhamento {contextMenu.type === 'column' ? 'da Coluna' : contextMenu.type === 'row' ? 'da Linha' : 'da Célula'}
            </div>
            <button onClick={() => setAlignment('left')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignLeft className="w-3.5 h-3.5" /> Alinhar à Esquerda
            </button>
            <button onClick={() => setAlignment('center')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignCenter className="w-3.5 h-3.5" /> Centralizar
            </button>
            <button onClick={() => setAlignment('right')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <AlignRight className="w-3.5 h-3.5" /> Alinhar à Direita
            </button>
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Formatação</div>
            <button onClick={toggleBold} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Bold className="w-3.5 h-3.5" /> Negrito
            </button>
            <button onClick={toggleItalic} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
              <Italic className="w-3.5 h-3.5" /> Itálico
            </button>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Cor de Fundo</div>
            <div className="flex gap-1 px-3 py-1 flex-wrap">
              {BG_COLORS.map(c => (
                <button key={c.value} onClick={() => setBgColor(c.value)}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c.value }} title={c.label} />
              ))}
              <button onClick={() => setBgColor('')} className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center bg-background" title="Remover cor">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <div className="border-t border-border my-1" />

            {(() => {
              const emp = getContextEmpresa();
              if (!emp) return null;
              return (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preços</div>
                  <button onClick={() => { setMarkupDialog({ empresa: emp }); setMarkupValue(''); setContextMenu(null); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                    <Percent className="w-3.5 h-3.5" /> Acrescentar %
                    {priceMarkups[emp] ? <span className="ml-auto text-[10px] text-muted-foreground">({priceMarkups[emp] > 0 ? '+' : ''}{priceMarkups[emp].toFixed(1)}%)</span> : null}
                  </button>
                  {priceMarkups[emp] ? (
                    <button onClick={() => { setPriceMarkups(prev => { const next = { ...prev }; delete next[emp]; return next; }); saveMarkupToDb(emp, 0); setContextMenu(null); }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-destructive">
                      <X className="w-3.5 h-3.5" /> Remover acréscimo
                    </button>
                  ) : null}
                  <button onClick={handleCobrirConcorrentes}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                    <Swords className="w-3.5 h-3.5" /> Cobrir concorrentes
                  </button>
                  {(() => {
                    const cd = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
                    const st = cd?.state as string | undefined;
                    if (!st) return null;
                    const isActive = winnerFilter?.empresa === emp && winnerFilter?.state === st;
                    return (
                      <button onClick={() => { setWinnerFilter(isActive ? null : { empresa: emp, state: st }); setContextMenu(null); }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                        <Filter className="w-3.5 h-3.5" /> {isActive ? 'Remover filtro de ganhos' : `Filtrar itens ganhos (${st})`}
                      </button>
                    );
                  })()}

                  <div className="border-t border-border my-1" />
                </>
              );
            })()}

            {(contextMenu.type === 'column' || contextMenu.type === 'cell') && contextMenu.colIdx !== undefined && contextMenu.colIdx > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Coluna</div>
                <button onClick={() => moveColumn('left')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowLeft className="w-3.5 h-3.5" /> Mover para Esquerda
                </button>
                <button onClick={() => moveColumn('right')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowRight className="w-3.5 h-3.5" /> Mover para Direita
                </button>
                {(() => {
                  const colDef = orderedColDefs.find(c => c.orderIdx === contextMenu.colIdx);
                  if (colDef && colDef.empresa && colDef.isData && colDef.key !== 'cod_int' && colDef.key !== 'desc' && colDef.key !== 'cod_bar') {
                    return (
                      <button
                        onClick={async () => {
                          if (onDeleteResposta && colDef.empresa) {
                            if (window.confirm(`Excluir permanentemente os dados de "${colDef.empresa}"?`)) {
                              await onDeleteResposta(colDef.empresa);
                            }
                          }
                          setContextMenu(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir Coluna
                      </button>
                    );
                  }
                  return null;
                })()}
              </>
            )}

            {(contextMenu.type === 'row' || contextMenu.type === 'cell') && contextMenu.rowIdx !== undefined && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mover Linha</div>
                <button onClick={() => moveRow('up')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowUp className="w-3.5 h-3.5" /> Mover para Cima
                </button>
                <button onClick={() => moveRow('down')} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground">
                  <ArrowDown className="w-3.5 h-3.5" /> Mover para Baixo
                </button>
              </>
            )}
          </div>
        )}

        {/* Markup Dialog */}
        {markupDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setMarkupDialog(null)}>
            <div className="bg-popover border border-border rounded-lg shadow-xl p-4 w-72" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground mb-1">Acrescentar %</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Fornecedor: <span className="font-bold text-foreground">{markupDialog.empresa}</span>
                {priceMarkups[markupDialog.empresa] ? <span className="ml-1">(acréscimo atual: {priceMarkups[markupDialog.empresa]}%)</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input ref={markupInputRef} type="text" inputMode="decimal"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={markupValue} onChange={e => setMarkupValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') applyMarkup(); if (e.key === 'Escape') setMarkupDialog(null); }}
                    placeholder="Ex: 10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <button onClick={applyMarkup} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Empresa Dialog */}
        {showAddEmpresa && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setShowAddEmpresa(false)}>
            <div className="bg-popover border border-border rounded-lg shadow-xl p-4 w-80" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground mb-1">Adicionar Fornecedor</h3>
              {addEmpresaStep === 'name' ? (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Digite o nome do fornecedor para criar uma nova coluna na planilha.
                  </p>
                  <div className="flex items-center gap-2">
                    <input ref={addEmpresaInputRef} type="text"
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={newEmpresaName} onChange={e => setNewEmpresaName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newEmpresaName.trim()) setAddEmpresaStep('state');
                        if (e.key === 'Escape') setShowAddEmpresa(false);
                      }}
                      placeholder="Nome do fornecedor" />
                    <button onClick={() => setAddEmpresaStep('state')} disabled={!newEmpresaName.trim()}
                      className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                      Próximo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Em qual estado deseja adicionar a coluna para <span className="font-bold text-foreground">{newEmpresaName.trim()}</span>?
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {userEstados.map(uf => (
                      <button key={uf} onClick={() => handleAddEmpresa([uf])}
                        className="h-10 rounded-md border border-input bg-background hover:bg-accent text-sm font-bold transition-colors">
                        {uf}
                      </button>
                    ))}
                    {userEstados.length > 1 && (
                      <button onClick={() => handleAddEmpresa(userEstados)}
                        className="h-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold transition-colors">
                        Todos
                      </button>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setAddEmpresaStep('name')}
                      className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                      ← Voltar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpreadsheetTable;
